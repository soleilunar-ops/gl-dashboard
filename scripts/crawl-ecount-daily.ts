/**
 * Ecount 재고수불부 일일 배치 크롤
 *
 * 실행: npm run crawl:ecount  (로컬) — 또는 GitHub Actions .github/workflows/ecount-daily-crawl.yml
 *
 * 흐름
 *  1. item_erp_mapping + item_master(is_active) 조회 → erp_system별 ERP 코드 목록
 *  2. 법인별 (gl / glpharm / hnb) 로그인 1회 → 해당 시스템에 매핑된 코드 순회
 *  3. 어제~오늘 재고수불부 엑셀 다운로드 → parse → orders UPSERT
 *  4. data_sync_log에 결과 1줄 기록
 *
 * 필수 env (GitHub Secrets로 주입):
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - ECOUNT_GL_COM_CODE, ECOUNT_GL_USER_ID, ECOUNT_GL_USER_PW
 *  - ECOUNT_GLPHARM_COM_CODE, ECOUNT_GLPHARM_USER_ID, ECOUNT_GLPHARM_USER_PW
 *  - ECOUNT_HNB_COM_CODE, ECOUNT_HNB_USER_ID, ECOUNT_HNB_USER_PW
 */

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { loginToEcount } from "@/lib/ecount/ecountAuth";
import { downloadAndParseLedger } from "@/lib/ecount/ecountExcel";
import { openLedgerAndFillFilters } from "@/lib/ecount/ecountNavigation";
import { persistOrdersToSupabase } from "@/lib/ecount/ecountPersist";

type ErpSystem = "gl" | "glpharm" | "hnb";
const SYSTEMS: readonly ErpSystem[] = ["gl", "glpharm", "hnb"];

function envOrThrow(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`환경변수 누락: ${key}`);
  return v;
}

function envOrNull(key: string): string | null {
  return process.env[key] || null;
}

// Asia/Seoul 기준 YYYY-MM-DD
function kstDate(offsetDays: number): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return kst.toISOString().slice(0, 10);
}

function credsFor(system: ErpSystem) {
  const upper = system.toUpperCase();
  const com = envOrNull(`ECOUNT_${upper}_COM_CODE`);
  const user = envOrNull(`ECOUNT_${upper}_USER_ID`);
  const pw = envOrNull(`ECOUNT_${upper}_USER_PW`);
  if (!com || !user || !pw) return null;
  return { company: com, userId: user, password: pw };
}

type MappingRow = {
  erp_system: string;
  erp_code: string;
  item_id: number;
};

async function main() {
  const SUPABASE_URL = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const SERVICE_KEY = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const dateFrom = kstDate(-1);
  const dateTo = kstDate(0);
  console.log(`[ecount-daily] 크롤 범위: ${dateFrom} ~ ${dateTo}`);

  const { data: rows, error: qErr } = await supabase
    .from("item_erp_mapping")
    .select("erp_system, erp_code, item_id, item_master!inner(is_active)")
    .eq("item_master.is_active", true);

  if (qErr) throw new Error(`item_erp_mapping 조회 실패: ${qErr.message}`);

  const mappings = (rows ?? []) as unknown as MappingRow[];
  const bySystem: Record<ErpSystem, MappingRow[]> = { gl: [], glpharm: [], hnb: [] };
  for (const m of mappings) {
    if (SYSTEMS.includes(m.erp_system as ErpSystem)) {
      bySystem[m.erp_system as ErpSystem].push(m);
    }
  }

  const summary = {
    total_codes: 0,
    saved_rows: 0,
    ok: 0,
    failed: 0,
    skipped_systems: [] as ErpSystem[],
    errors: [] as Array<{ system: string; code: string; message: string }>,
  };

  for (const system of SYSTEMS) {
    const codes = bySystem[system];
    if (codes.length === 0) continue;

    const cred = credsFor(system);
    if (!cred) {
      console.warn(`[${system}] 자격증명 환경변수 누락 — 해당 법인 건너뜀`);
      summary.skipped_systems.push(system);
      continue;
    }

    console.log(`[${system}] ${codes.length}개 코드 크롤 시작`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    try {
      const activePage = await loginToEcount(page, context, cred);

      for (const { erp_code } of codes) {
        summary.total_codes += 1;
        try {
          const { ledgerFrame, ledgerScopes } = await openLedgerAndFillFilters(activePage, {
            itemCode: erp_code,
            dateFrom,
            dateTo,
          });
          const parsed = await downloadAndParseLedger(activePage, ledgerFrame, ledgerScopes);
          const result = await persistOrdersToSupabase(parsed, erp_code, {
            dryRun: false,
            client: supabase,
          });
          summary.saved_rows += result.saved_count;
          summary.ok += 1;
        } catch (e) {
          summary.failed += 1;
          const msg = e instanceof Error ? e.message : String(e);
          summary.errors.push({ system, code: erp_code, message: msg.slice(0, 300) });
          console.error(`[${system}] ${erp_code} 실패: ${msg.slice(0, 200)}`);
        }
      }
    } finally {
      await browser.close();
    }
  }

  console.log("[ecount-daily] 요약:", JSON.stringify(summary, null, 2));

  await supabase.from("data_sync_log").insert({
    table_name: "orders",
    status: summary.failed === 0 && summary.skipped_systems.length === 0 ? "success" : "partial",
    error_message: `codes=${summary.total_codes}, ok=${summary.ok}, failed=${summary.failed}, saved=${summary.saved_rows}, skipped=${summary.skipped_systems.join(",") || "-"}`,
    synced_at: new Date().toISOString(),
  });

  // 전부 실패/스킵이면 CI 실패 처리
  if (summary.ok === 0) process.exit(1);
  // 일부만 실패면 경고만, exit 0
  process.exit(0);
}

main().catch((e) => {
  console.error("[ecount-daily] 치명적 오류:", e);
  process.exit(2);
});
