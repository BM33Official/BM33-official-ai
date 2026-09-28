// เตือนใกล้เดดไลน์ — ไม่มีการเตือน "ทีละเรื่อง" แล้ว: ทุกเรื่องรวมเป็น "เตือนรวม" (lib/bc/digest.ts)
// แอดมินอนุมัติครั้งเดียว · เพื่อนแต่ละคนได้ข้อความเดียวที่มีเฉพาะเรื่องที่ตัวเองยังไม่ทำ
import { log } from "@/lib/logger";

// เรียกทุก ~15 นาที (broadcast cron) — รวมเรื่องที่ใกล้ถึงเข้า "เตือนรวม" + LINE หาแอดมินวันละครั้ง (08:00)
export async function runReminderCron(now = Date.now()): Promise<number> {
  try {
    const { runDailyBatch } = await import("@/lib/bc/digest");
    return await runDailyBatch(now);
  } catch (err) {
    log.warn("reminder_digest_failed", { message: String(err).slice(0, 200) });
    return 0;
  }
}

// ปุ่ม "เตือน" รายเรื่อง (ประกาศ/ฟอร์ม) -> เพิ่มเข้าเตือนรวม (ไม่ส่ง LINE หาแอดมินซ้ำ — กดส่งที่ รออนุมัติ)
export async function addReminder(key: string): Promise<{ code: string; n: number; people: number }> {
  const { addToBatch } = await import("@/lib/bc/digest");
  const r = await addToBatch([key], { notify: false });
  return { code: r?.item.code ?? "", n: r?.keys.length ?? 0, people: r?.people ?? 0 };
}
