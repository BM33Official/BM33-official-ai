// บันทึกข้อความจากกลุ่มลงแท็บ 07_ข้อความทั้งหมด (buffer สำหรับ digest)
// - เก็บตอนรับ webhook (ถูก/เร็ว ไม่เรียก Gemini)
// - job digest (3 รอบ/วัน) อ่านแถว "new" ไปกลั่นเป็นความรู้ แล้ว mark "processed"

import { appendRows, getRange, updateRange, resolveTitle } from "@/lib/google-sheets";
import { SOURCES } from "@/lib/sources";
import { log } from "@/lib/logger";

// header ของแท็บ 07 (A:J) — ตั้งครั้งแรกถ้าแท็บว่าง
const HEADER = [
  "รหัส","เวลา(ISO)","groupId","userId","ชื่อแสดงผล",
  "ประเภท","เนื้อหา/คำบรรยายรูป","สถานะเรียนรู้","รหัสความรู้","หมายเหตุ",
];
const STATUS_COL = 7; // index 0-based ของ "สถานะเรียนรู้" (คอลัมน์ H)

async function rawTitle(): Promise<string> {
  const t = await resolveTitle(SOURCES.rawMessages.match);
  if (!t) throw new Error("raw messages tab (07_) not found");
  return t;
}

let _headerEnsured = false;
async function ensureHeader(title: string): Promise<void> {
  if (_headerEnsured) return;
  const first = await getRange(`'${title}'!A1:J1`);
  if (!first.length || !(first[0] ?? []).some((c) => String(c ?? "").trim())) {
    await appendRows(`'${title}'!A1`, [HEADER]);
  }
  _headerEnsured = true;
}

export interface InboundMessage {
  messageId: string;
  tsISO: string;
  groupId: string;
  userId: string;
  displayName: string;
  type: "text" | "image";
  content: string; // ข้อความ หรือ คำบรรยายรูป
  note?: string;
}

export async function logMessage(m: InboundMessage): Promise<void> {
  const title = await rawTitle();
  await ensureHeader(title);
  await appendRows(`'${title}'!A1`, [[
    m.messageId, m.tsISO, m.groupId, m.userId, m.displayName,
    m.type, m.content, "new", "", m.note ?? "",
  ]]);
}

export interface BufferRow {
  rowNumber: number;
  tsISO: string;
  displayName: string;
  type: string;
  content: string;
}

// อ่านแถวที่ยังไม่ประมวลผล (สถานะ new/ว่าง) จำกัดจำนวน
export async function readUnprocessed(limit = 300): Promise<{ title: string; rows: BufferRow[] }> {
  const title = await rawTitle();
  const grid = await getRange(`'${title}'!A2:J5000`);
  const rows: BufferRow[] = [];
  for (let i = 0; i < grid.length; i++) {
    const cells = grid[i] ?? [];
    if (cells.every((c) => !String(c ?? "").trim())) continue;
    const status = String(cells[STATUS_COL] ?? "").trim();
    if (status && status !== "new") continue;
    rows.push({
      rowNumber: i + 2, // A2 = แถว 2
      tsISO: String(cells[1] ?? ""),
      displayName: String(cells[4] ?? ""),
      type: String(cells[5] ?? ""),
      content: String(cells[6] ?? ""),
    });
    if (rows.length >= limit) break;
  }
  return { title, rows };
}

// mark แถวเป็น processed (เขียนคอลัมน์ H ทีละแถว — จำนวนน้อยต่อรอบ)
export async function markProcessed(
  title: string,
  rowNumbers: number[],
  knowledgeCode = ""
): Promise<void> {
  for (const r of rowNumbers) {
    try {
      await updateRange(`'${title}'!H${r}:I${r}`, [["processed", knowledgeCode]]);
    } catch (err) {
      log.warn("mark_processed_failed", { row: r, message: String(err) });
    }
  }
}
