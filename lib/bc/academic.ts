// ระบบวิชาการ — ติดตามการจำข้อสอบ + จัดอันดับ red zone (สะสม) + ประกาศเฉพาะกลุ่ม
import { readKey, readKeyFresh, appendRecord, patchRecord, nowISO } from "@/lib/bc/sheets";
import { deleteRow } from "@/lib/google-sheets";
import { TABS, Exam } from "@/lib/bc/types";
import { verifiedMembers } from "@/lib/bc/members";
import { readRoster } from "@/lib/bc/roster";
import { redZoneSize } from "@/lib/bc/config";
import { pushTo } from "@/lib/line";
import { bust } from "@/lib/cache";

export const RED_ZONE_SIZE = 6; // ค่าเริ่มต้น — ค่าจริงอ่านจาก BC_config (red_zone_size)
const digits = (s: string) => String(s ?? "").replace(/\D/g, "");
const idList = (s: string) => String(s ?? "").split(",").map((x) => digits(x)).filter(Boolean);

// อ่านผ่าน snapshot (cache แชร์ข้าม instance) -> หน้าวิชาการไม่ยิงชีตซ้ำอีกต่อไป
export async function readExams(force = false): Promise<Exam[]> {
  return force ? readKeyFresh<Exam>("exams") : readKey<Exam>("exams");
}
export async function getExam(examId: string, force = false): Promise<Exam | null> {
  return (await readExams(force)).find((e) => e.exam_id === examId) ?? null;
}
export async function addExam(input: {
  name: string; exam_date?: string; question_count?: string; doc_link?: string; doc_title?: string;
}): Promise<string> {
  const exam_id = `EX-${Date.now().toString(36).toUpperCase()}`;
  await appendRecord("exams", {
    exam_id,
    name: input.name,
    exam_date: input.exam_date ?? "",
    question_count: input.question_count ?? "",
    not_memorized_ids: "",
    created_at: nowISO(),
    doc_link: input.doc_link ?? "",
    doc_title: input.doc_title ?? "",
    not_filled_ids: "",
    doc_reminder_at: "",
    doc_reminder_status: "",
    doc_reminder_template: "",
  });
  return exam_id;
}
// ยกเลิก/ลบข้อสอบ (ลบแถวจริงออกจากชีต — อ่านสดก่อนเพื่อได้เลขแถวที่ถูก)
export async function deleteExam(examId: string): Promise<boolean> {
  const e = await getExam(examId, true);
  if (!e?.__row) return false;
  await deleteRow(TABS.exams, e.__row);
  bust("bc");
  return true;
}
// บันทึกชุด student_id ที่ "ยังไม่ได้จำ" ของข้อสอบนี้
export async function setNotMemorized(examId: string, studentIds: string[]): Promise<void> {
  const e = await getExam(examId, true);
  if (!e?.__row) return;
  const clean = Array.from(new Set(studentIds.map(digits).filter(Boolean)));
  await patchRecord("exams", e.__row, e as never, { not_memorized_ids: clean.join(",") });
}
// บันทึกชุด student_id ที่ "ยังไม่กรอกเอกสาร" ของข้อสอบนี้ (ติ๊กเองหลังตรวจเอกสาร)
export async function setNotFilled(examId: string, studentIds: string[]): Promise<void> {
  const e = await getExam(examId, true);
  if (!e?.__row) return;
  const clean = Array.from(new Set(studentIds.map(digits).filter(Boolean)));
  await patchRecord("exams", e.__row, e as never, { not_filled_ids: clean.join(",") });
}
// ตั้งเวลาส่งเตือนกรอกเอกสารอัตโนมัติ (atISO ว่าง = ยกเลิก); template = ข้อความที่แก้ไว้
export async function scheduleDocReminder(examId: string, atISO: string, template = ""): Promise<boolean> {
  const e = await getExam(examId, true);
  if (!e?.__row || !e.doc_link) return false;
  await patchRecord("exams", e.__row, e as never, {
    doc_reminder_at: atISO,
    doc_reminder_status: atISO ? "pending" : "",
    doc_reminder_template: atISO ? template : "",
  });
  return true;
}

export type ZoneLevel = "red" | "close" | "watch" | "safe";

export interface RankRow {
  student_id: string;
  nickname: string;
  lineUserId: string; // "" = ยังไม่ได้ลงทะเบียน (ส่งข้อความไม่ได้)
  misses: number;
  missedExams: string[];
  score: number; // คะแนนสะสม (ข้อสอบล่าสุดมีน้ำหนักมากกว่า)
  level: ZoneLevel;
  redzone: boolean;
  distanceToRed: number;
}

// น้ำหนักตามความใหม่: ข้อสอบล่าสุด = 1, ก่อนหน้า = 0.85, 0.72, ... (ไม่ต่ำกว่า 0.35)
export const RECENCY_DECAY = 0.85;

function examOrder(exams: Exam[]): Exam[] {
  const t = (e: Exam) => new Date(e.exam_date || e.created_at || 0).getTime() || 0;
  return [...exams].sort((a, b) => t(b) - t(a)); // ใหม่ -> เก่า
}

// จัดอันดับจากทะเบียนทั้งรุ่น (ไม่ใช่แค่คนที่ลงทะเบียน) เพื่อให้ red zone ถูกต้อง
// red zone = N อันดับแรกของคะแนนสะสม (N จาก BC_config.red_zone_size)
export async function ranking(): Promise<{ rows: RankRow[]; redzoneMin: number; size: number; threshold: number }> {
  const [roster, members, exams, size] = await Promise.all([readRoster(), verifiedMembers(), readExams(), redZoneSize()]);
  const lineById = new Map(members.map((m) => [digits(m.matched_student_id), m.line_user_id]));
  const ordered = examOrder(exams);
  const weight = new Map(ordered.map((e, i) => [e.exam_id, Math.max(0.35, RECENCY_DECAY ** i)]));

  const base = roster.map((r) => {
    const sid = digits(r.student_id);
    const missed = ordered.filter((e) => idList(e.not_memorized_ids).includes(sid));
    const score = Math.round(missed.reduce((a, e) => a + (weight.get(e.exam_id) ?? 1), 0) * 100) / 100;
    return {
      student_id: sid, nickname: r.nickname || r.full_name || sid, lineUserId: lineById.get(sid) || "",
      misses: missed.length, missedExams: missed.map((e) => e.name), score,
    };
  });

  const sorted = [...base].sort((a, b) => b.score - a.score || b.misses - a.misses);
  const withMiss = sorted.filter((r) => r.score > 0);
  const red = withMiss.slice(0, size);
  // เสมอกันที่เส้นตัด -> รวมเข้า red zone ทั้งหมด (ยุติธรรม ไม่ตัดตามลำดับตัวอักษร)
  const threshold = red.at(-1)?.score ?? 0;
  const redSet = new Set(threshold > 0 ? withMiss.filter((r) => r.score >= threshold).map((r) => r.student_id) : []);
  const redzoneMin = red.length >= size ? red[red.length - 1].misses : (red.at(-1)?.misses ?? 1);

  const rows: RankRow[] = sorted.map((r, i) => {
    const inRed = redSet.has(r.student_id);
    let level: ZoneLevel = "safe";
    if (inRed) level = "red";
    else if (r.score > 0 && (i < size * 2 || (threshold > 0 && r.score >= threshold * 0.6))) level = "close";
    else if (r.score > 0) level = "watch";
    return {
      ...r,
      level,
      redzone: inRed,
      distanceToRed: inRed ? 0 : Math.max(1, redzoneMin - r.misses + 1),
    };
  });
  return { rows, redzoneMin, size, threshold };
}

export type AcademicMode = "unmemorized" | "redzone" | "rest" | "doc" | "doc_unfilled";

const REMARK = "\n\nถ้าคิดว่าข้อมูลไม่ถูกต้อง ทักฝ่ายวิชาการได้เลยนะ 🙏";

export interface AcademicOpts { template?: string; link?: string }

// ข้อความเริ่มต้นแบบแก้ได้ (มี token) — frontend ใช้ค่าเดียวกันเป็นค่าเริ่มต้นในช่องแก้ไข
export const DEFAULT_TEMPLATES: Record<AcademicMode, string> = {
  unmemorized: `{ชื่อเล่น} จ๋า 📝\n\nมีข้อสอบที่ยังไม่ได้จำอยู่ {จำนวน} ครั้ง:\n{ข้อสอบ}\n\nหาเวลาทยอยจำนะ สู้ ๆ 😊`,
  redzone: `{ชื่อเล่น} จ๋า 📕\n\nตอนนี้เธออยู่ใน red zone แล้วน้า (จำข้อสอบได้น้อยสุด {จำนวนโซน} อันดับของรุ่น) รวม {จำนวน} ครั้ง\nข้อสอบที่ยังไม่ได้จำ: {ข้อสอบ}\n\nค่อย ๆ ทยอยจำนะ เดี๋ยวก็หลุดโซนแล้ว สู้ ๆ 💪`,
  rest: `{ชื่อเล่น} จ๋า 📖\n\nยังมีข้อสอบที่ยังไม่ได้จำอยู่ {จำนวน} ครั้ง ({ข้อสอบ})\nอีกแค่ {ระยะห่าง} ครั้งจะเข้า red zone แล้วน้า\n\nเร่งจำอีกนิดนะ เป็นกำลังใจให้ 🔥`,
  doc: `ฝากกรอกเอกสารแบ่งข้อรับผิดชอบด้วยน้า 📄\n\n"{ชื่อเอกสาร}"\n\nใครกรอกครบแล้วข้ามได้เลยน้า ขอบคุณมาก ๆ 🙏`,
  doc_unfilled: `แอบมาสะกิดนิดนึงน้า 📄\n\nเหมือนยังไม่เห็นชื่อในเอกสารแบ่งข้อเลย\n"{ชื่อเอกสาร}"\n\nรบกวนช่วยไปกรอกด้วยน้า จะได้ครบทั้งรุ่น ขอบคุณมาก ๆ 🙏`,
};

// แทน token ในเทมเพลตด้วยข้อมูลจริงของผู้รับ
function fillTokens(tpl: string, r: RankRow, size = RED_ZONE_SIZE): string {
  return tpl
    .replace(/\{ชื่อเล่น\}/g, r.nickname)
    .replace(/\{จำนวน\}/g, String(r.misses))
    .replace(/\{ข้อสอบ\}/g, r.missedExams.map((n) => `• ${n}`).join("\n"))
    .replace(/\{ระยะห่าง\}/g, String(r.distanceToRed))
    .replace(/\{จำนวนโซน\}/g, String(size));
}
// ต่อลิงก์ท้ายข้อความ (ถ้าฝ่ายวิชาการใส่มา และยังไม่มีในข้อความ)
function appendLink(msg: string, link?: string): string {
  const l = (link ?? "").trim();
  if (!l || msg.includes(l)) return msg;
  return `${msg}\n\n${l}`;
}

function messageFor(mode: AcademicMode, r: RankRow, opts?: AcademicOpts, size = RED_ZONE_SIZE): string | null {
  if (mode === "redzone" && !r.redzone) return null;
  if (mode === "rest" && (r.redzone || r.misses === 0)) return null;
  if (mode === "unmemorized" && r.misses === 0) return null;
  if (!["redzone", "rest", "unmemorized"].includes(mode)) return null;
  const tpl = opts?.template?.trim() || DEFAULT_TEMPLATES[mode];
  return appendLink(fillTokens(tpl, r, size) + (opts?.template ? "" : REMARK), opts?.link);
}

// ── preview: นับผู้รับ + ตัวอย่างข้อความ (ไม่ส่งจริง) ─────────────────────────
export interface AcademicPreview { count: number; sample: string; audience: string }

const AUDIENCE_LABEL: Record<AcademicMode, string> = {
  unmemorized: "ทุกคนที่ยังมีข้อสอบไม่ได้จำ",
  redzone: "เฉพาะคนใน Red Zone",
  rest: "คนที่ยังไม่ได้จำ แต่ยังไม่ถึง Red Zone",
  doc: "สมาชิกที่ลงทะเบียนแล้วทุกคน (เตือนให้ไปกรอกเอกสาร)",
  doc_unfilled: "เฉพาะคนที่ถูกติ๊กว่ายังไม่กรอกเอกสาร",
};

// สมาชิกที่ verified + อยู่ในชุด student_id ที่กำหนด
async function membersInSet(ids: string[]): Promise<{ lineUserId: string }[]> {
  const set = new Set(ids.map(digits).filter(Boolean));
  const members = await verifiedMembers();
  return members.filter((m) => set.has(digits(m.matched_student_id))).map((m) => ({ lineUserId: m.line_user_id }));
}

export async function academicPreview(mode: AcademicMode, exam?: Exam | null, opts?: AcademicOpts): Promise<AcademicPreview> {
  if (mode === "doc") {
    const members = await verifiedMembers();
    return { count: members.length, sample: docMessage(exam, false, opts), audience: AUDIENCE_LABEL.doc };
  }
  if (mode === "doc_unfilled") {
    const ids = idList(exam?.not_filled_ids ?? "");
    const recips = await membersInSet(ids);
    const notReg = ids.length - recips.length;
    const audience = AUDIENCE_LABEL.doc_unfilled + (notReg > 0 ? ` (อีก ${notReg} คนยังไม่ลงทะเบียน จึงส่งไม่ได้)` : "");
    return { count: recips.length, sample: docMessage(exam, true, opts), audience };
  }
  const { rows, size } = await ranking();
  const targets = rows.map((r) => ({ r, msg: messageFor(mode, r, opts, size) })).filter((x) => x.msg && x.r.lineUserId) as { r: RankRow; msg: string }[];
  const withoutLine = rows.filter((r) => messageFor(mode, r, opts, size) && !r.lineUserId).length;
  const audience = AUDIENCE_LABEL[mode] + (withoutLine > 0 ? ` (อีก ${withoutLine} คนยังไม่ลงทะเบียน จึงส่งไม่ได้)` : "");
  return { count: targets.length, sample: targets[0]?.msg ?? "— ยังไม่มีผู้รับในกลุ่มนี้ —", audience };
}

function docMessage(exam?: Exam | null, unfilled = false, opts?: AcademicOpts): string {
  const title = exam?.doc_title || exam?.name || "เอกสารแบ่งข้อรับผิดชอบ";
  const docLink = exam?.doc_link || "(ยังไม่ได้ใส่ลิงก์เอกสาร)";
  const tpl = opts?.template?.trim() || DEFAULT_TEMPLATES[unfilled ? "doc_unfilled" : "doc"];
  let msg = tpl.replace(/\{ชื่อเอกสาร\}/g, title);
  msg = appendLink(msg, docLink); // ลิงก์เอกสารเสมอ
  msg = appendLink(msg, opts?.link); // ลิงก์เพิ่มเติมจากฝ่ายวิชาการ (ถ้ามี)
  return msg;
}

export interface AcademicSendResult { ok: boolean; count: number; testMode: boolean; sample?: string; error?: string; code?: string }

// testMode = ส่งตัวอย่างให้แอดมินเท่านั้น · ไม่ใช่ testMode = ร่างข้อความเฉพาะคนไป "รออนุมัติ" (ไม่ส่งตรงถึงเพื่อนเด็ดขาด)
export async function academicBroadcast(
  mode: AcademicMode, testMode: boolean, adminIds: string[], exam?: Exam | null, opts?: AcademicOpts
): Promise<AcademicSendResult> {
  let targets: { sid: string; lineUserId: string; msg: string }[] = [];

  if (mode === "doc") {
    if (!exam?.doc_link) return { ok: false, count: 0, testMode, error: "no_doc_link" };
    const msg = docMessage(exam, false, opts);
    targets = (await verifiedMembers()).map((m) => ({ sid: digits(m.matched_student_id), lineUserId: m.line_user_id, msg }));
  } else if (mode === "doc_unfilled") {
    if (!exam?.doc_link) return { ok: false, count: 0, testMode, error: "no_doc_link" };
    const msg = docMessage(exam, true, opts);
    const set = new Set(idList(exam.not_filled_ids ?? "").map(digits));
    targets = (await verifiedMembers()).filter((m) => set.has(digits(m.matched_student_id))).map((m) => ({ sid: digits(m.matched_student_id), lineUserId: m.line_user_id, msg }));
  } else {
    const { rows, size } = await ranking();
    targets = rows
      .map((r) => ({ r, msg: messageFor(mode, r, opts, size) }))
      .filter((x) => x.msg && x.r.lineUserId)
      .map((x) => ({ sid: digits(x.r.student_id), lineUserId: x.r.lineUserId, msg: x.msg! }));
  }

  if (targets.length === 0) return { ok: false, count: 0, testMode, error: "no_recipients" };
  const sample = targets[0].msg;
  try {
    if (testMode) {
      const preview = `[ทดสอบวิชาการ] โหมด "${AUDIENCE_LABEL[mode]}" จะส่งถึง ${targets.length} คน\nตัวอย่างข้อความที่ผู้รับจะเห็น:\n\n${sample}`;
      for (const a of adminIds) await pushTo(a, [{ type: "text", text: preview }]);
      return { ok: true, count: targets.length, testMode, sample };
    }
    const { createOutbox } = await import("@/lib/bc/outbox");
    const per: Record<string, { type: "text"; text: string }[]> = {};
    for (const t of targets) per[t.sid] = [{ type: "text", text: t.msg.slice(0, 4900) }];
    const item = await createOutbox({
      kind: "academic", title: `วิชาการ: ${AUDIENCE_LABEL[mode]}${exam ? ` · ${exam.name}` : ""} (${targets.length} คน)`,
      audience: `ids:${Object.keys(per).join(",")}`, messages: [], perRecipient: per,
      preview: `${targets.every((t) => t.msg === sample) ? "" : "ข้อความเฉพาะคน — ตัวอย่าง:\n\n"}${sample}`,
    });
    return { ok: true, count: targets.length, testMode, sample, code: item.code };
  } catch (err) {
    return { ok: false, count: 0, testMode, error: String(err) };
  }
}

// ── cron: ส่งเตือนกรอกเอกสารที่ตั้งเวลาไว้และถึงกำหนดแล้ว ─────────────────────
export async function runDueDocReminders(adminIds: string[], now = Date.now()): Promise<number> {
  const exams = await readExams(true);
  let sent = 0;
  for (const e of exams) {
    if (e.doc_reminder_status !== "pending" || !e.doc_reminder_at || !e.doc_link) continue;
    const t = new Date(e.doc_reminder_at).getTime();
    if (isNaN(t) || t > now) continue;
    const r = await academicBroadcast("doc", false, adminIds, e, { template: e.doc_reminder_template }); // ส่งจริงถึงทุกคน
    if (e.__row) await patchRecord("exams", e.__row, e as never, { doc_reminder_status: "sent" });
    if (r.ok) sent++;
  }
  return sent;
}
