/**
 * Ecount 크롤 엔진 — Railway 서비스(HTTP)와 scripts CLI 양쪽에서 공유
 *
 * 외부 인터페이스
 *  - crawlAllSystems({ dateFrom, dateTo, onLog? })
 *  - crawlSingleItem({ system, erpCode, dateFrom, dateTo })
 *  - resolveSystemForCode(erpCode) → auto-detect 용
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { loginToEcount } from "@/lib/ecount/ecountAuth";
import { downloadAndParseLedger } from "@/lib/ecount/ecountExcel";
import { openLedgerAndFillFilters } from "@/lib/ecount/ecountNavigation";
import { persistOrdersToSupabase } from "@/lib/ecount/ecountPersist";

export type ErpSystem = "gl" | "glpharm" | "hnb";
export const SYSTEMS: readonly ErpSystem[] = ["gl", "glpharm", "hnb"];

export const TIMEOUT_LOGIN_MS = 90_000;
export const TIMEOUT_PER_STEP_MS = 60_000;

export type LogFn = (line: string) => void;

export type BatchSummary = {
  range: { date_from: string; date_to: string };
  total_codes: number;
  saved_rows: number;
  ok: number;
  failed: number;
  skipped_systems: ErpSystem[];
  errors: Array<{ system: string; code: string; message: string }>;
};

export type SingleResult = {
  ok: true;
  system: ErpSystem;
  erp_code: string;
  saved_count: number;
  message: string;
};

function envOrThrow(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`환경변수 누락: ${key}`);
  return v;
}

function envOrNull(key: string): string | null {
  return process.env[key] || null;
}

export function supabaseAdmin(): SupabaseClient {
  const url = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const key = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function credsFor(system: ErpSystem) {
  const upper = system.toUpperCase();
  const com = envOrNull(`ECOUNT_${upper}_COM_CODE`);
  const user = envOrNull(`ECOUNT_${upper}_USER_ID`);
  const pw = envOrNull(`ECOUNT_${upper}_USER_PW`);
  if (!com || !user || !pw) return null;
  return { company: com, userId: user, password: pw };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 타임아웃 ${Math.floor(ms / 1000)}s`)), ms)
    ),
  ]);
}

export function kstDate(offsetDays: number): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return kst.toISOString().slice(0, 10);
}

export async function resolveSystemForCode(erpCode: string): Promise<ErpSystem> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("item_erp_mapping")
    .select("erp_system")
    .eq("erp_code", erpCode)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`mapping 조회 실패: ${error.message}`);
  if (!data) throw new Error(`erp_code="${erpCode}" 매핑 없음`);
  if (!SYSTEMS.includes(data.erp_system as ErpSystem)) {
    throw new Error(`알 수 없는 erp_system=${data.erp_system}`);
  }
  return data.erp_system as ErpSystem;
}

/** 단일 품목 크롤 — 브라우저 launch → login → ledger → persist → close */
export async function crawlSingleItem(params: {
  system: ErpSystem;
  erpCode: string;
  dateFrom?: string;
  dateTo?: string;
  log?: LogFn;
}): Promise<SingleResult> {
  const log = params.log ?? ((l) => console.log(l));
  const dateFrom = params.dateFrom ?? kstDate(-1);
  const dateTo = params.dateTo ?? kstDate(0);

  const cred = credsFor(params.system);
  if (!cred) throw new Error(`[${params.system}] 자격증명 환경변수 누락`);

  const supabase = supabaseAdmin();
  const startAt = Date.now();
  log(`[${params.system}] ${params.erpCode} 크롤 시작 (${dateFrom}~${dateTo})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    const activePage = await withTimeout(
      loginToEcount(page, context, cred),
      TIMEOUT_LOGIN_MS,
      `login(${params.system})`
    );
    log(`[${params.system}] 로그인 성공 ${Math.round((Date.now() - startAt) / 1000)}s`);

    const { ledgerFrame, ledgerScopes } = await withTimeout(
      openLedgerAndFillFilters(activePage, {
        itemCode: params.erpCode,
        dateFrom,
        dateTo,
      }),
      TIMEOUT_PER_STEP_MS,
      `openLedger(${params.erpCode})`
    );
    const parsed = await withTimeout(
      downloadAndParseLedger(activePage, ledgerFrame, ledgerScopes),
      TIMEOUT_PER_STEP_MS,
      `downloadLedger(${params.erpCode})`
    );
    const result = await persistOrdersToSupabase(parsed, params.erpCode, {
      dryRun: false,
      client: supabase,
    });

    log(
      `[${params.system}] ${params.erpCode} OK · ${result.saved_count}건 · ${Date.now() - startAt}ms`
    );
    return {
      ok: true,
      system: params.system,
      erp_code: params.erpCode,
      saved_count: result.saved_count,
      message: result.message,
    };
  } finally {
    await browser.close();
  }
}

type MappingRow = { erp_system: string; erp_code: string };

/** 전체 법인·전체 ERP 코드 배치 크롤 */
export async function crawlAllSystems(params: {
  dateFrom?: string;
  dateTo?: string;
  log?: LogFn;
}): Promise<BatchSummary> {
  const log = params.log ?? ((l) => console.log(l));
  const dateFrom = params.dateFrom ?? kstDate(-1);
  const dateTo = params.dateTo ?? kstDate(0);
  const supabase = supabaseAdmin();

  log(`[batch] 크롤 범위: ${dateFrom} ~ ${dateTo}`);

  const { data: rows, error: qErr } = await supabase
    .from("item_erp_mapping")
    .select("erp_system, erp_code, item_master!inner(is_active)")
    .eq("item_master.is_active", true);
  if (qErr) throw new Error(`item_erp_mapping 조회 실패: ${qErr.message}`);

  const mappings = (rows ?? []) as unknown as MappingRow[];
  const bySystem: Record<ErpSystem, string[]> = { gl: [], glpharm: [], hnb: [] };
  const seen: Record<ErpSystem, Set<string>> = {
    gl: new Set(),
    glpharm: new Set(),
    hnb: new Set(),
  };
  for (const m of mappings) {
    const sys = m.erp_system as ErpSystem;
    if (!SYSTEMS.includes(sys)) continue;
    if (seen[sys].has(m.erp_code)) continue;
    seen[sys].add(m.erp_code);
    bySystem[sys].push(m.erp_code);
  }

  log(
    `[batch] 고유 코드: gl=${bySystem.gl.length}, glpharm=${bySystem.glpharm.length}, hnb=${bySystem.hnb.length}`
  );

  const summary: BatchSummary = {
    range: { date_from: dateFrom, date_to: dateTo },
    total_codes: 0,
    saved_rows: 0,
    ok: 0,
    failed: 0,
    skipped_systems: [],
    errors: [],
  };

  for (const system of SYSTEMS) {
    const codes = bySystem[system];
    if (codes.length === 0) continue;

    const cred = credsFor(system);
    if (!cred) {
      log(`[${system}] 자격증명 누락 — 스킵`);
      summary.skipped_systems.push(system);
      continue;
    }

    const systemStart = Date.now();
    log(`\n[${system}] 브라우저 시작, 로그인 대기`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    let systemOk = 0;
    let systemFailed = 0;

    try {
      const activePage = await withTimeout(
        loginToEcount(page, context, cred),
        TIMEOUT_LOGIN_MS,
        `login(${system})`
      );
      log(`[${system}] 로그인 성공 ${Math.round((Date.now() - systemStart) / 1000)}s`);
      log(`[${system}] ${codes.length}개 코드 순회 시작`);

      for (let i = 0; i < codes.length; i++) {
        const erp_code = codes[i];
        const codeStart = Date.now();
        summary.total_codes += 1;

        try {
          const { ledgerFrame, ledgerScopes } = await withTimeout(
            openLedgerAndFillFilters(activePage, { itemCode: erp_code, dateFrom, dateTo }),
            TIMEOUT_PER_STEP_MS,
            `openLedger(${erp_code})`
          );
          const parsed = await withTimeout(
            downloadAndParseLedger(activePage, ledgerFrame, ledgerScopes),
            TIMEOUT_PER_STEP_MS,
            `downloadLedger(${erp_code})`
          );
          const result = await persistOrdersToSupabase(parsed, erp_code, {
            dryRun: false,
            client: supabase,
          });

          summary.saved_rows += result.saved_count;
          summary.ok += 1;
          systemOk += 1;
          log(
            `[${system}] [${i + 1}/${codes.length}] ${erp_code} OK · ${result.saved_count}건 · ${Date.now() - codeStart}ms`
          );
        } catch (e) {
          summary.failed += 1;
          systemFailed += 1;
          const msg = e instanceof Error ? e.message : String(e);
          summary.errors.push({ system, code: erp_code, message: msg.slice(0, 300) });
          log(
            `[${system}] [${i + 1}/${codes.length}] ${erp_code} 실패 · ${Date.now() - codeStart}ms · ${msg.slice(0, 180)}`
          );
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`[${system}] 시스템 치명적 오류 — 나머지 스킵: ${msg}`);
      summary.errors.push({ system, code: "<SYSTEM>", message: msg.slice(0, 300) });
    } finally {
      await browser.close();
      log(
        `[${system}] 종료: ok=${systemOk} failed=${systemFailed} · ${Math.round((Date.now() - systemStart) / 1000)}s`
      );
    }
  }

  await supabase.from("data_sync_log").insert({
    table_name: "orders",
    status: summary.failed === 0 && summary.skipped_systems.length === 0 ? "success" : "partial",
    error_message: `codes=${summary.total_codes}, ok=${summary.ok}, failed=${summary.failed}, saved=${summary.saved_rows}, skipped=${summary.skipped_systems.join(",") || "-"}`,
    synced_at: new Date().toISOString(),
  });

  log(`\n[batch] 완료 — ${JSON.stringify(summary)}`);
  return summary;
}
