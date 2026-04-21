"use client";

import { useCallback, useMemo, useState } from "react";
import * as XLSX from "xlsx";

/** 업로드된 채널별 정산 비율 — 변경 이유: 마진 산출 채널 선택 연동 */
export type ChannelRate = {
  channelName: string;
  payoutRate: number;
  feeText?: string;
  note?: string;
};

/** 기본 채널 수수료 — 변경 이유: 엑셀 없이도 즉시 사용 */
export const DEFAULT_CHANNEL_RATES: ChannelRate[] = [
  { channelName: "쿠팡 로켓배송", payoutRate: 0.56, feeText: "44%", note: "매출 최우선" },
  { channelName: "쿠팡 판매자로켓", payoutRate: 0.85, feeText: "15%" },
  { channelName: "네이버 스마트스토어", payoutRate: 0.965, feeText: "3.5%" },
  { channelName: "지마켓", payoutRate: 0.89, feeText: "11%" },
  { channelName: "SSG닷컴", payoutRate: 0.88, feeText: "12%" },
  { channelName: "카카오선물하기", payoutRate: 0.93, feeText: "7%" },
];

/** 단일 숫자 토큰 → 0~1 비율 — 변경 이유: % 표기·소수 혼용, >1이면 /100 */
function parseSingleNumber(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const v = n > 1 ? n / 100 : n;
  if (v <= 0 || v > 1) return null;
  return v;
}

/**
 * 셀 값 → 0~1 비율
 * 변경 이유: "45%-50%" 같은 범위 값은 평균, "(VAT 별도)" 등 괄호 텍스트는 제거
 */
function normalizeRateCell(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    return parseSingleNumber(String(v));
  }
  let s = String(v).trim();
  if (s === "") return null;
  // 괄호·주석 제거 후 %·콤마 정리
  s = s
    .replace(/\([^)]*\)/g, "")
    .replace(/%/g, "")
    .replace(/,/g, "")
    .trim();
  if (s === "") return null;
  // 범위(-, ~, 물결 등)는 평균으로 대체
  const rangeMatch = s
    .split(/[-~–—]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (rangeMatch.length >= 2) {
    const nums = rangeMatch.map(parseSingleNumber).filter((n): n is number => n !== null);
    if (nums.length === 0) return null;
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    if (avg <= 0 || avg > 1) return null;
    return avg;
  }
  return parseSingleNumber(s);
}

/** 정산비율 셀 — 위와 동일 */
function normalizePayoutCell(v: unknown): number | null {
  return normalizeRateCell(v);
}

/** 수수료율 셀 → 정산비율 (1 - 수수료) — 변경 이유: 업로드 컬럼명 변형 대응 */
function normalizeFeeToPayout(v: unknown): number | null {
  const raw = normalizeRateCell(v);
  if (raw === null) return null;
  const oneMinus = 1 - raw;
  if (oneMinus <= 0 || oneMinus > 1) return null;
  return oneMinus;
}

type HeaderKind = "channel" | "payout" | "fee" | "note";

/** 헤더 셀 → 의미 매핑 — 변경 이유: 업로드 엑셀의 '사이트' 컬럼도 채널로 인식 */
function matchHeaderCell(h: string): HeaderKind | null {
  const t = h.trim();
  if (/채널|사이트|channel|site/i.test(t)) return "channel";
  if (/정산/.test(t)) return "payout";
  if (/수수료/.test(t)) return "fee";
  if (/비고|메모|note/i.test(t)) return "note";
  return null;
}

/**
 * 헤더 행 자동 탐색 — 변경 이유: 제목/빈 행이 위에 있는 엑셀 대응
 * 최대 12행까지 스캔하여 channel + (payout|fee) 모두 찾으면 그 행을 헤더로 채택.
 */
function findHeaderRow(matrix: unknown[][]): {
  headerIdx: number;
  colMap: Partial<Record<HeaderKind, number>>;
} | null {
  const maxScan = Math.min(matrix.length, 12);
  for (let r = 0; r < maxScan; r++) {
    const row = (matrix[r] ?? []).map((c) => String(c ?? "").trim());
    const localMap: Partial<Record<HeaderKind, number>> = {};
    row.forEach((cell, idx) => {
      const kind = matchHeaderCell(cell);
      if (kind && localMap[kind] === undefined) localMap[kind] = idx;
    });
    if (
      localMap.channel !== undefined &&
      (localMap.payout !== undefined || localMap.fee !== undefined)
    ) {
      return { headerIdx: r, colMap: localMap };
    }
  }
  return null;
}

/** 첫 시트 파싱 — 변경 이유: 요구 스키마 + 헤더 자동 탐색 */
function parseFirstSheet(workbook: XLSX.WorkBook): { rows: ChannelRate[]; error: string | null } {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], error: "시트가 비어 있습니다." };
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });

  if (!matrix.length) {
    return { rows: [], error: "데이터 행이 없습니다." };
  }

  const found = findHeaderRow(matrix);
  if (!found) {
    return {
      rows: [],
      error: "헤더(사이트/채널명 + 수수료율/정산비율)를 찾을 수 없습니다.",
    };
  }
  const { headerIdx, colMap } = found;

  const seen = new Set<string>();
  const rows: ChannelRate[] = [];

  for (let r = headerIdx + 1; r < matrix.length; r++) {
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

    let feeText: string | undefined;
    if (colMap.fee !== undefined) {
      const feeCell = String(line[colMap.fee] ?? "").trim();
      if (feeCell !== "") feeText = feeCell;
    }

    rows.push({ channelName, payoutRate: payout, feeText, note });
  }

  if (rows.length === 0) {
    return { rows: [], error: "유효한 채널 행이 없습니다." };
  }

  return { rows, error: null };
}

/** 채널 수수료 엑셀 훅 — 변경 이유: SheetJS 업로드·템플릿·기본값 복원 + 파일명 보관 */
export function useChannelRates() {
  const [rates, setRates] = useState<ChannelRate[]>(DEFAULT_CHANNEL_RATES);
  const [error, setError] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const reset = useCallback(() => {
    setRates(DEFAULT_CHANNEL_RATES);
    setError(null);
    setIsCustom(false);
    setFileName(null);
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
        setFileName(file.name);
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
      fileName,
      upload,
      reset,
      downloadTemplate,
    }),
    [rates, error, isCustom, fileName, upload, reset, downloadTemplate]
  );
}
