"""
OpenAI API 기반 발주 인사이트 생성.

Model A(판매 예측) + Model B(발주 추정) + 날씨 예보 데이터를
3~5줄 자연어 권장문으로 변환한다.

workflow_check.md Step 7: 발주 대응 전략 자동 생성
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import pandas as pd


SYSTEM_PROMPT = """당신은 (주)지엘 하루온의 핫팩 재고관리 전문가입니다.
아래 데이터를 바탕으로 **발주 대응 권장사항**을 한국어 3~5줄로 작성하세요.

■ 데이터 해석 규칙 (매우 중요)

1. Model A "예측 판매량"은 판매 예측치이지 납품(발주)량이 아닙니다.
   권장 발주량은 반드시 컨텍스트의 "Model B 예상 발주요청량"을 기준으로 산출하세요.
   Model B 값이 없으면 컨텍스트의 "fallback_ratio" 값을 판매 예측 총량에 곱하세요.
   (fallback_ratio는 최근 4주 실측 납품/판매 비율이며, 없을 경우에만 0.6 사용)

2. 제품 카테고리별 월별 계수를 반드시 적용하세요:
   - 각 제품에는 "[카테고리]: N개 (XX%) | 4월 계수 0.0524" 형식으로 카테고리와 월 계수가 제공됩니다.
   - 이 계수는 daily_performance 실데이터 기반(12월=1.00 정규화, 2025-04 이상치 제외)입니다.
   - [붙이는 핫팩]은 비시즌에도 수요가 존재해 다른 카테고리 대비 계수가 큽니다.
     다만 실측 상관계수 -0.79로 기온 민감도 자체는 오히려 가장 강하므로
     "기온과 무관한 연중 수요"로 단정하지 마세요.
   - [손난로] / [찜질팩] / [일반 핫팩]은 겨울 전용이며 비시즌 계수가 매우 작습니다.
   - 이 값들이 이미 계절성을 반영하므로 기온·한파 근거로 추가 조정하지 마세요.

3. 제품명을 사용하세요:
   - "SKU 63216406" 같은 숫자 코드로 지칭하지 말고 반드시 제품명(예: "하루온 붙이는 핫팩 50g")을 쓰세요.
   - 괄호 안에 카테고리 태그를 함께 표기하세요 (예: "하루온 붙이는 핫팩 50g [붙이는 핫팩]").

■ 작성 규칙

- 숫자는 천 단위 콤마 사용 (예: 2,600개)
- 핵심 수치를 근거로 제시 (예: "4월 계절 계수 0.014 — 성수기 대비 1.4%")
- 긴급도를 명시 (즉시 대응 / 사전 준비 / 참고)
- 마지막 줄에 한 줄 요약 (예: "권장: 하루온 붙이는 핫팩 50g 2,600개, ... 납품 준비")

■ 마지막 줄 권장량 계산 공식 (반드시 이 공식으로 계산, 50 단위 반올림)

- 기준량 = Model B 예상 발주요청량 (없으면 판매 예측 총량 × fallback_ratio)
  - fallback_ratio: 컨텍스트의 "fallback_ratio" 값 (최근 4주 납품/판매 실측).
    값이 제공되지 않을 때만 0.6 사용 (근거 부재, 임시 상수)
- 모든 제품: 기준량 × (해당 제품 비중% / 100) × 해당 제품의 월별 계수
- 월별 계수는 각 제품 줄에 "| {current_month}월 계수 0.XXXX" 형태로 이미 제공됩니다.

규칙:
- 판매 예측치(컨텍스트의 "X개" 값)를 그대로 발주량으로 인용하지 마세요.
- 상위 3개 제품만 요약에 포함하세요.
- 계산 결과가 50 미만이면 "발주 대상 아님(월 수요 미미)"으로 표기하세요.
"""


# ─────────────────────────────────────────────
# 제품 카테고리 판정 (제품명 키워드 기반)
# ─────────────────────────────────────────────
def _product_category(name: str) -> str:
    """제품명에서 제품군을 판정. 태그는 프롬프트와 화면 표기에 사용."""
    if not name:
        return "일반 핫팩"
    if any(kw in name for kw in ("붙이는", "패치", "파스")):
        return "붙이는 핫팩"  # 의료용·연중수요
    if "찜질" in name:
        return "찜질팩"  # 겨울시즌
    if "손난로" in name or "군인" in name or "보온대" in name:
        return "손난로"  # 겨울시즌
    return "일반 핫팩"  # 겨울시즌


def _is_low_seasonal(category: str) -> bool:
    """카테고리가 의료용/연중수요인지."""
    return category == "붙이는 핫팩"


# ─────────────────────────────────────────────
# 카테고리별 월별 계절 계수 (12월=1.00 기준)
#
# 출처: daily_performance 실데이터(2025-04 ~ 2026-04)를 vendor_item_name 키워드로
#   카테고리 분류 후 카테고리별 monthly_sales / december_sales 계산.
#
# 이상치 처리: 2025-04는 데이터 시작 시점으로 SKU 라인업 미완(붙이는 핫팩 95개만
#   판매됨. 2026-04 동일 기간 대비 1/70 수준)이어서 통계에서 제외.
#
# 한계:
#   - 1년치 단일 샘플이라 월별 분산 추정 불가.
#   - 카테고리별 집계이지만 SKU 단위 편차는 반영 못함.
#   TODO(계산 이상 ③ / 2년치 누적 후): 현재 카테고리 단위 계수라서 같은 카테고리
#     내 SKU 간 편차(예: "붙이는 핫팩 50g" vs "붙이는 핫팩 100g")를 반영 못함.
#     월별 평균·분산 산출, 카테고리×SKU 2단계 계수 재구축 필요.
# ─────────────────────────────────────────────
CATEGORY_MONTHLY_FACTOR: dict[str, dict[int, float]] = {
    "붙이는 핫팩": {  # 비시즌에도 수요 존재(의료용 포함). 기온 상관 -0.79로 겨울 민감도 동시 강함
        1: 1.2996, 2: 0.4188, 3: 0.2186, 4: 0.0524,
        5: 0.0007, 6: 0.0085, 7: 0.0161, 8: 0.0212, 9: 0.0245,
        10: 0.2596, 11: 0.7371, 12: 1.0000,
    },
    "손난로": {  # 겨울시즌. 비시즌 거의 0
        1: 0.5415, 2: 0.0561, 3: 0.0128, 4: 0.0015,
        5: 0.0028, 6: 0.0016, 7: 0.0006, 8: 0.0009, 9: 0.0011,
        10: 0.0829, 11: 0.4580, 12: 1.0000,
    },
    "일반 핫팩": {  # 겨울시즌. 1월이 12월보다 높음
        1: 2.0906, 2: 0.5432, 3: 0.0104, 4: 0.0028,
        5: 0.0061, 6: 0.0374, 7: 0.3774, 8: 0.1701, 9: 0.0356,
        10: 0.0713, 11: 0.3158, 12: 1.0000,
    },
    "찜질팩": {  # 근육통 등 연중 의료용 + 겨울. 11월 피크
        1: 0.6725, 2: 0.0174, 3: 0.0580, 4: 0.0377,
        5: 0.2609, 6: 0.1420, 7: 0.1449, 8: 0.2551, 9: 0.3942,
        10: 0.8319, 11: 1.1594, 12: 1.0000,
    },
}


def _month_factor(category: str, month: int | None = None) -> float:
    """카테고리 × 월에 해당하는 계절 계수 반환."""
    m = month if month is not None else datetime.now().month
    return CATEGORY_MONTHLY_FACTOR.get(category, CATEGORY_MONTHLY_FACTOR["일반 핫팩"]).get(m, 0.01)


@dataclass
class InsightContext:
    """인사이트 생성을 위한 요약 컨텍스트."""

    forecast_period: str  # "2026-04-14 ~ 2026-05-04"
    total_predicted_qty: int  # 전체 SKU 합산 예측 판매량
    top_skus: list[dict[str, Any]]  # [{sku, name, qty, pct, category, month_factor}] 상위 5
    weather_summary: str  # "평균기온 12℃, 최저 3℃, 한파 0일"
    model_b_order_qty: int | None  # Model B 카테고리 발주 추정
    stockout_rate: float | None  # 최근 품절률
    confidence_range: str  # "90% 신뢰구간 ±1,046"
    season: str  # "비시즌(봄)" or "성수기(겨울)"
    current_month: int  # 현재 월
    fallback_ratio: float | None = None  # 최근 4주 납품/판매 실측 비율 (Model B 없을 때 Model A × 이 값)


def _compute_stockout_warn_threshold() -> float:
    """바이박스 실데이터 주별 품절률 3사분위(Q75)를 동적 임계로 사용."""
    from pathlib import Path as _P
    try:
        import sys
        sys.path.insert(0, str(_P(__file__).resolve().parents[1]))
        from data_pipeline.bi_box_loader import load_bi_box_all
        from data_pipeline.weekly_feature_builder import WARMER_SKUS
        import pandas as _pd
        bb = load_bi_box_all(skus=WARMER_SKUS)
        if bb.empty:
            return 0.3
        weekly_rate = bb.groupby(bb["date"].dt.to_period("W"))["is_stockout"].mean()
        return float(weekly_rate.quantile(0.75))
    except Exception:
        return 0.3  # fallback


def _compute_confidence_range() -> str:
    """
    val_mae를 최근 winter_validation_result.json에서 동적으로 읽어 90% 신뢰구간 폭 반환.

    주의: 이 MAE는 SKU×주 단위이며, 카테고리 합산 발주량에는 직접 적용 불가.
    참고용 표기에만 사용. 실측 결과 파일 없으면 "측정 불가"로 반환.
    """
    import json
    from pathlib import Path as _P
    result_path = _P("data/processed/winter_validation_result.json")
    if not result_path.exists():
        return "신뢰구간 측정 불가 (winter_validation_result.json 부재)"
    try:
        data = json.loads(result_path.read_text(encoding="utf-8"))
        val_mae = data.get("A_no_synthetic", {}).get("val_mae")
        if val_mae is None:
            return "신뢰구간 측정 불가 (val_mae 키 없음)"
        margin = int(round(float(val_mae) * 1.645))  # [B] 정규분포 90% z값
        return f"Model A 판매 예측 SKU×주 MAE 기반 ±{margin:,} (발주 권장에는 직접 적용 불가)"
    except Exception as ex:
        return f"신뢰구간 측정 불가 ({ex})"


def build_insight_context_from_local(
    forecast_csv: str = "data/processed/forecast_round4.csv",
    model_b_csv: str = "data/processed/model_b_category_forecast.csv",
    weather_cache: str = "data/processed/asos_weather_cache.csv",
    bi_box_dir: str = "data/raw/coupang/bi_box",
) -> InsightContext:
    """로컬 CSV 산출물에서 인사이트 컨텍스트를 조립."""
    from pathlib import Path

    # Model A 예측
    forecast_df = pd.read_csv(forecast_csv, parse_dates=["week_start"])
    today = pd.Timestamp.today().normalize()
    future = forecast_df[forecast_df["week_start"] >= today]

    total_qty = int(future["weekly_sales_qty_forecast"].sum())
    period = (
        f"{future['week_start'].min().date()} ~ {future['week_start'].max().date()}"
        if not future.empty else "N/A"
    )

    # SKU → 제품명 매핑
    from pathlib import Path as _Path
    sku_name_map: dict[int, str] = {}
    if _Path(bi_box_dir).exists():
        try:
            import sys as _sys
            _sys.path.insert(0, str(_Path(__file__).resolve().parents[1]))
            from data_pipeline.bi_box_loader import build_sku_name_map
            from data_pipeline.weekly_feature_builder import WARMER_SKUS
            sku_name_map = build_sku_name_map(directory=bi_box_dir, skus=WARMER_SKUS)
        except Exception:
            pass

    # 상위 SKU
    sku_totals = (
        future.groupby("sku")["weekly_sales_qty_forecast"]
        .sum()
        .sort_values(ascending=False)
        .head(5)
    )
    total_for_pct = sku_totals.sum() or 1
    current_month = datetime.now().month
    top_skus = []
    for s, q in sku_totals.items():
        name = sku_name_map.get(int(s), f"SKU {int(s)}")
        category = _product_category(name)
        top_skus.append({
            "sku": int(s),
            "name": name,
            "qty": int(q),
            "pct": round(q / total_for_pct * 100, 1),
            "category": category,
            "low_seasonal": _is_low_seasonal(category),
            "month_factor": round(_month_factor(category, current_month), 4),
        })

    # 날씨 (미래 16일 or 최근)
    weather_summary = "데이터 없음"
    weather_path = Path(weather_cache)
    if weather_path.exists():
        w = pd.read_csv(weather_path, parse_dates=["date"])
        recent = w[w["date"] >= today - pd.Timedelta(days=7)]
        if not recent.empty:
            weather_summary = (
                f"최근 7일 평균기온 {recent['temp_mean'].mean():.1f}℃, "
                f"최저 {recent['temp_min'].min():.1f}℃, "
                f"강수 {recent['rain_mm'].sum():.0f}mm"
            )

    # Model B
    model_b_qty = None
    if Path(model_b_csv).exists():
        mb = pd.read_csv(model_b_csv, parse_dates=["week_start"])
        future_mb = mb[mb["week_start"] >= today]
        if not future_mb.empty:
            model_b_qty = int(future_mb["pred_ratio"].sum())

    # 품절률 (바이박스)
    stockout_rate = None
    bi_box_path = Path(bi_box_dir)
    if bi_box_path.exists():
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from data_pipeline.bi_box_loader import load_bi_box_all
        from data_pipeline.weekly_feature_builder import WARMER_SKUS

        try:
            bb = load_bi_box_all(directory=bi_box_dir, skus=WARMER_SKUS)
            recent_bb = bb[bb["date"] >= today - pd.Timedelta(days=14)]
            if not recent_bb.empty:
                stockout_rate = float(recent_bb["is_stockout"].mean())
        except Exception:
            pass

    month = datetime.now().month
    season = "성수기(겨울)" if month in (10, 11, 12, 1, 2) else "비시즌(봄/여름/가을)"

    return InsightContext(
        forecast_period=period,
        total_predicted_qty=total_qty,
        top_skus=top_skus,
        weather_summary=weather_summary,
        model_b_order_qty=model_b_qty,
        stockout_rate=stockout_rate,
        confidence_range=_compute_confidence_range(),
        season=season,
        current_month=current_month,
    )


def build_insight_context_from_supabase(client) -> InsightContext | None:
    """
    Supabase 테이블들에서 인사이트 컨텍스트 조립.

    소스:
      - forecast_model_a : Model A 미래 예측 (상위 SKU)
      - forecast_model_b : Model B 카테고리 총량 (sku_id NULL)
      - v_weather_hybrid : 최근 7일 날씨
      - bi_box_daily     : 제품명 + 품절률

    Returns:
        InsightContext, 또는 필수 데이터 부족 시 None (호출부에서 CSV로 fallback)
    """
    today = pd.Timestamp.today().normalize()

    # Model A 미래 예측
    res = (
        client.table("forecast_model_a")
        .select("sku_id,week_start,weekly_sales_qty_forecast")
        .gte("week_start", today.date().isoformat())
        .order("week_start").limit(500).execute()
    )
    fa = pd.DataFrame(res.data or [])
    if fa.empty:
        return None
    fa["week_start"] = pd.to_datetime(fa["week_start"])
    fa["weekly_sales_qty_forecast"] = pd.to_numeric(fa["weekly_sales_qty_forecast"], errors="coerce").fillna(0)

    total_qty = int(fa["weekly_sales_qty_forecast"].sum())
    period = (
        f"{fa['week_start'].min().date()} ~ {fa['week_start'].max().date()}"
        if not fa.empty else "N/A"
    )

    # 상위 SKU
    sku_totals = (
        fa.groupby("sku_id")["weekly_sales_qty_forecast"].sum()
        .sort_values(ascending=False).head(5)
    )
    total_for_pct = sku_totals.sum() or 1

    # 제품명 매핑 (Supabase bi_box_daily)
    try:
        from data_pipeline.bi_box_loader import build_sku_name_map
    except ImportError:
        from services.api.data_pipeline.bi_box_loader import build_sku_name_map
    sku_list_int = [int(s) for s in sku_totals.index]
    name_map = build_sku_name_map(skus=sku_list_int, client=client)

    current_month = datetime.now().month
    top_skus = []
    for sku_str, q in sku_totals.items():
        try:
            sku_int = int(sku_str)
        except (TypeError, ValueError):
            continue
        name = name_map.get(sku_int, f"SKU {sku_int}")
        category = _product_category(name)
        top_skus.append({
            "sku": sku_int,
            "name": name,
            "qty": int(q),
            "pct": round(q / total_for_pct * 100, 1),
            "category": category,
            "low_seasonal": _is_low_seasonal(category),
            "month_factor": round(_month_factor(category, current_month), 4),
        })

    # 날씨 (v_weather_hybrid 최근 7일)
    weather_summary = "데이터 없음"
    try:
        start = (today - pd.Timedelta(days=7)).date().isoformat()
        end = today.date().isoformat()
        wres = (
            client.table("v_weather_hybrid")
            .select("weather_date,temp_avg,temp_min,rain")
            .gte("weather_date", start).lte("weather_date", end)
            .execute()
        )
        wdf = pd.DataFrame(wres.data or [])
        if not wdf.empty:
            wdf["temp_avg"] = pd.to_numeric(wdf["temp_avg"], errors="coerce")
            wdf["temp_min"] = pd.to_numeric(wdf["temp_min"], errors="coerce")
            wdf["rain"] = pd.to_numeric(wdf["rain"], errors="coerce").fillna(0)
            weather_summary = (
                f"최근 7일 평균기온 {wdf['temp_avg'].mean():.1f}℃, "
                f"최저 {wdf['temp_min'].min():.1f}℃, "
                f"강수 {wdf['rain'].sum():.0f}mm"
            )
    except Exception:
        pass

    # Model B 미래 발주량
    model_b_qty = None
    try:
        bres = (
            client.table("forecast_model_b")
            .select("pred_ratio,week_start")
            .is_("sku_id", "null")
            .gte("week_start", today.date().isoformat())
            .execute()
        )
        bdf = pd.DataFrame(bres.data or [])
        if not bdf.empty:
            bdf["pred_ratio"] = pd.to_numeric(bdf["pred_ratio"], errors="coerce").fillna(0)
            model_b_qty = int(bdf["pred_ratio"].sum())
    except Exception:
        pass

    # 최근 2주 품절률 (bi_box_daily)
    stockout_rate = None
    try:
        start2 = (today - pd.Timedelta(days=14)).date().isoformat()
        sres = (
            client.table("bi_box_daily")
            .select("is_stockout").gte("date", start2).execute()
        )
        sdata = sres.data or []
        if sdata:
            total = len(sdata)
            stockouts = sum(1 for r in sdata if r.get("is_stockout"))
            stockout_rate = stockouts / total
    except Exception:
        pass

    season = "성수기(겨울)" if current_month in (10, 11, 12, 1, 2) else "비시즌(봄/여름/가을)"

    # fallback_ratio: 최근 4주 "카테고리 총 납품(Model B) / 판매 예측 총합(Model A)" 실측 비율
    fallback_ratio = _compute_fallback_ratio_from_supabase(client)

    return InsightContext(
        forecast_period=period,
        total_predicted_qty=total_qty,
        top_skus=top_skus,
        weather_summary=weather_summary,
        model_b_order_qty=model_b_qty,
        stockout_rate=stockout_rate,
        confidence_range=_compute_confidence_range(),
        season=season,
        current_month=current_month,
        fallback_ratio=fallback_ratio,
    )


def _compute_fallback_ratio_from_supabase(client) -> float | None:
    """
    "Model B 발주 / Model A 판매" 비율을 과거 4주 실측으로 계산.
    Model B 없을 때 기준량 근사에 사용. 계산 실패 시 None.
    """
    try:
        b = (
            client.table("forecast_model_b")
            .select("week_start,pred_ratio")
            .is_("sku_id", "null")
            .order("week_start", desc=True).limit(8).execute()
        )
        b_rows = b.data or []
        if not b_rows:
            return None
        weeks = [r["week_start"][:10] for r in b_rows[:4]]

        a = (
            client.table("forecast_model_a")
            .select("week_start,weekly_sales_qty_forecast")
            .in_("week_start", weeks).execute()
        )
        a_total = sum(float(r.get("weekly_sales_qty_forecast") or 0) for r in (a.data or []))
        b_total = sum(float(r.get("pred_ratio") or 0) for r in b_rows[:4])
        if a_total <= 0:
            return None
        return round(b_total / a_total, 4)
    except Exception:
        return None


def _context_to_user_prompt(ctx: InsightContext) -> str:
    """InsightContext → OpenAI user message 문자열."""
    lines = [
        f"기간: {ctx.forecast_period}",
        f"시즌: {ctx.season}",
        f"현재 월: {ctx.current_month}월",
        f"예측 총 판매량(Model A, 판매 예측): {ctx.total_predicted_qty:,}개",
        f"날씨: {ctx.weather_summary}",
        f"신뢰구간: {ctx.confidence_range}",
    ]
    if ctx.model_b_order_qty is not None:
        lines.append(f"Model B 예상 발주요청량(납품 기준): {ctx.model_b_order_qty:,}개")
    else:
        # fallback_ratio가 계산됐으면 동적 사용, 없으면 근거 없는 0.6
        ratio = ctx.fallback_ratio if ctx.fallback_ratio is not None else 0.6
        source = "최근 4주 납품/판매 실측" if ctx.fallback_ratio is not None else "근거 없는 임시값"
        lines.append(
            f"Model B 예상 발주요청량: 데이터 없음. fallback_ratio={ratio:.3f} ({source})"
        )
    if ctx.stockout_rate is not None:
        lines.append(f"최근 2주 품절률: {ctx.stockout_rate:.1%}")

    lines.append("\n상위 제품 (판매 예측치 — 발주량 아님):")
    for s in ctx.top_skus:
        name = s.get("name", f"SKU {s['sku']}")
        category = s.get("category", "일반 핫팩")
        mf = s.get("month_factor", 0.0)
        lines.append(
            f"  - {name} [{category}]: {s['qty']:,}개 ({s['pct']}%) | "
            f"{ctx.current_month}월 계수 {mf:.4f}"
        )

    return "\n".join(lines)


def generate_forecast_insight(
    ctx: InsightContext | None = None,
    *,
    model: str = "gpt-4o-mini",
    max_tokens: int = 500,
) -> str:
    """
    OpenAI API 호출로 발주 인사이트 3~5줄 생성.

    OPENAI_API_KEY 미설정 시 fallback(룰 기반 문장) 반환.
    """
    if ctx is None:
        ctx = build_insight_context_from_local()

    user_prompt = _context_to_user_prompt(ctx)

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return _fallback_insight(ctx)

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.3,
        )
        return response.choices[0].message.content.strip()
    except ImportError:
        return _fallback_insight(ctx)
    except Exception as exc:
        return f"[OpenAI 호출 실패: {exc}]\n\n{_fallback_insight(ctx)}"


def _fallback_insight(ctx: InsightContext) -> str:
    """OpenAI 없을 때 룰 기반 기본 인사이트."""
    lines = []
    lines.append(f"[{ctx.forecast_period}] {ctx.season}")
    lines.append(f"향후 예측 총 판매량: {ctx.total_predicted_qty:,}개 ({ctx.confidence_range})")

    if ctx.model_b_order_qty:
        lines.append(f"쿠팡 예상 발주요청량: {ctx.model_b_order_qty:,}개 (비율 모델 기준)")

    # [D] 실데이터 바이박스 품절률 3사분위(Q75) 기반 동적 임계
    stockout_warn_threshold = _compute_stockout_warn_threshold()
    if ctx.stockout_rate and ctx.stockout_rate > stockout_warn_threshold:
        lines.append(f"주의: 최근 품절률 {ctx.stockout_rate:.0%} — 재고 확보 시급")

    if ctx.top_skus:
        top = ctx.top_skus[0]
        name = top.get("name", f"SKU {top['sku']}")
        category = top.get("category", "일반 핫팩")
        lines.append(f"권장: {name} [{category}] ({top['pct']}% 비중) 우선 납품 준비")

    return "\n".join(lines)
