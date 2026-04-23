/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const SOURCE = path.join(
  __dirname,
  "..",
  "src",
  "components",
  "logistics",
  "_data",
  "dailyInventoryBase.ts",
);

const OUT = path.join(__dirname, "..", "docs", "items_seed_from_dailyInventoryBase.sql");

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''");
}

function main() {
  const text = fs.readFileSync(SOURCE, "utf8");

  // Parse objects with fixed formatting:
  // { seqNo: 1, productCode: "GL...", productName: "...", productionType: "...", qty: 123, amount: 456, }
  const re =
    /\{\s*seqNo:\s*(\d+),\s*productCode:\s*"([^"]+)",\s*productName:\s*"([^"]+)",\s*productionType:\s*"([^"]+)",\s*qty:\s*(-?\d+),\s*amount:\s*(-?\d+),\s*\}/gms;

  /** @type {{seq:number, code:string, name:string, type:string, cost:number}[]} */
  const rows = [];
  let m;
  while ((m = re.exec(text))) {
    const seq = Number(m[1]);
    const code = m[2];
    const name = m[3];
    const type = m[4];
    const qty = Number(m[5]);
    const amount = Number(m[6]);
    const cost = qty === 0 ? 0 : Math.round((amount / qty) * 100) / 100;
    rows.push({ seq, code, name, type, cost });
  }

  if (rows.length === 0) {
    throw new Error("No rows parsed from dailyInventoryBase.ts");
  }

  rows.sort((a, b) => a.seq - b.seq);

  let sql = "";
  sql += "-- dailyInventoryBase.ts 기준 items 초기 적재\n";
  sql += "-- 실행 위치: Supabase Dashboard > SQL Editor\n\n";
  sql += "-- 1) erp_code 유니크 인덱스(UPSERT용)\n";
  sql +=
    "create unique index if not exists items_erp_code_key on public.items (erp_code) where erp_code is not null;\n\n";
  sql += "-- 2) upsert\n";
  sql +=
    "insert into public.items (seq_no, item_name, production_type, erp_code, cost_price, is_active) values\n";
  sql += rows
    .map((r) => {
      return `  (${r.seq}, '${escapeSqlString(r.name)}', '${escapeSqlString(r.type)}', '${escapeSqlString(
        r.code,
      )}', ${r.cost.toFixed(2)}, true)`;
    })
    .join(",\n");
  sql +=
    "\n on conflict (erp_code) do update set\n  seq_no = excluded.seq_no,\n  item_name = excluded.item_name,\n  production_type = excluded.production_type,\n  cost_price = excluded.cost_price,\n  is_active = true;\n";

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, sql, "utf8");
  console.log(`OK: parsed ${rows.length} rows`);
  console.log(`Wrote: ${OUT}`);
}

main();

