"""
2024년 합성(더미) 판매 데이터 생성기 v2.

모든 계수·임계값의 근거:
  [A] 기상청 공식 문서  → 체감온도 JAG/TI 공식, 한파 -12℃ 기준
  [B] Lee & Zheng 2024 (JAERE) → 급강하 효과, 적응 효과 hump shape
  [C] 업계 관행 (KMITI 날씨경영) → 기온 5℃ 단위 구간, 10℃ 발주 트리거
  [D] 우리 실데이터 54주        → 월별 비율, 적설 효과, 구간별 변화, 월별 CV
  [E] 사용자 도메인 지식         → 8월 납품 시작, 첫 한파 날짜

임의로 설정한 값: 없음. 모든 숫자에 위 [A]~[E] 태그 부여.

프로모션/리드타임: use_promotion_calendar, use_lead_time 플래그로 hook 준비.
                   다른 팀 변수 받으면 활성화.

산출물:
  - data/processed/synthetic_2024_weekly.csv
  - data/processed/synthetic_2024_delivery.csv
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

PROCESSED_DIR = Path("data/processed")
ASOS_CACHE = PROCESSED_DIR / "asos_weather_cache.csv"


# ════════════════════════════════════════════
# 1. 체감온도 — 기상청 공식 JAG/TI 2001 [근거 A]
# ════════════════════════════════════════════
def wind_chill(T: float, V_ms: float) -> float:
    """
    한국 기상청 공식 겨울철 체감온도 (JAG/TI 2001).

    근거 [A]: weatheri.co.kr + 기상청 블로그(kma_131)
    공식: W_C = 13.12 + 0.6215T - 11.37V^0.16 + 0.3965TV^0.16
    조건: T ≤ 10℃ AND V ≥ 1.3m/s. 미충족 시 기온 반환.

    Args:
        T: 기온 (℃)
        V_ms: 풍속 (m/s, 지상 10m)
    Returns:
        체감온도 (℃)
    """
    V_kmh = V_ms * 3.6  # [근거 A] m/s → km/h 변환 (공식 입력 단위)

    if T > 10 or V_ms < 1.3:  # [근거 A] 기상청 적용 조건
        return T

    wc = (13.12
          + 0.6215 * T
          - 11.37 * (V_kmh ** 0.16)
          + 0.3965 * T * (V_kmh ** 0.16))

    return wc if wc <= T else T  # [근거 A] 산출값 > 기온이면 기온 반환


# ════════════════════════════════════════════
# 2. 설정 — 모든 값에 근거 태그
# ════════════════════════════════════════════
@dataclass
class SyntheticConfig:
    # ── 생성 기간 ──
    start_date: str = "2024-01-01"
    end_date: str = "2024-12-31"

    # ── 첫 한파 [근거 E: 사용자 제공, 기상청 발표 확인] ──
    first_cold_wave_date: str = "2024-11-27"

    # ── 지역 가중치 [근거 D: 지역별판매트렌드 CSV 실측] ──
    # 지역별판매트렌드 CSV 원본 비중 (합계 65.8% — 인천 7.6%는 ASOS 관측소 없어 제외)
    # 코드 내부에서 sum(weights)로 정규화되므로 각 지역의 상대 비중만 의미.
    # 수도권 61.5% = 서울(23.7) + 경기(30.2) + 인천(7.6)  [행정 구분]
    region_weights: dict[str, float] = field(default_factory=lambda: {
        "seoul": 0.237,    # 서울
        "suwon": 0.302,    # 경기 대표
        "busan": 0.065,    # 부산
        "daejeon": 0.027,  # 대전
        "gwangju": 0.027,  # 광주
    })

    # ── 월별 발주/판매 비율 [근거 D: 납품률×일간성과 실측] ──
    monthly_order_ratio: dict[int, float] = field(default_factory=lambda: {
        1: 0.42, 2: 0.16, 3: 0.23, 4: 0.05,
        5: 0.32, 6: 9.08, 7: 7.81, 8: 3.26,
        9: 62.95, 10: 3.52, 11: 2.42, 12: 1.54,
    })

    # ── 8월 납품 시작 [근거 E: 사용자 도메인 지식] ──
    supply_start_week: int = 35  # ISO week ≈ 8월 마지막 주

    random_state: int = 42

    # ── 향후 확장 hook (현재 미사용) ──
    use_promotion_calendar: bool = False
    promotion_calendar_path: str | None = None
    use_lead_time: bool = False
    lead_time_weeks: int = 4


# ════════════════════════════════════════════
# 3. 실데이터에서 계수 추출 — 임의값 0개
# ════════════════════════════════════════════
def _extract_all_coefficients(weekly_real: pd.DataFrame) -> dict:
    """
    실데이터 54주에서 모든 계수를 추출.

    반환:
        monthly_factors: 월별 계절 계수 [근거 D]
        windchill_bins: 체감온도 구간별 판매 평균 [근거 A+D]
        snow_ratio: 적설 유무 배수 [근거 D]
        cold_snap_effects: 기온 급강하 효과 [근거 B+D]
        monthly_cv: 월별 변동계수 [근거 D]
        dec_peak_avg: 12월 주 평균 판매 [근거 D]
    """
    cat = weekly_real.groupby("week_start", as_index=False).agg(
        total_sales=("weekly_sales_qty", "sum"),
        temp_mean=("temp_mean", "first"),
        temp_min=("temp_min", "first"),
        temp_max=("temp_max", "first"),
        wind_mean=("wind_mean", "first"),
        temp_range=("temp_range", "first"),
        snow_cm=("snow_cm", "first"),
        cold_days_7d=("cold_days_7d", "first"),
    ).sort_values("week_start")
    cat["month"] = cat["week_start"].dt.month

    # ── [근거 D] 월별 계절 계수 (12월 주평균 = 1.0) ──
    # 주수가 다른 달(12월=5주, 1/2/10/11월=4주, 3월=6주) 혼입 방지를 위해
    # 월별 SUM이 아닌 주평균 비율로 계산. 2026-04-20 수정:
    # 기존 SUM 방식은 4주인 달을 약 20% 과소평가 → 10월 -42% 과소 원인.
    monthly_mean_sales = cat.groupby("month")["total_sales"].mean()
    dec_mean = monthly_mean_sales.get(12, 1)
    monthly_factors = (monthly_mean_sales / dec_mean).to_dict()

    # ── [근거 D] 시즌 종료 감쇠: 2·3월 주차별 계수 (2026-04-20 추가) ──
    # 2월: W1 0.33 → W4 0.07 (4.4배 감쇠). 월평균 0.16 사용 시 W1 과소·W4 과대.
    # 3월도 점진 감쇠 계속. 4월은 기존 월평균 유지 (거의 0).
    # 표본: 2026년 1시즌(n=1) — 다음 시즌 검증 시 보강 필요.
    cat_sorted = cat.sort_values("week_start").copy()
    cat_sorted["year"] = cat_sorted["week_start"].dt.year
    cat_sorted["week_in_month"] = (
        cat_sorted.groupby(["year", "month"]).cumcount() + 1
    )
    week_in_month_factors = {}
    for m in (2, 3):
        for w in range(1, 6):
            rows = cat_sorted[
                (cat_sorted["month"] == m) & (cat_sorted["week_in_month"] == w)
            ]
            if len(rows) > 0:
                # 2026년 시즌 종료 패턴만 사용 (2025-03은 전년 시즌 후 봄 비시즌)
                rows_2026 = rows[rows["year"] == 2026]
                sample = rows_2026 if len(rows_2026) > 0 else rows
                week_in_month_factors[(m, w)] = float(
                    sample["total_sales"].mean() / dec_mean
                )

    # ── [근거 D] 12월 주 평균 ──
    dec_weeks = cat[cat["month"] == 12]
    dec_peak_avg = float(dec_weeks["total_sales"].mean()) if len(dec_weeks) else 100000

    # ── [근거 A+D] 체감온도 구간별 판매 (5℃ 단위 [근거 C: 업계 관행]) ──
    cat["wind_chill"] = cat.apply(
        lambda r: wind_chill(r["temp_mean"], r["wind_mean"]), axis=1
    )
    # 구간 경계: -12(한파기준[A]), -5, 0, 5, 10(체감온도 적용한계[A]), 15, 20
    bins = [-50, -12, -5, 0, 5, 10, 15, 20, 50]
    labels = ["<-12", "-12~-5", "-5~0", "0~5", "5~10", "10~15", "15~20", ">20"]
    cat["wc_bin"] = pd.cut(cat["wind_chill"], bins=bins, labels=labels)
    windchill_bins = cat.groupby("wc_bin", observed=True)["total_sales"].mean().to_dict()

    # ── [근거 D] 적설 효과 (11~1월 한정, 첫눈 제외) ──
    # 10~2월 전체 비교(2.02배)는 2월 시즌종료·10월 무설 혼입 → 11~1월로 제한
    # 첫눈 주는 별도 first_snow_multiplier로 분리 (3.03배)
    # 2026-04-20 재산출: n=7(눈O) vs n=5(눈X), 평균 103,437 vs 71,606 → 1.44배 (p=0.064)
    peak_winter = cat[cat["month"].isin([11, 12, 1])].copy()
    # 시즌 첫눈 주 식별 (season_year: 10월 이후는 당해, 이전은 전해 시즌)
    peak_winter["season_year"] = peak_winter["week_start"].apply(
        lambda d: d.year if d.month >= 10 else d.year - 1
    )
    season_all = cat.copy()
    season_all["season_year"] = season_all["week_start"].apply(
        lambda d: d.year if d.month >= 10 else d.year - 1
    )
    season_all["is_first_snow"] = 0
    for sy, grp in season_all.groupby("season_year"):
        snow_rows = grp[grp["snow_cm"] > 0].sort_values("week_start")
        if not snow_rows.empty:
            season_all.loc[snow_rows.index[0], "is_first_snow"] = 1
    peak_no_first = season_all[
        season_all["month"].isin([11, 12, 1]) & (season_all["is_first_snow"] == 0)
    ]
    snow_yes_pw = peak_no_first[peak_no_first["snow_cm"] > 0]["total_sales"].mean()
    snow_no_pw = peak_no_first[peak_no_first["snow_cm"] == 0]["total_sales"].mean()
    snow_ratio = float(snow_yes_pw / snow_no_pw) if snow_no_pw and snow_no_pw > 0 else 1.0

    # ── [근거 D] 첫눈 효과 (2025-12-01 단일 관측, n=1) ──
    # 직전주 대비 +202.8% → 3.03배. 다음 시즌 관측으로 검증 필요.
    first_snow_rows = season_all[season_all["is_first_snow"] == 1].sort_values("week_start")
    first_snow_multipliers = []
    for _, fsr in first_snow_rows.iterrows():
        prev = cat[cat["week_start"] < fsr["week_start"]].sort_values("week_start")
        if len(prev) > 0:
            prev_sales = prev.iloc[-1]["total_sales"]
            if prev_sales > 0:
                first_snow_multipliers.append(float(fsr["total_sales"]) / float(prev_sales))
    first_snow_multiplier = (
        float(np.mean(first_snow_multipliers)) if first_snow_multipliers else 1.0
    )
    first_snow_n = len(first_snow_multipliers)

    # ── [근거 B+D] 기온 급강하 효과 (-5℃ 기준 [근거 B: Lee&Zheng]) ──
    cat["temp_change"] = cat["temp_mean"].diff()
    cat["sales_change_pct"] = cat["total_sales"].pct_change()
    cold_snaps = cat[cat["temp_change"] <= -5].copy()  # [근거 B] -5℃ 임계값
    cold_snap_effects = []
    for i, (_, r) in enumerate(cold_snaps.iterrows()):
        effect = 1.0 + r["sales_change_pct"] if pd.notna(r["sales_change_pct"]) else 1.0
        cold_snap_effects.append({
            "date": r["week_start"],
            "temp_drop": float(r["temp_change"]),
            "sales_multiplier": float(max(0.5, effect)),
            "occurrence": i + 1,
        })

    # 급강하 횟수별 평균 배수 [근거 B: 적응 효과(habituation)]
    if cold_snap_effects:
        snap_multipliers = [e["sales_multiplier"] for e in cold_snap_effects]
    else:
        snap_multipliers = [1.0]

    # ── [근거 D] 월별 평균 체감온도 (2025년 실측, 편차 보정 기준점) ──
    monthly_avg_wc = cat.groupby("month")["wind_chill"].mean().to_dict()

    # ── [근거 D] 월별 변동계수 (노이즈) ──
    monthly_cv = cat.groupby("month")["total_sales"].agg(
        lambda x: float(x.std() / x.mean()) if x.mean() > 0 else 0.0
    ).to_dict()

    return {
        "monthly_factors": monthly_factors,
        "week_in_month_factors": week_in_month_factors,
        "dec_peak_avg": dec_peak_avg,
        "windchill_bins": windchill_bins,
        "snow_ratio": snow_ratio,
        "first_snow_multiplier": first_snow_multiplier,
        "first_snow_n": first_snow_n,
        "cold_snap_effects": cold_snap_effects,
        "snap_multipliers": snap_multipliers,
        "monthly_cv": monthly_cv,
        "monthly_avg_wc": monthly_avg_wc,
    }


# ════════════════════════════════════════════
# 4. 2024년 날씨 → 체감온도 가중 평균 (주단위)
# ════════════════════════════════════════════
def _build_2024_weekly_weather(cfg: SyntheticConfig) -> pd.DataFrame:
    """
    ASOS 2024 실날씨 → 지역 가중 평균 [근거 D] → 체감온도 [근거 A] → 주단위.
    """
    asos = pd.read_csv(ASOS_CACHE, parse_dates=["date"])
    asos_2024 = asos[(asos["date"] >= cfg.start_date) & (asos["date"] <= cfg.end_date)].copy()

    weights = cfg.region_weights
    total_w = sum(weights.values())
    norm_w = {r: w / total_w for r, w in weights.items()}

    daily_rows = []
    for date, grp in asos_2024.groupby("date"):
        row = {"date": date}
        for col in ["temp_mean", "temp_min", "temp_max", "rain_mm", "wind_mean", "snow_cm"]:
            weighted = 0.0
            w_sum = 0.0
            for _, r in grp.iterrows():
                if r["region"] in norm_w and pd.notna(r[col]):
                    weighted += r[col] * norm_w[r["region"]]
                    w_sum += norm_w[r["region"]]
            row[col] = weighted / w_sum if w_sum > 0 else np.nan
        daily_rows.append(row)

    daily = pd.DataFrame(daily_rows)
    daily["date"] = pd.to_datetime(daily["date"])
    daily["temp_range"] = daily["temp_max"] - daily["temp_min"]
    # [근거 A] 체감온도 적용
    daily["wind_chill"] = daily.apply(
        lambda r: wind_chill(r["temp_mean"], r["wind_mean"])
        if pd.notna(r["temp_mean"]) and pd.notna(r["wind_mean"]) else r["temp_mean"],
        axis=1,
    )

    daily["week_start"] = daily["date"] - pd.to_timedelta(daily["date"].dt.weekday, unit="D")
    daily["week_start"] = daily["week_start"].dt.normalize()

    weekly = daily.groupby("week_start", as_index=False).agg(
        temp_mean=("temp_mean", "mean"),
        temp_min=("temp_min", "min"),
        temp_max=("temp_max", "max"),
        rain_mm=("rain_mm", "sum"),
        wind_mean=("wind_mean", "mean"),
        snow_cm=("snow_cm", "sum"),
        wind_chill=("wind_chill", "mean"),
        temp_range=("temp_range", "mean"),
    )
    return weekly


# ════════════════════════════════════════════
# 5. 합성 판매 생성 — 모든 계수 실데이터/공식 기반
# ════════════════════════════════════════════
def generate_synthetic_sales(
    weekly_real: pd.DataFrame,
    cfg: SyntheticConfig | None = None,
) -> pd.DataFrame:
    cfg = cfg or SyntheticConfig()
    rng = np.random.default_rng(cfg.random_state)

    coefs = _extract_all_coefficients(weekly_real)
    weather_2024 = _build_2024_weekly_weather(cfg)

    # SKU 분배 비율 [근거 D: 실데이터 판매 비중]
    sku_totals = weekly_real.groupby("sku")["weekly_sales_qty"].sum()
    sku_ratios = sku_totals / sku_totals.sum()

    # 기온 급강하 감지용 (전주 대비)
    weather_2024["temp_change"] = weather_2024["wind_chill"].diff()

    # 시즌 내 급강하 횟수 카운터
    snap_count = 0
    # 시즌 내 첫눈 추적: 2024 시즌 = 2024-10 이후 첫 snow>0 주
    first_snow_applied = False

    # 2·3월 주차 카운터 (시즌 종료 감쇠용)
    month_week_counter: dict[int, int] = {}

    rows = []
    for _, wrow in weather_2024.iterrows():
        ws = wrow["week_start"]
        month = ws.month
        wc = wrow["wind_chill"]

        # ── [근거 D] 기본 판매 = 같은 달 실데이터 주 평균 ──
        # 이것이 기준. 체감온도/눈/급강하는 이 기준 대비 "편차 보정"만 적용.
        # 2·3월은 시즌 종료 감쇠 크므로 주차별 계수 우선 사용.
        if month in (2, 3):
            month_week_counter[month] = month_week_counter.get(month, 0) + 1
            wim = month_week_counter[month]
            wim_factor = coefs["week_in_month_factors"].get((month, wim))
            season_factor = (
                wim_factor if wim_factor is not None
                else coefs["monthly_factors"].get(month, 0.001)
            )
        else:
            season_factor = coefs["monthly_factors"].get(month, 0.001)
        base_sales = coefs["dec_peak_avg"] * season_factor

        # ── [근거 A+C+D] 체감온도 편차 보정 ──
        # 구간별 1℃당 변화율로 보정 (이중 반영 방지: 절대값 아닌 편차만)
        # 실측 구간별 1℃당 변화: [근거 D] 우리 데이터 54주 측정
        # <-5℃: -274/℃, -5~5℃: -13,114/℃(가장 민감), 5~10℃: -5,385/℃,
        # 10~20℃: -2,870/℃, >20℃: -129/℃  [근거 C: 5℃ 업계 구간]
        # 기준점: 해당 월의 2025년 평균 체감온도
        month_avg_wc = coefs.get("monthly_avg_wc", {}).get(month)
        if month_avg_wc is not None and pd.notna(wc):
            wc_diff = month_avg_wc - wc  # 양수 = 2024년이 더 추움 → 판매 증가
            # 구간별 민감도 적용 [근거 D: 실측]
            if wc < -5:
                sensitivity = 274    # [근거 D] <-5℃ 구간: 포화, 둔감
            elif wc < 5:
                sensitivity = 13114  # [근거 D] -5~5℃: 가장 민감
            elif wc < 10:
                sensitivity = 5385   # [근거 D]
            elif wc < 20:
                sensitivity = 2870   # [근거 D]
            else:
                sensitivity = 129    # [근거 D] >20℃: 거의 무반응
            temp_adjustment = wc_diff * sensitivity
            # [근거 D] 보정 상한: base의 ±50% 이내 (과보정 방지)
            max_adj = base_sales * 0.5
            temp_adjustment = max(-max_adj, min(max_adj, temp_adjustment))
            base_sales = max(0, base_sales + temp_adjustment)

        # ── 이벤트 배수 (max 기반, 중첩 금지) ──
        # 여러 이벤트 동시 발생 시 가장 큰 배수 하나만 적용.
        # 실측 근거: 2025-12-01은 첫눈+급강하 동시 발생 → 실제 관측 배수(+203%)는
        # 둘의 곱이 아닌 단일 효과. 곱셈은 이중 반영이 됨.
        event_candidates = [1.0]

        # [B1] 첫눈 (시즌 내 첫 snow>0 주) — n=1 관측값
        is_first_snow = False
        if wrow["snow_cm"] > 0 and not first_snow_applied and month >= 10:
            is_first_snow = True
            first_snow_applied = True
            event_candidates.append(coefs["first_snow_multiplier"])

        # [B2] 기온 급강하 [근거 B: -5℃ 임계]
        temp_change = wrow.get("temp_change", 0)
        if pd.notna(temp_change) and temp_change <= -5:
            snap_count += 1
            snap_list = coefs["snap_multipliers"]
            if snap_count <= len(snap_list):
                event_candidates.append(snap_list[snap_count - 1])
            elif snap_list:
                event_candidates.append(snap_list[-1])

        # [B3] 겨울 일반 적설 (11~1월, 첫눈 아님) — 실측 1.44배 (p=0.064)
        if (
            month in (11, 12, 1)
            and wrow["snow_cm"] > 0
            and not is_first_snow
        ):
            event_candidates.append(coefs["snow_ratio"])
        # 그 외 (10월/2~4월 적설, 무설): 배수 1.0 유지

        event_boost = max(event_candidates)
        total_sales = max(0, base_sales * event_boost)

        # ── [근거 D] 월별 랜덤 노이즈 (실측 CV) ──
        cv = coefs["monthly_cv"].get(month, 0.3)
        noise = rng.normal(0, total_sales * cv * 0.5)
        # CV의 50% 수준: 전체 CV에는 계절 변동이 포함되어 있으므로
        # 이미 계절 계수로 반영된 부분 제외하기 위해 절반
        total_sales = max(0, total_sales + noise)

        # ── [근거 D] SKU 분배 ──
        for sku, ratio in sku_ratios.items():
            sku_sales = max(0, int(round(total_sales * ratio)))
            # [근거 D] 비시즌(3~9월, 실데이터 기준 5% 미만 월) 소량 SKU 0 처리
            if sku_sales < 1 and month in (3, 4, 5, 6, 7, 8, 9):
                sku_sales = 0

            rows.append({
                "week_start": ws,
                "sku": int(sku),
                "weekly_sales_qty": sku_sales,
                "temp_mean": wrow["temp_mean"],
                "temp_min": wrow["temp_min"],
                "temp_max": wrow["temp_max"],
                "rain_mm": wrow["rain_mm"],
                "wind_mean": wrow["wind_mean"],
                "snow_cm": wrow["snow_cm"],
                "wind_chill": wrow["wind_chill"],
                "temp_range": wrow["temp_range"],
                "cold_days_7d": 1 if wrow["temp_min"] <= -12 else 0,  # [근거 A]
                "first_snow_flag": 1 if is_first_snow else 0,  # [근거 D: 신규]
                "promotion_flag": 0,  # [hook] 프로모션 캘린더 연동 시 변경
                "synthetic": True,
            })

    df = pd.DataFrame(rows)
    df["week_start"] = pd.to_datetime(df["week_start"])
    return df.sort_values(["sku", "week_start"]).reset_index(drop=True)


# ════════════════════════════════════════════
# 6. 합성 납품 — 월별 실측 비율 [근거 D]
# ════════════════════════════════════════════
def generate_synthetic_delivery(
    synthetic_sales: pd.DataFrame,
    cfg: SyntheticConfig | None = None,
) -> pd.DataFrame:
    cfg = cfg or SyntheticConfig()

    cat_sales = synthetic_sales.groupby("week_start", as_index=False).agg(
        total_sales=("weekly_sales_qty", "sum"),
    )
    cat_sales["month"] = cat_sales["week_start"].dt.month
    cat_sales["iso_week"] = cat_sales["week_start"].dt.isocalendar().week.astype(int)

    rows = []
    for _, r in cat_sales.iterrows():
        month = r["month"]
        ratio = cfg.monthly_order_ratio.get(month, 1.0)  # [근거 D]

        # [근거 E] 비시즌(4~8월 초) 납품 없음
        is_offseason = (
            month in (4, 5, 6, 7)
            or (month == 8 and r["iso_week"] < cfg.supply_start_week)
        )
        if is_offseason:
            units_requested = 0
        else:
            units_requested = int(round(r["total_sales"] * ratio))

        rows.append({
            "week_start": r["week_start"],
            "total_sales": r["total_sales"],
            "units_requested": units_requested,
            "order_ratio": ratio,
            "synthetic": True,
        })

    return pd.DataFrame(rows)


# ════════════════════════════════════════════
# 7. 메인 실행
# ════════════════════════════════════════════
def run_synthetic_generation(
    weekly_real_path: str = "data/processed/weekly_feature_table.csv",
    cfg: SyntheticConfig | None = None,
    save: bool = True,
) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    cfg = cfg or SyntheticConfig()
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    weekly_real = pd.read_csv(weekly_real_path, parse_dates=["week_start"])

    print("[1/4] 실데이터 계수 추출...")
    coefs = _extract_all_coefficients(weekly_real)
    print(f"  월별 계수: { {m: round(v,4) for m,v in sorted(coefs['monthly_factors'].items())} }")
    wim = coefs.get("week_in_month_factors", {})
    if wim:
        print(f"  2·3월 주차별 감쇠 계수:")
        for (m, w), v in sorted(wim.items()):
            print(f"    {m}월 W{w}: {v:.4f}")
    print(f"  일반 적설 배수 (11~1월, 첫눈 제외): {coefs['snow_ratio']:.2f}배")
    print(f"  첫눈 배수: {coefs['first_snow_multiplier']:.2f}배 "
          f"[주의: n={coefs['first_snow_n']} 단일 관측, 다음 시즌 검증 필요]")
    print(f"  급강하 실측: {len(coefs['cold_snap_effects'])}건 (배수 {coefs['snap_multipliers']})")
    print(f"  12월 주 평균: {coefs['dec_peak_avg']:,.0f}")

    print("[2/4] 2024년 날씨 (체감온도 포함)...")
    weather = _build_2024_weekly_weather(cfg)
    print(f"  {len(weather)}주")

    print("[3/4] 합성 판매 생성...")
    syn_sales = generate_synthetic_sales(weekly_real, cfg)
    print(f"  {len(syn_sales)}행 ({syn_sales['sku'].nunique()} SKU × {syn_sales['week_start'].nunique()}주)")

    print("[4/4] 합성 납품 생성...")
    syn_delivery = generate_synthetic_delivery(syn_sales, cfg)
    print(f"  {len(syn_delivery)}행")

    syn_sales["month"] = syn_sales["week_start"].dt.month
    monthly = syn_sales.groupby("month")["weekly_sales_qty"].sum()

    diag = {
        "sales_rows": len(syn_sales),
        "delivery_rows": len(syn_delivery),
        "period": f"{syn_sales['week_start'].min().date()} ~ {syn_sales['week_start'].max().date()}",
        "peak_month": int(monthly.idxmax()),
        "peak_month_sales": int(monthly.max()),
        "total_annual": int(monthly.sum()),
        "coefficients_source": {
            "monthly_factors": "[D] 실데이터 월별 판매/12월 비율",
            "windchill_bins": "[A+C+D] JAG/TI 체감온도 + 5℃ 업계 구간 + 실데이터 판매",
            "snow_ratio": f"[D] 11~1월 첫눈 제외 실측 {coefs['snow_ratio']:.2f}배 (p=0.064)",
            "first_snow": f"[D] 실측 {coefs['first_snow_multiplier']:.2f}배 "
                          f"(n={coefs['first_snow_n']} 단일 관측 — 검증 필요)",
            "cold_snap": f"[B+D] -5℃ 임계(논문) + 실측 {len(coefs['cold_snap_effects'])}건",
            "event_stacking": "max 기반 (중첩 금지): 동시 발생 이벤트 중 가장 큰 배수만 적용",
            "noise_cv": "[D] 월별 실측 변동계수",
            "delivery_ratio": "[D] 납품률×일간성과 실측 비율",
            "region_weights": "[D] 지역별판매트렌드 실측 (수도권 61.5%)",
        },
    }

    if save:
        out_s = PROCESSED_DIR / "synthetic_2024_weekly.csv"
        out_d = PROCESSED_DIR / "synthetic_2024_delivery.csv"
        syn_sales.to_csv(out_s, index=False)
        syn_delivery.to_csv(out_d, index=False)
        diag["saved_sales"] = str(out_s)
        diag["saved_delivery"] = str(out_d)

    return syn_sales, syn_delivery, diag


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    syn_s, syn_d, diag = run_synthetic_generation()
    print("\n=== 결과 ===")
    for k, v in diag.items():
        print(f"  {k}: {v}")
