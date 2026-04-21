"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type CrawlStatus = "idle" | "success" | "error";
type CrawlDebugFrame = {
  url: string;
  title?: string;
  inputs: Array<{
    id: string | null;
    name: string | null;
    type: string | null;
    placeholder: string | null;
  }>;
};

type ErpCrawlPanelProps = {
  itemId: number;
  itemName: string;
  erpCode: string | null;
  onSuccess?: () => void;
};

const FIXED_DATE_FROM = "2026-04-09";

const getTodayDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function ErpCrawlPanel({
  itemId,
  itemName,
  erpCode,
  onSuccess,
}: ErpCrawlPanelProps) {
  const [dateFrom] = useState<string>(FIXED_DATE_FROM);
  const [dateTo, setDateTo] = useState<string>(getTodayDate);
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<CrawlStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [savedCount, setSavedCount] = useState<number>(0);

  const handleCrawl = async (): Promise<void> => {
    if (loading) {
      return;
    }

    setLoading(true);
    setStatus("idle");
    setMessage("");

    try {
      const response = await fetch("/api/crawl/ecount", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          item_id: itemId,
          item_code: erpCode ?? null,
          date_from: dateFrom,
          date_to: dateTo,
        }),
      });

      const data = (await response.json()) as {
        saved_count?: number;
        error?: string;
        message?: string;
        dry_run?: boolean;
        debug?: {
          current_url?: string;
          frames?: CrawlDebugFrame[];
          frame_count?: number;
          frame_urls?: string[];
          page_text_snippet?: string;
        };
      };

      if (!response.ok) {
        const frameHint =
          data.debug?.frames
            ?.find((frame) => frame.inputs.length > 0)
            ?.inputs.slice(0, 5)
            .map((input) => {
              const idText = input.id ? `id=${input.id}` : "id=없음";
              const nameText = input.name ? `name=${input.name}` : "name=없음";
              const placeholderText = input.placeholder
                ? `placeholder=${input.placeholder}`
                : "placeholder=없음";
              return `${idText}, ${nameText}, ${placeholderText}`;
            })
            .join(" | ") ?? "";
        const debugSummary = [
          data.debug?.current_url ? `url=${data.debug.current_url}` : "",
          typeof data.debug?.frame_count === "number" ? `frames=${data.debug.frame_count}` : "",
          data.debug?.frame_urls?.length
            ? `frame_urls=${data.debug.frame_urls.slice(0, 3).join(",")}`
            : "",
          data.debug?.page_text_snippet ? `text=${data.debug.page_text_snippet}` : "",
        ]
          .filter(Boolean)
          .join(" | ");
        const debugText = [
          frameHint ? `입력필드 힌트: ${frameHint}` : "",
          debugSummary ? `디버그: ${debugSummary}` : "",
        ]
          .filter(Boolean)
          .join(" / ");
        throw new Error(
          (data?.error ?? data?.message ?? "ERP 데이터 가져오기에 실패했습니다.") +
            (debugText ? ` [${debugText}]` : "")
        );
      }

      const nextSavedCount = data.saved_count ?? 0;
      setSavedCount(nextSavedCount);
      setStatus("success");
      setMessage(data.message ?? "");
      onSuccess?.();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
      setStatus("error");
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>이카운트 ERP 데이터 가져오기</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-sm font-medium">{itemName}</span>
          <Badge variant="outline">{erpCode ?? "ERP 코드 없음"}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            disabled
            className="w-[160px] opacity-60"
            readOnly
            aria-label="조회 시작일"
          />
          <span className="text-muted-foreground text-sm">~</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="w-[160px]"
            aria-label="조회 종료일"
          />
          <Button onClick={handleCrawl} disabled={loading}>
            {loading ? "가져오는 중..." : "ERP에서 가져오기"}
          </Button>
        </div>

        {status === "success" ? (
          <div className="text-foreground flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span>
              {message ||
                `가져오기 완료 — ${itemName} · ${dateFrom}~${dateTo} · ${savedCount}건 저장됨`}
            </span>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="text-destructive flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span>{message}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
