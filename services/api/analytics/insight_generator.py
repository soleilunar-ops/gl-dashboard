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

규칙:
- 숫자는 천 단위 콤마 사용 (예: 2,600개)
- 핵심 수치를 근거로 제시 (예: "평균기온 3℃ 이하 지속 예상")
- 긴급도를 명시 (즉시 대응 / 사전 준비 / 참고)
- 마지막 줄에 한 줄 요약 (예: "권장: SKU-A 2,600개, SKU-B 1,200개 납품 준비")
"""


@dataclass
class InsightContext:
    """인사이트 생성을 위한 요약 컨텍스트."""

    forecast_period: str  # "2026-04-14 ~ 2026-05-04"
    total_predicted_qty: int  # 전체 SKU 합산 예측 판매량
    top_skus: list[dict[str, Any]]  # [{sku, name, qty, pct}] 상위 5
    weather_summary: str  # "평균기온 12℃, 최저 3℃, 한파 0일"
    model_b_order_qty: int | None  # Model B 카테고리 발주 추정
    stockout_rate: float | None  # 최근 품절률
    confidence_range: str  # "90% 신뢰구간 ±1,046"
    season: str  # "비시즌(봄)" or "성수기(겨울)"


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
    """val_mae를 최근 winter_validation 결과에서 읽어 동적으로 계산."""
    import json
    from pathlib import Path as _P
    result_path = _P("data/processed/winter_validation_result.json")
    val_mae = 636  # 합성 없는 기본 모델 MAE
    if result_path.exists():
        try:
            data = json.loads(result_path.read_text(encoding="utf-8"))
            val_mae = data.get("A_no_synthetic", {}).get("val_mae", val_mae)
        except Exception:
            pass
    margin = int(round(val_mae * 1.645))  # [B] 정규분포 90% z값
    return f"90% 신뢰구간 ±{margin:,}"


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
    top_skus = [
        {
            "sku": int(s),
            "name": sku_name_map.get(int(s), f"SKU {int(s)}"),
            "qty": int(q),
            "pct": round(q / total_for_pct * 100, 1),
        }
        for s, q in sku_totals.items()
    ]

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
    )


def _context_to_user_prompt(ctx: InsightContext) -> str:
    """InsightContext → OpenAI user message 문자열."""
    lines = [
        f"기간: {ctx.forecast_period}",
        f"시즌: {ctx.season}",
        f"예측 총 판매량: {ctx.total_predicted_qty:,}개",
        f"날씨: {ctx.weather_summary}",
        f"신뢰구간: {ctx.confidence_range}",
    ]
    if ctx.model_b_order_qty is not None:
        lines.append(f"Model B 예상 발주요청량: {ctx.model_b_order_qty:,}개")
    if ctx.stockout_rate is not None:
        lines.append(f"최근 2주 품절률: {ctx.stockout_rate:.1%}")

    lines.append("\n상위 SKU:")
    for s in ctx.top_skus:
        name = s.get("name", f"SKU {s['sku']}")
        lines.append(f"  {name} (SKU {s['sku']}): {s['qty']:,}개 ({s['pct']}%)")

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
            temperature=0.7,
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
        lines.append(f"권장: {name} ({top['pct']}% 비중) 우선 납품 준비")

    return "\n".join(lines)
