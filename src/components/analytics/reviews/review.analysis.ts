import type { ReviewEntry } from "./review.types";

export type ReviewAnalysisResult = {
  review_count: number;
  low_rating_count: number;
  high_rating_count: number;
  low_rating_category_distribution: Record<string, number>;
  logistics_correlation: {
    packaging_complaint_daily_count: Record<string, number>;
    returns_related_daily_count: Record<string, number>;
    overlap_days: string[];
    overlap_ratio: number;
  };
  strength_extraction: {
    core_points: string[];
    summary: string;
  };
};

type ReturnTimelineRow = {
  date: string;
  reason: string;
};

const LOW_TAG_RULES: Record<string, string[]> = {
  "포장 상태": ["포장", "박스", "파손", "찌그러", "터짐", "찢어", "누수", "비닐"],
  "발열 성능": ["발열", "따뜻", "미지근", "뜨겁", "열감", "온도"],
  "지속 시간": ["지속", "오래", "짧", "유지", "금방 식", "몇시간"],
  "제품 규격": ["사이즈", "크기", "규격", "용량", "무게", "두께", "수량", "개수"],
};

const STRENGTH_RULES: Record<string, string[]> = {
  "발열 성능 우위": ["발열", "따뜻", "뜨겁", "열감"],
  "지속시간 우위": ["오래", "지속", "장시간", "유지"],
  "가성비 우위": ["가성비", "가격", "저렴", "합리"],
  "사용 편의성 우위": ["편함", "간편", "부착", "휴대", "사용"],
  "품질 신뢰도 우위": ["만족", "재구매", "튼튼", "품질", "신뢰"],
};

const toDateKey = (value: string) => value.slice(0, 10);

const containsAny = (text: string, keywords: string[]) =>
  keywords.some((keyword) => text.includes(keyword));

export function classifyLowRating(content: string): string[] {
  const text = content.toLowerCase();
  const tags = Object.entries(LOW_TAG_RULES)
    .filter(([, keywords]) => containsAny(text, keywords))
    .map(([category]) => category);
  return tags.length > 0 ? tags : ["제품 규격"];
}

export function analyzeReviewsLocally(
  reviews: ReviewEntry[],
  returnsTimeline: ReturnTimelineRow[]
): ReviewAnalysisResult {
  const lowRows = reviews.filter((row) => row.rating >= 1 && row.rating <= 3);
  const highRows = reviews.filter((row) => row.rating >= 4 && row.rating <= 5);

  const lowCategoryDistribution: Record<string, number> = {};
  const packagingComplaintByDate: Record<string, number> = {};

  for (const row of lowRows) {
    const tags = classifyLowRating(row.content);
    for (const tag of tags) {
      lowCategoryDistribution[tag] = (lowCategoryDistribution[tag] ?? 0) + 1;
    }
    if (tags.includes("포장 상태")) {
      const date = toDateKey(row.date);
      packagingComplaintByDate[date] = (packagingComplaintByDate[date] ?? 0) + 1;
    }
  }

  const returnByDate: Record<string, number> = {};
  for (const row of returnsTimeline) {
    const reason = String(row.reason ?? "");
    if (!containsAny(reason, ["파손", "불량", "포장"])) continue;
    const date = toDateKey(String(row.date ?? ""));
    if (!date) continue;
    returnByDate[date] = (returnByDate[date] ?? 0) + 1;
  }

  const overlapDays = Object.keys(packagingComplaintByDate).filter(
    (date) => returnByDate[date] !== undefined
  );
  const overlapRatio =
    Object.keys(packagingComplaintByDate).length > 0
      ? overlapDays.length / Object.keys(packagingComplaintByDate).length
      : 0;

  const strengthCount: Record<string, number> = {};
  for (const row of highRows) {
    const text = row.content.toLowerCase();
    for (const [point, keywords] of Object.entries(STRENGTH_RULES)) {
      if (containsAny(text, keywords)) {
        strengthCount[point] = (strengthCount[point] ?? 0) + 1;
      }
    }
  }

  const corePoints = Object.entries(strengthCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([point]) => point);

  return {
    review_count: reviews.length,
    low_rating_count: lowRows.length,
    high_rating_count: highRows.length,
    low_rating_category_distribution: lowCategoryDistribution,
    logistics_correlation: {
      packaging_complaint_daily_count: packagingComplaintByDate,
      returns_related_daily_count: returnByDate,
      overlap_days: overlapDays.sort(),
      overlap_ratio: Number(overlapRatio.toFixed(4)),
    },
    strength_extraction: {
      core_points: corePoints,
      summary:
        corePoints.length > 0
          ? `고평점 리뷰에서 ${corePoints.slice(0, 3).join(", ")} 관련 언급이 반복되어 경쟁 우위 요소로 관찰됩니다.`
          : "고평점 리뷰의 핵심 소구점이 충분히 축적되지 않았습니다.",
    },
  };
}
