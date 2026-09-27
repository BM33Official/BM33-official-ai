// ปฏิทินรวม: คาบเรียน · สอบ · เดดไลน์ประกาศ · วันงาน · ปิดฟอร์ม — ใช้ทั้งหน้าวันนี้/ปฏิทินแอดมิน และแอปสมาชิก
import { liveSchedule, liveUniExams, examStart } from "@/lib/bc/schedule";
import { liveAnnouncements } from "@/lib/bc/announcements";
import { readForms } from "@/lib/bc/forms";
import { bkkDayKey, thTime } from "@/lib/time";

export type AgendaKind = "class" | "exam" | "deadline" | "event" | "form";
export interface AgendaItem { day: string; time: string; at: string; kind: AgendaKind; title: string; sub?: string; ref: string }

export async function agenda(fromDay: string, toDay: string): Promise<AgendaItem[]> {
  const [sched, exams, ann, forms] = await Promise.all([liveSchedule(), liveUniExams(), liveAnnouncements(), readForms()]);
  const out: AgendaItem[] = [];
  const inRange = (d: string) => d >= fromDay && d <= toDay;
  for (const s of sched) {
    if (!inRange(s.date)) continue;
    out.push({ day: s.date, time: s.start, at: `${s.date}T${s.start || "00:00"}:00+07:00`, kind: s.kind === "exam" ? "exam" : "class", title: s.subject, sub: [s.topic, [s.building, s.room].filter(Boolean).join(" ")].filter(Boolean).join(" · "), ref: s.id });
  }
  for (const e of exams) {
    const at = examStart(e);
    const d = bkkDayKey(at);
    if (inRange(d)) out.push({ day: d, time: e.start, at: at.toISOString(), kind: "exam", title: e.name, sub: [e.building, e.room].filter(Boolean).join(" "), ref: e.id });
  }
  const formAnn = new Set(forms.filter((f) => f.announcement_id && f.status !== "deleted").map((f) => f.announcement_id));
  for (const a of ann) {
    if (a.deadline_at && !formAnn.has(a.id)) { const d = bkkDayKey(a.deadline_at); if (inRange(d)) out.push({ day: d, time: thTime(a.deadline_at), at: a.deadline_at, kind: "deadline", title: a.title, sub: "ปิดรับ/เดดไลน์", ref: a.id }); }
    if (a.event_at) { const d = bkkDayKey(a.event_at); if (inRange(d)) out.push({ day: d, time: thTime(a.event_at), at: a.event_at, kind: "event", title: a.title, sub: a.location, ref: a.id }); }
  }
  for (const f of forms) {
    if (!f.deadline_at || f.status === "closed" || f.status === "deleted") continue;
    const d = bkkDayKey(f.deadline_at);
    if (inRange(d)) out.push({ day: d, time: thTime(f.deadline_at), at: f.deadline_at, kind: "form", title: f.name, sub: "ปิดฟอร์ม", ref: f.form_id });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export const AGENDA_TH: Record<AgendaKind, string> = { class: "เรียน", exam: "สอบ", deadline: "เดดไลน์", event: "นัด/งาน", form: "ปิดฟอร์ม" };
