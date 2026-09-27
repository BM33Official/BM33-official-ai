// เตือนใกล้เดดไลน์อัตโนมัติ -> เข้า "กล่องรอตรวจ" + DM หาเจ้าของ -> พิมพ์ approve ถึงจะส่งจริง
// รอบเตือน (ค่าเริ่มต้น): ก่อน 3 วัน · ก่อน 1 วัน · เช้าวันจริง (ตั้งได้ใน BC_config.reminder_plan)
import { Announcement, FormDef, OutboxItem } from "@/lib/bc/types";
import { liveAnnouncements, parseLinks, updateAnnouncement } from "@/lib/bc/announcements";
import { readForms } from "@/lib/bc/forms";
import { liveUniExams, examStart } from "@/lib/bc/schedule";
import { createOutbox, reminderMessages } from "@/lib/bc/outbox";
import { reminderPlan } from "@/lib/bc/config";
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

// เรียกทุก ~15 นาที (broadcast cron) — สร้างรายการตามรอบที่ถึงแล้ว (ครั้งเดียวต่อรอบ)
export async function runReminderCron(now = Date.now()): Promise<number> {
  const hour = bkkParts(now).hh;
  if (hour < 8 || hour >= 21) return 0; // เตือนเฉพาะ 08:00–21:00 น.
  const plan = await reminderPlan();
  let n = 0;

  const due = (iso: string): number | null => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (isNaN(t) || t <= now + 45 * 60_000) return null; // เหลือไม่ถึง 45 นาที ไม่ต้องเตือนแล้ว
    const d = dayDiff(iso, now);
    return plan.includes(d) ? d : null;
  };

  for (const a of await liveAnnouncements()) {
    const d = due(a.deadline_at);
    if (d === null) continue;
    let sent: Record<string, string> = {};
    try { sent = JSON.parse(a.reminders || "{}"); } catch { /* */ }
    const key = `d${d}`;
    if (sent[key]) continue;
    try {
      const item = await queueAnnouncementReminder(a, key);
      if (item) {
        n++;
        await updateAnnouncement(a.id, { reminders: JSON.stringify({ ...sent, [key]: item.id }) });
      }
    } catch (err) {
      log.warn("reminder_ann_failed", { id: a.id, message: String(err).slice(0, 200) });
    }
  }

  for (const f of await readForms()) {
    if (f.status === "closed") continue;
    const d = due(f.deadline_at ?? "");
    if (d === null) continue;
    try {
      const item = await queueFormReminder(f, `d${d}`);
      if (item && item.created_at && Date.now() - new Date(item.created_at).getTime() < 60_000) n++;
    } catch (err) {
      log.warn("reminder_form_failed", { id: f.form_id, message: String(err).slice(0, 200) });
    }
  }

  // สอบมหาวิทยาลัย: เตือนก่อน 3 วัน และก่อน 1 วัน
  for (const e of await liveUniExams()) {
    const at = examStart(e).toISOString();
    const d = dayDiff(at, now);
    if (![3, 1].includes(d) || new Date(at).getTime() < now) continue;
    const text = `📝 ${d === 1 ? "พรุ่งนี้สอบแล้ว!" : `อีก ${d} วันสอบ`}\n${e.name}\n\n📅 ${thDateTime(at)}${e.end ? `–${e.end}` : ""}\n📍 ${[e.building, e.room].filter(Boolean).join(" ห้อง ") || "ดูสถานที่ในแอป"}\n\nสู้ ๆ นะทุกคน เป็นกำลังใจให้ 💙`;
    try {
      await createOutbox({
        kind: "exam", ref_id: `exam:${e.id}:d${d}`, title: `${d === 1 ? "พรุ่งนี้สอบ" : `อีก ${d} วันสอบ`}: ${e.name}`, audience: "all",
        messages: reminderMessages({ text, title: e.name, links: [{ label: "ดูตารางในแอป", url: `${APP}?tab=schedule` }] }),
        preview: text, expires_at: at,
      });
    } catch (err) {
      log.warn("reminder_exam_failed", { id: e.id, message: String(err).slice(0, 200) });
    }
  }
  return n;
}
