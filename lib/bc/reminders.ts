// เตือนใกล้เดดไลน์ -> "รออนุมัติ" + DM หาเจ้าของ -> approve ถึงจะส่งจริง
// อัตโนมัติ = สรุปวันละฉบับ (lib/bc/digest.ts) · ปุ่มเตือนรายเรื่อง (ประกาศ/ฟอร์ม) ยังใช้ฟังก์ชันด้านล่าง
import { Announcement, FormDef, OutboxItem } from "@/lib/bc/types";
import { parseLinks } from "@/lib/bc/announcements";
import { createOutbox, reminderMessages } from "@/lib/bc/outbox";
import { dayDiff, thDateTime, relativeTh, bkkParts } from "@/lib/time";
import { log } from "@/lib/logger";

const APP = "https://liff.line.me/2011755768-aSlCqo7l";

function stageLabel(days: number): string {
  return days === 0 ? "วันนี้วันสุดท้าย" : days === 1 ? "พรุ่งนี้เดดไลน์" : `อีก ${days} วันเดดไลน์`;
}

export async function queueAnnouncementReminder(a: Announcement, stage: string, opts: { notify?: boolean } = {}): Promise<OutboxItem | null> {
  if (!a.deadline_at && stage !== "manual") return null;
  const links = parseLinks(a.links);
  const days = a.deadline_at ? Math.max(0, dayDiff(a.deadline_at)) : -1;
  const head = a.deadline_at ? `⏰ ${stageLabel(days)}!` : "📢 ประกาศจากรุ่น";
  const text = [
    `${head}\n${a.title}`,
    a.summary,
    a.deadline_at ? `📅 ปิด ${thDateTime(a.deadline_at)} (${relativeTh(a.deadline_at)})` : "",
    a.form_id ? "ใครทำแล้วข้ามได้เลยน้า 🙏" : "",
    "ดูรายละเอียดทั้งหมดในแอป BM33 👇",
  ].filter(Boolean).join("\n\n");
  const btnLinks = [...links.slice(0, 3), { label: "เปิดในแอป BM33", url: `${APP}?a=${encodeURIComponent(a.id)}` }];
  return createOutbox({
    kind: "deadline",
    ref_id: `ann:${a.id}:${stage}`,
    title: `${a.deadline_at ? `${stageLabel(days)}: ` : ""}${a.title}`,
    audience: a.form_id ? `undone:${a.form_id}` : "all",
    messages: reminderMessages({ text, title: a.title, links: btnLinks, color: days <= 1 ? "#E11D48" : "#1D4ED8" }),
    preview: text,
    expires_at: a.deadline_at || undefined,
    notify: opts.notify,
  });
}

export async function queueFormReminder(f: FormDef, stage: string): Promise<OutboxItem | null> {
  if (!f.deadline_at && !stage.startsWith("manual")) return null;
  const days = f.deadline_at ? Math.max(0, dayDiff(f.deadline_at)) : -1;
  const text = [
    f.deadline_at ? `⏰ ${stageLabel(days)}!\n${f.name}` : `📝 อย่าลืมกรอก\n${f.name}`,
    f.description ?? "",
    f.deadline_at ? `📅 ปิด ${thDateTime(f.deadline_at)} (${relativeTh(f.deadline_at)})` : "",
    "ข้อความนี้ส่งเฉพาะคนที่ระบบยังไม่เห็นว่าทำ ถ้าทำแล้วกด “ฉันทำแล้ว” ในแอปได้เลย 🙏",
  ].filter(Boolean).join("\n\n");
  const links = [...(f.link ? [{ label: "เปิดฟอร์ม", url: f.link }] : []), { label: "เปิดในแอป BM33", url: `${APP}?tab=todo` }];
  return createOutbox({
    kind: "deadline",
    ref_id: `form:${f.form_id}:${stage}`,
    title: f.deadline_at ? `${stageLabel(days)}: ${f.name}` : `เตือน: ${f.name}`,
    audience: `undone:${f.form_id}`,
    messages: reminderMessages({ text, title: f.name, links, color: days >= 0 && days <= 1 ? "#E11D48" : "#1D4ED8" }),
    preview: text,
    expires_at: f.deadline_at || undefined,
  });
}

// เรียกทุก ~15 นาที (broadcast cron) — ตั้งแต่ 08:00 น. สร้าง "สรุปเตือนวันนี้" ฉบับเดียว (วันละครั้ง)
// แทนการเตือนทีละเรื่อง: เพื่อนได้ข้อความเดียวที่รวมเฉพาะเรื่องที่ตัวเองยังไม่ได้ทำ
export async function runReminderCron(now = Date.now()): Promise<number> {
  const hour = bkkParts(now).hh;
  if (hour < 8 || hour >= 21) return 0;
  try {
    const { queueDailyDigest } = await import("@/lib/bc/digest");
    const r = await queueDailyDigest(now);
    return r.item && Date.now() - new Date(r.item.created_at).getTime() < 60_000 ? 1 : 0;
  } catch (err) {
    log.warn("reminder_digest_failed", { message: String(err).slice(0, 200) });
    return 0;
  }
}
