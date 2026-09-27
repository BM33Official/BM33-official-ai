// "ข้อมูลสดแบบย่อ" ที่ส่งให้ AI ทุกคำถาม (~2K token) — ของที่กำลังเกิดขึ้นตอนนี้เท่านั้น
// ของเก่า/รายละเอียดยาว ๆ ให้ระบบค้น (corpus.ts) ดึงมาเฉพาะที่เกี่ยว
import { liveAnnouncements, parseLinks } from "@/lib/bc/announcements";
import { readForms } from "@/lib/bc/forms";
import { liveSchedule, liveUniExams, examStart } from "@/lib/bc/schedule";
import { readFeeMonths } from "@/lib/bc/fees";
import { readCommittee } from "@/lib/bc/committee";
import { getConfig } from "@/lib/bc/config";
import { currentDaily } from "@/lib/bc/daily";
import { thDateTime, bkkDayKey, TH_DAYS_SHORT, bkkParts } from "@/lib/time";
import { cached } from "@/lib/cache";

export const LINKTREE_DEFAULT = "https://linktr.ee/BM33AcademicLinks";

async function build(): Promise<string> {
  const now = Date.now();
  const [ann, forms, sched, exams, fees, committee, cfg, daily] = await Promise.all([
    liveAnnouncements(), readForms(), liveSchedule(), liveUniExams(), readFeeMonths(), readCommittee(), getConfig(), currentDaily(),
  ]);
  const out: string[] = [];
  const day = 86_400_000;

  const relevant = ann.filter((a) => {
    const t = new Date(a.deadline_at || a.event_at || 0).getTime();
    const created = new Date(a.created_at).getTime();
    return (t && t > now - 2 * day && t < now + 60 * day) || now - created < 21 * day || a.pinned === "1";
  }).slice(0, 18);
  out.push(`### ประกาศล่าสุดบนแอป (ทางการ ใหม่ที่สุด)\n${relevant.length ? relevant.map((a) => {
    const links = parseLinks(a.links).slice(0, 2).map((l) => l.url).join(" ");
    return `- ${a.title} (${a.category}; โดย ${a.author || "-"}; โพสต์ ${thDateTime(a.created_at, false)})${a.deadline_at ? ` · เดดไลน์ ${thDateTime(a.deadline_at)}` : ""}${a.event_at ? ` · วันงาน ${thDateTime(a.event_at)}` : ""}${a.location ? ` · ${a.location}` : ""}: ${a.summary}${links ? ` · ลิงก์ ${links}` : ""}`;
  }).join("\n") : "- (ยังไม่มี)"}`);

  const open = forms.filter((f) => f.status !== "closed" && f.status !== "deleted" && (!f.deadline_at || new Date(f.deadline_at).getTime() > now - day));
  if (open.length) out.push(`### สิ่งที่ต้องกรอกที่เปิดอยู่\n${open.slice(0, 15).map((f) => `- ${f.name}${f.deadline_at ? ` · ปิด ${thDateTime(f.deadline_at)}` : ""}${f.link ? ` · ${f.link}` : ""}`).join("\n")}`);

  const today = bkkDayKey(now);
  const week = sched.filter((s) => s.date >= today && s.date <= bkkDayKey(now + 7 * day));
  const dow = (d: string) => TH_DAYS_SHORT[bkkParts(d + "T12:00:00+07:00").dow];
  out.push(`### ตารางเรียน 7 วันข้างหน้า (วันนี้ ${today})\n${week.length ? week.slice(0, 30).map((s) => `- ${dow(s.date)} ${s.date} ${s.start}-${s.end} ${s.subject}${s.topic ? ` — ${s.topic}` : ""} · ${[s.building, s.room].filter(Boolean).join(" ห้อง ") || "ไม่ระบุที่"}`).join("\n") : sched.length ? "- ไม่มีคาบในช่วงนี้" : "- (ยังไม่ได้ลงตารางในระบบ — ดูไฟล์ตารางที่ประกาศในกลุ่มจากข้อมูลที่ค้นเจอ)"}`);

  const nextExams = exams.filter((e) => examStart(e).getTime() > now - day).slice(0, 5);
  if (nextExams.length) out.push(`### สอบที่กำลังจะมาถึง\n${nextExams.map((e) => `- ${e.name} · ${thDateTime(examStart(e))}${e.end ? `-${e.end}` : ""} · ${[e.building, e.room].filter(Boolean).join(" ห้อง ") || "ไม่ระบุที่"}`).join("\n")}`);

  const month = today.slice(0, 7);
  const feeNow = fees.filter((m) => m.month >= month).slice(0, 2);
  if (feeNow.length || cfg.payment_info) out.push(`### เงินรุ่น\n${feeNow.map((m) => `- ${m.label || m.month}: ${m.amount} บาท${m.due_date ? ` ครบกำหนด ${m.due_date}` : ""}${m.note ? ` (${m.note})` : ""}`).join("\n")}${cfg.payment_info ? `\nวิธีจ่าย: ${cfg.payment_info}` : ""}${cfg.payment_link ? `\nลิงก์จ่าย/แจ้งโอน: ${cfg.payment_link}` : ""}`);

  if (daily) out.push(`### สรุปวันนี้บนแอป (${daily.date}): ${daily.headline}`);
  out.push(`### กรรมการรุ่น / ผู้ติดต่อ\n${committee.map((c) => `- ${c.role}: ${c.nickname}`).join("\n")}`);
  out.push(`### ลิงก์รวมของฝ่ายวิชาการ (ชีต/คลิปติว/ไดรฟ์ทุกวิชา): ${cfg.linktree_url || LINKTREE_DEFAULT}`);
  return out.join("\n\n");
}

export async function corePack(): Promise<string> {
  return cached("ai:core:v3", ["bc", "knowledge"], 60, build);
}
