/**
 * Ecount 재고수불부 일일 배치 크롤
 *
 * 실행: npm run crawl:ecount  (로컬) — 또는 GitHub Actions .github/workflows/ecount-daily-crawl.yml
 *
 * 흐름
 *  1. item_erp_mapping + item_master(is_active) 조회 → erp_system별 erp_code 고유 목록
 *  2. 법인별 (gl / glpharm / hnb) 로그인 1회 → 코드 순회
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

// 한 코드당 최대 대기 시간 — Ecount UI에서 멈출 경우 전체 흐름 차단 방지
const TIMEOUT_PER_CODE_MS = 60_000;
// 로그인 단계 최대 대기 시간
const TIMEOUT_LOGIN_MS = 90_000;

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

// 오래 걸리는 비동기 작업에 타임아웃 — 한 코드가 멈춰도 다음으로 진행
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 타임아웃 ${Math.floor(ms / 1000)}s`)), ms)
    ),
  ]);
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

  // erp_system별로 erp_code 중복 제거 — 같은 코드가 여러 item_id에 매핑될 수 있음
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

  console.log(
    `[ecount-daily] 고유 코드: gl=${bySystem.gl.length}, glpharm=${bySystem.glpharm.length}, hnb=${bySystem.hnb.length} (총 ${bySystem.gl.length + bySystem.glpharm.length + bySystem.hnb.length}건)`
  );

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

    const systemStart = Date.now();
    console.log(`\n[${system}] 브라우저 시작, 로그인 대기`);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    let systemOk = 0;
    let systemFailed = 0;

    try {
      const activePage = await withTimeout(
        loginToEcount(page, context, cred),
        TIMEOUT_LOGIN_MS,
        `loginToEcount(${system})`
      );
      console.log(`[${system}] 로그인 성공 (${Math.round((Date.now() - systemStart) / 1000)}s)`);
      console.log(`[${system}] ${codes.length}개 코드 순회 시작`);

      for (let i = 0; i < codes.length; i++) {
        const erp_code = codes[i];
        const codeStart = Date.now();
        summary.total_codes += 1;

        try {
          const { ledgerFrame, ledgerScopes } = await withTimeout(
            openLedgerAndFillFilters(activePage, { itemCode: erp_code, dateFrom, dateTo }),
            TIMEOUT_PER_CODE_MS,
            `openLedgerAndFillFilters(${erp_code})`
          );
          const parsed = await withTimeout(
            downloadAndParseLedger(activePage, ledgerFrame, ledgerScopes),
            TIMEOUT_PER_CODE_MS,
            `downloadAndParseLedger(${erp_code})`
          );
          const result = await persistOrdersToSupabase(parsed, erp_code, {
            dryRun: false,
            client: supabase,
          });

          summary.saved_rows += result.saved_count;
          summary.ok += 1;
          systemOk += 1;

          const ms = Date.now() - codeStart;
          console.log(
            `[${system}] [${i + 1}/${codes.length}] ${erp_code} OK · ${result.saved_count}건 · ${ms}ms`
          );
        } catch (e) {
          summary.failed += 1;
          systemFailed += 1;
          const msg = e instanceof Error ? e.message : String(e);
          summary.errors.push({ system, code: erp_code, message: msg.slice(0, 300) });
          const ms = Date.now() - codeStart;
          console.error(
            `[${system}] [${i + 1}/${codes.length}] ${erp_code} 실패 · ${ms}ms · ${msg.slice(0, 180)}`
          );
        }
      }
    } catch (e) {
      // 로그인 타임아웃 등 시스템 단위 치명적 오류
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[${system}] 시스템 치명적 오류 — 나머지 코드 스킵: ${msg}`);
      summary.errors.push({ system, code: "<LOGIN>", message: msg.slice(0, 300) });
    } finally {
      await browser.close();
      const totalS = Math.round((Date.now() - systemStart) / 1000);
      console.log(`[${system}] 종료: ok=${systemOk} failed=${systemFailed} · 소요 ${totalS}s`);
    }
  }

  console.log("\n[ecount-daily] 최종 요약:", JSON.stringify(summary, null, 2));

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
