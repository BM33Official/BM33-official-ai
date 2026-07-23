// สรุป/แจ้งเตือน — สรุปงานรายสัปดาห์ (รออนุมัติ), งานค้างรายคน (ตอบใน DM), เตือน due date
import { readTab, appendRecord, patchRecord, nowISO } from "@/lib/bc/sheets";
import { TABS, Member } from "@/lib/bc/types";
import { readForms } from "@/lib/bc/forms";
import { autoDoneSet, readOverlay } from "@/lib/bc/status";
import { verifiedMembers } from "@/lib/bc/members";
import { readExams, ranking } from "@/lib/bc/academic";
import { askGemini } from "@/lib/gemini";
import { pushTo, multicastTo } from "@/lib/line";

const digits = (s: string) => String(s ?? "").replace(/\D/g, "");

export interface Summary {
  __row?: number;
  id: string; week: string; kind: string; title: string; body: string;
  status: string; created_at: string; sent_at: string;
}

export async function readSummaries(): Promise<Summary[]> {
  return readTab<Summary>(TABS.summaries);
}
export async function getSummary(id: string): Promise<Summary | null> {
  return (await readSummaries()).find((s) => s.id === id) ?? null;
}

// ── งานค้างรายคน (ใช้ตอบใน DM) ──────────────────────────────────────────────
export async function personalUndone(member: Member): Promise<string> {
  const sid = digits(member.matched_student_id);
  const [forms, overlay, rank] = await Promise.all([readForms(), readOverlay(), ranking()]);
  const undone: string[] = [];

  for (const f of forms) {
    const doneSet = await autoDoneSet(f);
    const ov = overlay.find((o) => digits(o.student_id) === sid && o.form_id === f.form_id);
    const done = doneSet.has(sid) || ov?.state === "confirmed" || ov?.state === "done";
    if (!done) undone.push(`• ${f.name}`);
  }

  const me = rank.rows.find((r) => r.student_id === sid);
  const nick = me?.nickname || member.display_name || "เพื่อน";
  if (me && me.misses > 0) undone.push(`• ท่องข้อสอบค้าง ${me.misses} ครั้ง (${me.missedExams.join(", ")})`);

  if (undone.length === 0) return `เยี่ยมมาก ${nick}! ตอนนี้ไม่มีงานค้างเลย ทำครบหมดแล้ว 🎉`;
  return `สวัสดี ${nick} 📋 สิ่งที่ยังไม่ได้ทำตอนนี้:\n\n${undone.join("\n")}\n\nถ้าทำอันไหนไปแล้วแต่ระบบยังไม่อัปเดต ทักผู้ดูแลได้เลยนะ 🙏`;
}

// ── สรุปสัปดาห์ (ให้ AI ร่าง -> เก็บเป็น pending รออนุมัติ) ─────────────────────
export async function generateWeeklySummary(): Promise<Summary> {
  const [forms, exams, rank, members] = await Promise.all([readForms(), readExams(), ranking(), verifiedMembers()]);

  const formLines: string[] = [];
  for (const f of forms) {
    const doneSet = await autoDoneSet(f);
    const undone = members.filter((m) => !doneSet.has(digits(m.matched_student_id))).length;
    formLines.push(`- ${f.name}: ยังไม่ทำ ${undone}/${members.length} คน`);
  }
  const examLines = exams.map((e) => `- ${e.name} (${e.exam_date || "ยังไม่ระบุวัน"}) ยังไม่ท่อง ${String(e.not_memorized_ids ?? "").split(",").filter(Boolean).length} คน`);
  const red = rank.rows.filter((r) => r.redzone).map((r) => r.nickname).join(", ");

  const context = `ข้อมูลสัปดาห์นี้ของรุ่น BM33:\nฟอร์ม/งาน:\n${formLines.join("\n") || "- ไม่มี"}\nข้อสอบ:\n${examLines.join("\n") || "- ไม่มี"}\nRed zone: ${red || "-"}`;

  let body = "";
  try {
    const r = await askGemini(
      `คุณคือผู้ช่วยสรุปงานประจำสัปดาห์ของรุ่น BM33 เขียนข้อความประกาศภาษาไทยที่อบอุ่นเป็นกันเอง สรุปงานที่ยังค้าง เดดไลน์ และสิ่งที่เพื่อน ๆ ควรทำสัปดาห์นี้ กระชับ อ่านง่าย ใช้อีโมจิพอดี ห้ามใส่ข้อมูลที่ไม่มีใน context ห้ามใช้ markdown`,
      `<context>\n${context}\n</context>\n\nเขียนข้อความสรุปสำหรับส่งในกลุ่ม`
    );
    body = r.finishReason === "MAX_TOKENS" ? "" : r.text;
  } catch { /* ปล่อยว่าง */ }
  if (!body) body = `สรุปงานสัปดาห์นี้ 📋\n${formLines.join("\n")}\n${examLines.join("\n")}`;

  const id = `SUM-${Date.now().toString(36).toUpperCase()}`;
  const week = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  await appendRecord("summaries", { id, week, kind: "weekly", title: `สรุปสัปดาห์ ${week}`, body, status: "pending", created_at: nowISO(), sent_at: "" });
  return { id, week, kind: "weekly", title: `สรุปสัปดาห์ ${week}`, body, status: "pending", created_at: nowISO(), sent_at: "" };
}

// ── เตือน due date ที่ใกล้ถึง (สร้าง pending + แจ้งแอดมินใน LINE) ───────────────
export async function checkDueDates(adminIds: string[], withinDays = 3): Promise<number> {
  const exams = await readExams();
  const existing = await readSummaries();
  const now = Date.now();
  let created = 0;

  for (const e of exams) {
    if (!e.exam_date) continue;
    const t = new Date(e.exam_date).getTime();
    if (isNaN(t)) continue;
    const days = Math.ceil((t - now) / 86_400_000);
    if (days < 0 || days > withinDays) continue;
    // dedupe: สร้างครั้งเดียวต่อ exam
    if (existing.some((s) => s.kind === "duedate" && s.title.includes(e.name))) continue;

    const body = `⏰ ใกล้ถึงกำหนดแล้ว: ${e.name} อีก ${days} วัน (${e.exam_date})\nเพื่อน ๆ ที่ยังไม่ได้ท่อง อย่าลืมเตรียมตัวนะ 🙏`;
    const id = `DUE-${Date.now().toString(36).toUpperCase()}-${created}`;
    await appendRecord("summaries", { id, week: "", kind: "duedate", title: `ใกล้ถึง: ${e.name}`, body, status: "pending", created_at: nowISO(), sent_at: "" });
    created++;
    for (const a of adminIds) {
      try { await pushTo(a, [{ type: "text", text: `🔔 แจ้งเตือนแอดมิน: "${e.name}" ใกล้ถึงกำหนดใน ${days} วัน — มีข้อความร่างรออนุมัติในหน้า สรุป/รอส่ง` }]); } catch { /* ignore */ }
    }
  }
  return created;
}

// ── ส่งสรุปให้ทุกคน (หลังอนุมัติ) ────────────────────────────────────────────
export async function sendSummaryToAll(id: string, testMode: boolean, adminIds: string[]): Promise<{ ok: boolean; count: number; testMode: boolean; error?: string }> {
  const s = await getSummary(id);
  if (!s) return { ok: false, count: 0, testMode, error: "not_found" };
  const recipients = testMode ? adminIds : (await verifiedMembers()).map((m) => m.line_user_id).filter(Boolean);
  if (recipients.length === 0) return { ok: false, count: 0, testMode, error: "no_recipients" };
  try {
    await multicastTo(recipients, [{ type: "text", text: s.body }]);
  } catch (err) {
    return { ok: false, count: 0, testMode, error: String(err) };
  }
  if (s.__row) await patchRecord("summaries", s.__row, s as never, { status: "sent", sent_at: nowISO() });
  return { ok: true, count: recipients.length, testMode };
}

export async function updateSummary(s: Summary, patch: Partial<Summary>): Promise<void> {
  if (!s.__row) return;
  await patchRecord("summaries", s.__row, s as never, patch as Record<string, string>);
}
