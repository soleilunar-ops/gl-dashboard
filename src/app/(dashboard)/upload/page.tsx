import UploadPanel from "@/components/analytics/promotion/UploadPanel";

export default function Page() {
  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">엑셀 업로드</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          광고비·쿠폰계약·일간성과·배송상세·밀크런비용·프리미엄데이터 엑셀을 업로드하고 이력을
          확인합니다.
        </p>
      </header>
      <UploadPanel />
    </div>
  );
}
