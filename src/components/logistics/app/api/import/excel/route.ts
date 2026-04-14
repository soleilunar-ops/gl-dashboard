import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getDb } from "../../../../lib/db";
import { parseDailyTransactionsSheet, parseMasterSheet } from "../../../../lib/excel-import";

interface ImportCounts {
  items: number;
  snapshots: number;
  transactions: number;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copied = Uint8Array.from(buffer);
  return copied.buffer;
}

function readServerFile(filePath: string): ArrayBuffer {
  const normalized = path.resolve(filePath);
  const buffer = fs.readFileSync(normalized);
  return toArrayBuffer(buffer);
}

async function resolveBuffers(
  request: Request
): Promise<{ masterBuffer: ArrayBuffer; txBuffer: ArrayBuffer }> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const masterFile = formData.get("masterFile");
    const txFile = formData.get("txFile");
    const workbookFile = formData.get("workbookFile");

    if (workbookFile instanceof File) {
      const workbook = await workbookFile.arrayBuffer();
      return { masterBuffer: workbook, txBuffer: workbook };
    }

    if (masterFile instanceof File && txFile instanceof File) {
      return {
        masterBuffer: await masterFile.arrayBuffer(),
        txBuffer: await txFile.arrayBuffer(),
      };
    }

    if (masterFile instanceof File) {
      const sameBuffer = await masterFile.arrayBuffer();
      return { masterBuffer: sameBuffer, txBuffer: sameBuffer };
    }
  }

  const body = (await request.json()) as {
    workbookPath?: string;
    masterPath?: string;
    txPath?: string;
  };

  if (body.workbookPath) {
    const workbook = readServerFile(body.workbookPath);
    return { masterBuffer: workbook, txBuffer: workbook };
  }

  if (body.masterPath && body.txPath) {
    return {
      masterBuffer: readServerFile(body.masterPath),
      txBuffer: readServerFile(body.txPath),
    };
  }

  throw new Error("파일 2개(masterFile, txFile) 또는 workbookFile/workbookPath를 전달해주세요.");
}

export async function POST(request: Request) {
  try {
    const { masterBuffer, txBuffer } = await resolveBuffers(request);
    const masterRows = parseMasterSheet(masterBuffer);
    const txRows = parseDailyTransactionsSheet(txBuffer);
    const db = getDb();
    const counts: ImportCounts = { items: 0, snapshots: 0, transactions: 0 };

    const findItemBySeq = db.prepare("SELECT id FROM items WHERE seq_no = ?");
    const insertItem = db.prepare(
      `INSERT INTO items (
         seq_no, category, item_type, production_type, manufacture_year, item_name, unit,
         cost_price, erp_code, erp_item_name, coupang_sku_id, coupang_item_name, mapping_accuracy, mapping_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const updateItem = db.prepare(
      `UPDATE items SET
         category = ?, item_type = ?, production_type = ?, manufacture_year = ?, item_name = ?, unit = ?,
         cost_price = ?, erp_code = ?, erp_item_name = ?, coupang_sku_id = ?, coupang_item_name = ?, mapping_accuracy = ?, mapping_status = ?
       WHERE seq_no = ?`
    );
    const insertSnapshot = db.prepare(
      `INSERT INTO inventory_snapshots (item_id, snapshot_date, physical_qty, carryover_qty, source, note)
       VALUES (?, ?, ?, ?, 'excel_import', ?)`
    );
    const insertTx = db.prepare(
      `INSERT INTO transactions (item_id, tx_date, tx_type, qty, unit_price, amount, source, note)
       VALUES (?, ?, ?, ?, ?, ?, 'excel_import', ?)`
    );

    const tx = db.transaction(() => {
      for (const row of masterRows) {
        const existing = findItemBySeq.get(row.seq_no) as { id: number } | undefined;
        if (existing) {
          updateItem.run(
            row.category,
            row.item_type,
            row.production_type,
            row.manufacture_year,
            row.item_name,
            row.unit,
            row.cost_price,
            row.erp_code,
            row.erp_item_name,
            row.coupang_sku_id,
            row.coupang_item_name,
            row.mapping_accuracy,
            row.mapping_status,
            row.seq_no
          );
        } else {
          insertItem.run(
            row.seq_no,
            row.category,
            row.item_type,
            row.production_type,
            row.manufacture_year,
            row.item_name,
            row.unit,
            row.cost_price,
            row.erp_code,
            row.erp_item_name,
            row.coupang_sku_id,
            row.coupang_item_name,
            row.mapping_accuracy,
            row.mapping_status
          );
        }
        counts.items += 1;

        const currentItem = findItemBySeq.get(row.seq_no) as { id: number } | undefined;
        if (!currentItem) {
          continue;
        }

        insertSnapshot.run(
          currentItem.id,
          row.snapshot_date,
          row.physical_qty,
          row.carryover_qty,
          "초기 마스터 데이터 임포트"
        );
        counts.snapshots += 1;
      }

      for (const row of txRows) {
        const currentItem = findItemBySeq.get(row.seq_no) as { id: number } | undefined;
        if (!currentItem) {
          continue;
        }

        insertTx.run(
          currentItem.id,
          row.tx_date,
          row.tx_type,
          Math.abs(row.qty),
          row.unit_price,
          row.amount,
          "일별 입출고 시트 임포트"
        );
        counts.transactions += 1;
      }
    });

    tx();
    return NextResponse.json({
      success: true,
      imported: counts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status: 500 }
    );
  }
}
