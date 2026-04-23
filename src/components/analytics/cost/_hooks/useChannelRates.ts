"use client";

// 채널별 수수료 훅 — Supabase `channel_rates` 테이블 기반으로 전환.
// localStorage 에서 이관 (모든 사용자·기기에서 공유되도록).
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";

// channel_rates 테이블은 types.ts 재생성 전이라 캐스트로 우회.
type UntypedDb = {
  from: (table: string) => {
    select: (cols: string) => {
      order: (
        c: string,
        o?: { ascending?: boolean }
      ) => {
        order: (
          c: string,
          o?: { ascending?: boolean }
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    delete: () => {
      gt: (c: string, v: number) => Promise<{ error: { message: string } | null }>;
    };
    insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>;
  };
};

/** UI용 채널 수수료 */
export type ChannelRate = {
  channelName: string;
  payoutRate: number;
  feeText?: string;
  note?: string;
};

/** 기본 시드 — 테이블이 비어 있을 때 fallback */
export const DEFAULT_CHANNEL_RATES: ChannelRate[] = [
  { channelName: "쿠팡 로켓배송", payoutRate: 0.56, feeText: "44%", note: "매출 최우선" },
  { channelName: "쿠팡 판매자로켓", payoutRate: 0.85, feeText: "15%" },
  { channelName: "네이버 스마트스토어", payoutRate: 0.965, feeText: "3.5%" },
  { channelName: "지마켓", payoutRate: 0.89, feeText: "11%" },
  { channelName: "SSG닷컴", payoutRate: 0.88, feeText: "12%" },
  { channelName: "카카오선물하기", payoutRate: 0.93, feeText: "7%" },
];

/** channel_rates 행 타입 (Supabase 스키마 그대로) */
type DbRow = {
  channel_name: string;
  payout_rate: number;
  fee_text: string | null;
  note: string | null;
  sort_order: number;
};

function parseSingleNumber(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const v = n > 1 ? n / 100 : n;
  if (v <= 0 || v > 1) return null;
  return v;
}

function normalizeRateCell(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    return parseSingleNumber(String(v));
  }
  let s = String(v).trim();
  if (s === "") return null;
  s = s
    .replace(/\([^)]*\)/g, "")
    .replace(/%/g, "")
    .replace(/,/g, "")
    .trim();
  if (s === "") return null;
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

function normalizePayoutCell(v: unknown): number | null {
  return normalizeRateCell(v);
}

function normalizeFeeToPayout(v: unknown): number | null {
  const raw = normalizeRateCell(v);
  if (raw === null) return null;
  const oneMinus = 1 - raw;
  if (oneMinus <= 0 || oneMinus > 1) return null;
  return oneMinus;
}

type HeaderKind = "channel" | "payout" | "fee" | "note";

function matchHeaderCell(h: string): HeaderKind | null {
  const t = h.trim();
  if (/채널|사이트|channel|site/i.test(t)) return "channel";
  if (/정산/.test(t)) return "payout";
  if (/수수료/.test(t)) return "fee";
  if (/비고|메모|note/i.test(t)) return "note";
  return null;
}

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

function parseFirstSheet(workbook: XLSX.WorkBook): { rows: ChannelRate[]; error: string | null } {
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], error: "시트가 비어 있습니다." };
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (!matrix.length) return { rows: [], error: "데이터 행이 없습니다." };

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
    if (payout === null) continue;

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

  if (rows.length === 0) return { rows: [], error: "유효한 채널 행이 없습니다." };
  return { rows, error: null };
}

function rowToDb(r: ChannelRate, index: number): DbRow {
  return {
    channel_name: r.channelName,
    payout_rate: r.payoutRate,
    fee_text: r.feeText ?? null,
    note: r.note ?? null,
    sort_order: index + 1,
  };
}

function dbToRow(d: DbRow): ChannelRate {
  return {
    channelName: d.channel_name,
    payoutRate: Number(d.payout_rate),
    feeText: d.fee_text ?? undefined,
    note: d.note ?? undefined,
  };
}

export function useChannelRates() {
  const [rates, setRates] = useState<ChannelRate[]>(DEFAULT_CHANNEL_RATES);
  const [error, setError] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // 마운트 시 Supabase에서 채널 목록 로드
  const fetchRates = useCallback(async () => {
    const supabase = createClient() as unknown as UntypedDb;
    const { data, error: fetchErr } = await supabase
      .from("channel_rates")
      .select("channel_name,payout_rate,fee_text,note,sort_order")
      .order("sort_order", { ascending: true })
      .order("channel_name", { ascending: true });
    if (fetchErr) {
      setError(`채널 목록 조회 실패: ${fetchErr.message}`);
      setLoaded(true);
      return;
    }
    const rows = (Array.isArray(data) ? data : []) as DbRow[];
    if (rows.length === 0) {
      setRates(DEFAULT_CHANNEL_RATES);
      setIsCustom(false);
    } else {
      setRates(rows.map(dbToRow));
      // 기본 6개와 동일하지 않으면 custom
      const nameSet = new Set(rows.map((r) => r.channel_name));
      const baseSet = new Set(DEFAULT_CHANNEL_RATES.map((r) => r.channelName));
      const isSame = nameSet.size === baseSet.size && [...nameSet].every((n) => baseSet.has(n));
      setIsCustom(!isSame);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void fetchRates();
  }, [fetchRates]);

  const reset = useCallback(async () => {
    setError(null);
    const supabase = createClient() as unknown as UntypedDb;
    const { error: delErr } = await supabase.from("channel_rates").delete().gt("id", 0);
    if (delErr) {
      setError(`초기화 실패: ${delErr.message}`);
      return;
    }
    const payload = DEFAULT_CHANNEL_RATES.map((r, i) => rowToDb(r, i));
    const { error: insErr } = await supabase.from("channel_rates").insert(payload);
    if (insErr) {
      setError(`기본값 삽입 실패: ${insErr.message}`);
      return;
    }
    setFileName(null);
    await fetchRates();
  }, [fetchRates]);

  const upload = useCallback(
    (file: File) => {
      setError(null);
      const reader = new FileReader();
      reader.onload = async (e) => {
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
          const supabase = createClient() as unknown as UntypedDb;
          // 기존 전체 삭제 후 업로드된 목록 일괄 INSERT (엑셀에 없는 채널은 제거됨)
          const { error: delErr } = await supabase.from("channel_rates").delete().gt("id", 0);
          if (delErr) {
            setError(`기존 목록 제거 실패: ${delErr.message}`);
            return;
          }
          const payload = rows.map((r, i) => rowToDb(r, i));
          const { error: insErr } = await supabase.from("channel_rates").insert(payload);
          if (insErr) {
            setError(`업로드 실패: ${insErr.message}`);
            return;
          }
          setFileName(file.name);
          await fetchRates();
        } catch (err) {
          setError(err instanceof Error ? err.message : "엑셀 파싱 중 오류가 발생했습니다.");
        }
      };
      reader.onerror = () => setError("파일 읽기에 실패했습니다.");
      reader.readAsArrayBuffer(file);
    },
    [fetchRates]
  );

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
      loaded,
      upload,
      reset,
      downloadTemplate,
    }),
    [rates, error, isCustom, fileName, loaded, upload, reset, downloadTemplate]
  );
}
