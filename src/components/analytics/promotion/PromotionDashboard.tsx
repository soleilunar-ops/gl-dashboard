"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PromotionDashboard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>프로모션 분석</CardTitle>
        <CardDescription>
          프로젝트 규칙에 맞춰 `public` 정적 파일 없이, Python Dash 서버(`http://127.0.0.1:8050`)를
          직접 임베드합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Dash 서버가 실행 중이 아니면 화면이 비어 보일 수 있습니다. 실행 명령:
          <span className="ml-1 font-mono">python app.py</span>
        </p>
        <div className="rounded-lg border p-2">
          <iframe
            src="http://127.0.0.1:8050"
            title="GL 쿠팡 프로모션 효과 분석 대시보드"
            className="h-[980px] w-full rounded-lg border"
            loading="lazy"
          />
        </div>
      </CardContent>
    </Card>
  );
}
