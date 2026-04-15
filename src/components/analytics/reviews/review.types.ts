export type ReviewPlatform = "naver" | "coupang";

export interface ReviewEntry {
  id: string;
  sku_id: string;
  platform: ReviewPlatform;
  product_name: string;
  rating: number;
  content: string;
  date: string;
  reviewer_name?: string;
  review_title?: string;
  option_name?: string;
  verified_purchase?: boolean;
  source_url?: string;
  metadata?: Record<string, string | number | boolean | null>;
}
