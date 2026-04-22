import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const execFileAsync = promisify(execFile);

/** UI 거래유형 → ecount_crawler.py --menu 값(생산입고는 외주+입고조회 두 메뉴 순회) */
const DEAL_KIND_SET = new Set(["purchase", "sales", "returns", "production"]);

function isDealKind(v: unknown): v is DealKind {
  return typeof v === "string" && DEAL_KIND_SET.has(v);
}

type DealKind = "purchase" | "sales" | "returns" | "production";

function crawlerMenusForDeal(kind: DealKind): string[] {
  switch (kind) {
    case "purchase":
      return ["purchase"];
    case "sales":
      return ["sales"];
    case "returns":
      return ["stock_ledger"];
    case "production":
      return ["production_outsource", "production_receipt"];
  }
}

async function runPythonCrawler(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const cwd = process.cwd();
  const scriptPath = path.join(cwd, "scripts", "ecount_crawler.py");
  const opts = {
    cwd,
    maxBuffer: 80 * 1024 * 1024,
    timeout: 45 * 60 * 1000,
    windowsHide: true as const,
    env: { ...process.env },
  };

  const attempts: Array<{ cmd: string; args: string[] }> =
    process.platform === "win32"
      ? [
          { cmd: "py", args: ["-3", scriptPath, ...args] },
          { cmd: "python", args: [scriptPath, ...args] },
        ]
      : [
          { cmd: "python3", args: [scriptPath, ...args] },
          { cmd: "python", args: [scriptPath, ...args] },
        ];

  let lastErr: unknown;
  for (const { cmd, args: cmdArgs } of attempts) {
    try {
      return await execFileAsync(cmd, cmdArgs, opts);
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException & { stderr?: Buffer };
      if (e.code === "ENOENT") {
        lastErr = err;
        continue;
      }
      const stderr = typeof e.stderr !== "undefined" ? String(e.stderr) : "";
      throw new Error(stderr.slice(0, 2000) || e.message || "크롤러 실행 실패");
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Python 실행 파일을 찾을 수 없습니다. py/python 설치를 확인하세요.");
}

/**
 * 선택 기업·거래유형에 맞춰 로컬 ecount_crawler.py 실행 → Supabase ecount_* 적재
 * 변경 이유: 대시보드 버튼과 크롤 파이프라인을 직접 연결
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const companyCodes = Array.isArray(raw.companyCodes)
    ? raw.companyCodes.filter((c): c is string => typeof c === "string")
    : [];
  const dealKindsRaw = Array.isArray(raw.dealKinds) ? raw.dealKinds : [];
  const dealKinds = dealKindsRaw.filter(isDealKind);
  const dateFrom = typeof raw.dateFrom === "string" ? raw.dateFrom : "2024-01-01";
  const dateTo =
    typeof raw.dateTo === "string" ? raw.dateTo : new Date().toISOString().slice(0, 10);

  const allowedCompanies = new Set(["gl", "gl_pharm", "hnb"]);
  if (companyCodes.some((c) => !allowedCompanies.has(c))) {
    return NextResponse.json({ error: "허용되지 않은 기업 코드입니다." }, { status: 400 });
  }

  if (dealKinds.length === 0) {
    return NextResponse.json({ error: "dealKinds가 비었습니다." }, { status: 400 });
  }

  const menus = [...new Set(dealKinds.flatMap((d) => crawlerMenusForDeal(d)))];
  const runKeys: string[] = [];
  const failures: string[] = [];

  try {
    for (const menu of menus) {
      if (companyCodes.length === 0) {
        runKeys.push(`menu=${menu},company=all`);
        try {
          await runPythonCrawler([
            "--menu",
            menu,
            "--company",
            "all",
            "--from",
            dateFrom,
            "--to",
            dateTo,
          ]);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          failures.push(`[${menu}/전체] ${msg.slice(0, 400)}`);
        }
      } else {
        for (const co of companyCodes) {
          runKeys.push(`menu=${menu},company=${co}`);
          try {
            await runPythonCrawler([
              "--menu",
              menu,
              "--company",
              co,
              "--from",
              dateFrom,
              "--to",
              dateTo,
            ]);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            failures.push(`[${menu}/${co}] ${msg.slice(0, 400)}`);
          }
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `크롤 중단: ${msg.slice(0, 1500)}`, failures, runKeys },
      { status: 500 }
    );
  }

  if (failures.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        warning: "일부 기업·메뉴 조합이 실패했습니다.",
        failures,
        runKeys,
      },
      { status: 207 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: `이카운트 적재를 완료했습니다. (${menus.join(", ")}, ${companyCodes.length === 0 ? "기업 전체" : companyCodes.join(", ")})`,
    runKeys,
  });
}
