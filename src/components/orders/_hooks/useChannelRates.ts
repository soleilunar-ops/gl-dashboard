"use client";

import { useCallback, useMemo, useState } from "react";
import * as XLSX from "xlsx";

/** 업로드된 채널별 정산 비율 — 변경 이유: 마진 계산기 채널 선택 연동 */
export type ChannelRate = {
  channelName: string;
  payoutRate: number;
  note?: string;
};

/** 기본 채널 수수료 — 변경 이유: 엑셀 없이도 즉시 사용 */
export const DEFAULT_CHANNEL_RATES: ChannelRate[] = [
  { channelName: "쿠팡 로켓배송", payoutRate: 0.56, note: "매출 최우선" },
  { channelName: "쿠팡 판매자로켓", payoutRate: 0.85 },
  { channelName: "네이버 스마트스토어", payoutRate: 0.965 },
  { channelName: "지마켓", payoutRate: 0.89 },
  { channelName: "SSG닷컴", payoutRate: 0.88 },
  { channelName: "카카오선물하기", payoutRate: 0.93 },
];

/** 셀 값 → 0~1 정산비율 — 변경 이유: %·소수 혼용 입력 허용 */
function normalizePayoutCell(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    let n = v;
    if (n > 1) n = n / 100;
    if (n > 1) return null;
    if (n <= 0 || n > 1) return null;
    return n;
  }
  const s = String(v).trim();
  if (s === "") return null;
  const stripped = s.replace(/%/g, "").replace(/,/g, "");
  let n = Number(stripped);
  if (!Number.isFinite(n)) return null;
  if (n > 1) n = n / 100;
  if (n <= 0 || n > 1) return null;
  return n;
}

/** 수수료율 셀 → 정산비율 (1 - 수수료) — 변경 이유: 업로드 컬럼명 변형 대응 */
function normalizeFeeToPayout(v: unknown): number | null {
  const raw = normalizePayoutCell(v);
  if (raw === null) return null;
  const oneMinus = 1 - raw;
  if (oneMinus <= 0 || oneMinus > 1) return null;
  return oneMinus;
}

function matchHeaderCell(h: string): "channel" | "payout" | "fee" | "note" | null {
  const t = h.trim();
  if (/채널|channel/i.test(t)) return "channel";
  if (/정산/.test(t)) return "payout";
  if (/수수료/.test(t)) return "fee";
  if (/비고|메모|note/i.test(t)) return "note";
  return null;
}

/** 첫 시트만 세로 포맷 파싱 — 변경 이유: 요구 스키마 고정 */
function parseFirstSheet(workbook: XLSX.WorkBook): { rows: ChannelRate[]; error: string | null } {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], error: "시트가 비어 있습니다." };
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
  }) as unknown[][];

  if (!matrix.length) {
    return { rows: [], error: "데이터 행이 없습니다." };
  }

  const headerRow = matrix[0].map((c) => String(c ?? "").trim());
  const colMap: Partial<Record<"channel" | "payout" | "fee" | "note", number>> = {};

  headerRow.forEach((cell, idx) => {
    const kind = matchHeaderCell(cell);
    if (kind && colMap[kind] === undefined) colMap[kind] = idx;
  });

  if (colMap.channel === undefined) {
    return { rows: [], error: "헤더에 채널명 열(채널/channel)이 없습니다." };
  }
  if (colMap.payout === undefined && colMap.fee === undefined) {
    return { rows: [], error: "헤더에 정산비율 또는 수수료율 열이 없습니다." };
  }

  const seen = new Set<string>();
  const rows: ChannelRate[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    const nameIdx = colMap.channel as number;
    const channelName = String(line[nameIdx] ?? "").trim();
    if (!channelName) continue;
    const key = channelName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    let payout: number | null = null;
    if (colMap.payout !== undefined) {
      payout = normalizePayoutCell(line[colMap.payout]);
    }
    if (payout === null && colMap.fee !== undefined) {
      payout = normalizeFeeToPayout(line[colMap.fee]);
    }
    if (payout === null) {
      console.warn(`[useChannelRates] 채널 "${channelName}" 행의 비율을 건너뜁니다.`);
      continue;
    }

    let note: string | undefined;
    if (colMap.note !== undefined) {
      const n = line[colMap.note];
      if (n !== undefined && n !== "") note = String(n).trim();
    }

    rows.push({ channelName, payoutRate: payout, note });
  }

  if (rows.length === 0) {
    return { rows: [], error: "유효한 채널 행이 없습니다." };
  }

  return { rows, error: null };
}

/** 채널 수수료 엑셀 훅 — 변경 이유: SheetJS 업로드·템플릿·기본값 복원 */
export function useChannelRates() {
  const [rates, setRates] = useState<ChannelRate[]>(DEFAULT_CHANNEL_RATES);
  const [error, setError] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);

  const reset = useCallback(() => {
    setRates(DEFAULT_CHANNEL_RATES);
    setError(null);
    setIsCustom(false);
  }, []);

  const upload = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          setError("파일을 읽지 못했습니다.");
          return;
        }
        const workbook = XLSX.read(data, { type: "array" });
        const { rows, error: parseErr } = parseFirstSheet(workbook);
        if (parseErr) {
          setError(parseErr);
          return;
        }
        setRates(rows);
        setIsCustom(true);
      } catch {
        setError("엑셀 파싱 중 오류가 발생했습니다.");
      }
    };
    reader.onerror = () => setError("파일 읽기에 실패했습니다.");
    reader.readAsArrayBuffer(file);
  }, []);

  const downloadTemplate = useCallback(() => {
    const templateRows = [
      { 채널명: "쿠팡 로켓배송", 정산비율: 0.56, 비고: "매출 최우선 예시" },
      { 채널명: "쿠팡 판매자로켓", 정산비율: 0.85, 비고: "" },
      { 채널명: "네이버 스마트스토어", 정산비율: 0.965, 비고: "" },
    ];
    const sheet = XLSX.utils.json_to_sheet(templateRows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "채널수수료");
    XLSX.writeFile(book, "채널수수료_템플릿.xlsx");
  }, []);

  return useMemo(
    () => ({
      rates,
      error,
      isCustom,
      upload,
      reset,
      downloadTemplate,
    }),
    [rates, error, isCustom, upload, reset, downloadTemplate]
  );
}
