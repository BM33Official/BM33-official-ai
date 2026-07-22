// job "เรียนรู้เอง" 3 รอบ/วัน — อ่านข้อความใหม่จาก 07 -> กลั่นเป็นความรู้ -> เขียนลง 01
// เรียกผ่าน /api/learn (มี secret ป้องกัน) โดย GitHub Actions cron ตามเวลาไทย

import { appendRows, resolveTitle } from "@/lib/google-sheets";
import { SOURCES } from "@/lib/sources";
import { distillKnowledge } from "@/lib/gemini";
import { readUnprocessed, markProcessed } from "@/lib/message-log";
import { log } from "@/lib/logger";

export interface DigestResult {
  scanned: number;
  learned: number;
  skipped: boolean;
  reason?: string;
}

// map รายการความรู้ -> แถว 16 คอลัมน์ของ 01_ฐานความรู้_AI
function toKbRow(item: Awaited<ReturnType<typeof distillKnowledge>>[number], code: string): string[] {
  return [
    code, // A รหัสความรู้
    item.หมวด || "จากแชต", // B หมวด
    item.หัวข้อ || "", // C หัวข้อ
    item.คำถามที่คาดว่าจะถาม || "", // D คำถามที่คาด
    item.คำตอบ || "", // E คำตอบ/ข้อความต้นทาง
    (item.คำสำคัญ || []).join(", "), // F คำสำคัญ
    "กลาง", // G ระดับความสำคัญ
    "อัตโนมัติจากแชต—รอตรวจ", // H สถานะความสดใหม่
    item.กำหนดเวลา || "", // I ข้อความกำหนดเวลา
    item.ลิงก์ || "", // J ลิงก์
    item.ผู้ประกาศ || "", // K ผู้ประกาศ/ผู้ติดต่อ
    item.วันที่ || "", // L วันที่ต้นทาง
    "", // M เวลา
    "", // N รหัสข้อความ (เติมภายหลังถ้าต้องการ)
    "สมาชิก BM33", // O กลุ่มผู้มีสิทธิ์
    "ใช่", // P ต้องตรวจสอบก่อนตอบ
  ];
}

export async function runDigest(): Promise<DigestResult> {
  const { title: bufferTitle, rows } = await readUnprocessed(300);
  if (rows.length === 0) return { scanned: 0, learned: 0, skipped: true, reason: "no_new_messages" };

  // สร้าง batch text (ตัดยาวต่อบรรทัดกัน token บาน)
  const batchText = rows
    .map((r) => `[${r.tsISO}] ${r.displayName || "?"}${r.type === "image" ? " (รูป)" : ""}: ${r.content.slice(0, 300)}`)
    .join("\n");

  let items: Awaited<ReturnType<typeof distillKnowledge>> = [];
  try {
    items = await distillKnowledge(batchText);
  } catch (err) {
    log.error("digest_gemini_failed", { message: String(err) });
    return { scanned: rows.length, learned: 0, skipped: true, reason: "gemini_error" };
  }

  const stamp = Date.now().toString(36).toUpperCase();
  const kbRows = items
    .filter((it) => (it.คำตอบ || it.หัวข้อ).trim().length > 0)
    .map((it, i) => toKbRow(it, `KB-AUTO-${stamp}-${String(i + 1).padStart(2, "0")}`));

  if (kbRows.length > 0) {
    const kbTitle = await resolveTitle(SOURCES.knowledgeArchive.match);
    if (!kbTitle) return { scanned: rows.length, learned: 0, skipped: true, reason: "kb_tab_not_found" };
    await appendRows(`'${kbTitle}'!A1`, kbRows);
  }

  // mark ทุกแถวที่อ่านมาเป็น processed (แม้ไม่ได้กลายเป็นความรู้ ก็ไม่ต้องอ่านซ้ำ)
  await markProcessed(bufferTitle, rows.map((r) => r.rowNumber), kbRows.length ? "digest" : "no-knowledge");

  log.info("digest_done", { scanned: rows.length, learned: kbRows.length });
  return { scanned: rows.length, learned: kbRows.length, skipped: false };
}
