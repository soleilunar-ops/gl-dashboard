/**
 * 변경 이유: 루트의 `쿠팡_로켓배송_밀크런_파렛트_단가.xlsx`가 있으면 3행 센터명·5행 BASIC만 읽어
 * `src/data/milkrun-centers.json`을 생성합니다. (엑셀 없으면 안내 후 종료)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";

const ROOT = process.cwd();
const XLSX_PATH = path.join(ROOT, "쿠팡_로켓배송_밀크런_파렛트_단가.xlsx");
const OUT = path.join(ROOT, "src", "data", "milkrun-centers.json");

function main(): void {
  if (!fs.existsSync(XLSX_PATH)) {
    console.warn(`엑셀을 찾을 수 없습니다: ${XLSX_PATH}`);
    console.warn("프로젝트 루트에 파일을 두고 다시 실행하세요.");
    process.exit(0);
  }

  const workbook = XLSX.readFile(XLSX_PATH);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    console.error("시트가 없습니다.");
    process.exit(1);
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    console.error("시트를 읽을 수 없습니다.");
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true }) as unknown[][];
  const nameRow = rows[2] as unknown[] | undefined;
  const basicRow = rows[4] as unknown[] | undefined;
  if (!nameRow || !basicRow) {
    console.error("3행(센터명) 또는 5행(BASIC)이 없습니다.");
    process.exit(1);
  }

  const out: Array<{ name: string; basic: number }> = [];
  for (let col = 1; col < nameRow.length; col += 1) {
    const name = String(nameRow[col] ?? "").trim();
    if (!name) continue;
    const rawBasic = basicRow[col];
    const basic =
      typeof rawBasic === "number"
        ? Math.round(rawBasic)
        : Number(String(rawBasic ?? "").replace(/,/g, ""));
    if (!Number.isFinite(basic)) continue;
    out.push({ name, basic });
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`작성 완료: ${OUT} (${out.length}건)`);
}

main();
