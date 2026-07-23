// ระบบวิชาการ — ติดตามการจำข้อสอบ + จัดอันดับ red zone + ประกาศเฉพาะกลุ่ม
import { readTab, appendRecord, patchRecord, nowISO } from "@/lib/bc/sheets";
import { deleteRow } from "@/lib/google-sheets";
import { TABS, Exam } from "@/lib/bc/types";
import { verifiedMembers } from "@/lib/bc/members";
import { readRoster } from "@/lib/bc/roster";
import { pushTo } from "@/lib/line";

export const RED_ZONE_SIZE = 6;
const digits = (s: string) => String(s ?? "").replace(/\D/g, "");
const idList = (s: string) => String(s ?? "").split(",").map((x) => digits(x)).filter(Boolean);

// cache สั้น ๆ — หน้า academic อ่าน exams หลายรอบต่อ render (ผ่าน ranking ด้วย)
// รวบให้เหลือ read เดียว กันชน rate-limit ของ Sheets ตอนกดติ๊กถี่ ๆ
let _examCache: { rows: Exam[]; at: number } | null = null;
function invalidateExams() { _examCache = null; }

export async function readExams(): Promise<Exam[]> {
  if (_examCache && Date.now() - _examCache.at < 8_000) return _examCache.rows;
  const rows = await readTab<Exam>(TABS.exams);
  _examCache = { rows, at: Date.now() };
  return rows;
}
export async function getExam(examId: string): Promise<Exam | null> {
  return (await readExams()).find((e) => e.exam_id === examId) ?? null;
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
  invalidateExams();
  return exam_id;
}
// ยกเลิก/ลบข้อสอบ (ลบแถวจริงออกจากชีต)
export async function deleteExam(examId: string): Promise<boolean> {
  const e = await getExam(examId);
  if (!e?.__row) return false;
  await deleteRow(TABS.exams, e.__row);
  invalidateExams();
  return true;
}
// บันทึกชุด student_id ที่ "ยังไม่ได้จำ" ของข้อสอบนี้
export async function setNotMemorized(examId: string, studentIds: string[]): Promise<void> {
  const e = await getExam(examId);
  if (!e?.__row) return;
  const clean = Array.from(new Set(studentIds.map(digits).filter(Boolean)));
  await patchRecord("exams", e.__row, e as never, { not_memorized_ids: clean.join(",") });
  invalidateExams();
}
// บันทึกชุด student_id ที่ "ยังไม่กรอกเอกสาร" ของข้อสอบนี้ (ติ๊กเองหลังตรวจเอกสาร)
export async function setNotFilled(examId: string, studentIds: string[]): Promise<void> {
  const e = await getExam(examId);
  if (!e?.__row) return;
  const clean = Array.from(new Set(studentIds.map(digits).filter(Boolean)));
  await patchRecord("exams", e.__row, e as never, { not_filled_ids: clean.join(",") });
  invalidateExams();
}
// ตั้งเวลาส่งเตือนกรอกเอกสารอัตโนมัติ (atISO ว่าง = ยกเลิก); template = ข้อความที่แก้ไว้
export async function scheduleDocReminder(examId: string, atISO: string, template = ""): Promise<boolean> {
  const e = await getExam(examId);
  if (!e?.__row || !e.doc_link) return false;
  await patchRecord("exams", e.__row, e as never, {
    doc_reminder_at: atISO,
    doc_reminder_status: atISO ? "pending" : "",
    doc_reminder_template: atISO ? template : "",
  });
  invalidateExams();
  return true;
}

export interface RankRow {
  student_id: string;
  nickname: string;
  lineUserId: string; // "" = ยังไม่ได้ลงทะเบียน (ส่งข้อความไม่ได้)
  misses: number;
  missedExams: string[];
  redzone: boolean;
  distanceToRed: number;
}

// จัดอันดับจากทะเบียนทั้งรุ่น (ไม่ใช่แค่คนที่ลงทะเบียน) เพื่อให้ red zone ถูกต้อง
export async function ranking(): Promise<{ rows: RankRow[]; redzoneMin: number }> {
  const [roster, members, exams] = await Promise.all([readRoster(), verifiedMembers(), readExams()]);
  const lineById = new Map(members.map((m) => [digits(m.matched_student_id), m.line_user_id]));

  const base = roster.map((r) => {
    const sid = digits(r.student_id);
    const missedExams = exams.filter((e) => idList(e.not_memorized_ids).includes(sid)).map((e) => e.name);
    return { student_id: sid, nickname: r.nickname || r.full_name || sid, lineUserId: lineById.get(sid) || "", misses: missedExams.length, missedExams };
  });

  const sorted = [...base].sort((a, b) => b.misses - a.misses);
  const withMiss = sorted.filter((r) => r.misses > 0);
  const redSet = new Set(withMiss.slice(0, RED_ZONE_SIZE).map((r) => r.student_id));
  const redzoneMin = withMiss.length >= RED_ZONE_SIZE ? withMiss[RED_ZONE_SIZE - 1].misses : (withMiss.at(-1)?.misses ?? 1);

  const rows: RankRow[] = sorted.map((r) => ({
    ...r,
    redzone: redSet.has(r.student_id),
    distanceToRed: Math.max(0, redzoneMin - r.misses + (redSet.has(r.student_id) ? 0 : 1)),
  }));
  return { rows, redzoneMin };
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
function fillTokens(tpl: string, r: RankRow): string {
  return tpl
    .replace(/\{ชื่อเล่น\}/g, r.nickname)
    .replace(/\{จำนวน\}/g, String(r.misses))
    .replace(/\{ข้อสอบ\}/g, r.missedExams.map((n) => `• ${n}`).join("\n"))
    .replace(/\{ระยะห่าง\}/g, String(r.distanceToRed))
    .replace(/\{จำนวนโซน\}/g, String(RED_ZONE_SIZE));
}
// ต่อลิงก์ท้ายข้อความ (ถ้าฝ่ายวิชาการใส่มา และยังไม่มีในข้อความ)
function appendLink(msg: string, link?: string): string {
  const l = (link ?? "").trim();
  if (!l || msg.includes(l)) return msg;
  return `${msg}\n\n${l}`;
}

function messageFor(mode: AcademicMode, r: RankRow, opts?: AcademicOpts): string | null {
  if (mode === "redzone" && !r.redzone) return null;
  if (mode === "rest" && (r.redzone || r.misses === 0)) return null;
  if (mode === "unmemorized" && r.misses === 0) return null;
  if (!["redzone", "rest", "unmemorized"].includes(mode)) return null;
  const tpl = opts?.template?.trim() || DEFAULT_TEMPLATES[mode];
  return appendLink(fillTokens(tpl, r) + (opts?.template ? "" : REMARK), opts?.link);
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
  const { rows } = await ranking();
  const targets = rows.map((r) => ({ r, msg: messageFor(mode, r, opts) })).filter((x) => x.msg && x.r.lineUserId) as { r: RankRow; msg: string }[];
  const withoutLine = rows.filter((r) => messageFor(mode, r, opts) && !r.lineUserId).length;
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

export interface AcademicSendResult { ok: boolean; count: number; testMode: boolean; sample?: string; error?: string }

export async function academicBroadcast(
  mode: AcademicMode, testMode: boolean, adminIds: string[], exam?: Exam | null, opts?: AcademicOpts
): Promise<AcademicSendResult> {
  let targets: { lineUserId: string; msg: string }[] = [];

  if (mode === "doc") {
    if (!exam?.doc_link) return { ok: false, count: 0, testMode, error: "no_doc_link" };
    const msg = docMessage(exam, false, opts);
    targets = (await verifiedMembers()).map((m) => ({ lineUserId: m.line_user_id, msg }));
  } else if (mode === "doc_unfilled") {
    if (!exam?.doc_link) return { ok: false, count: 0, testMode, error: "no_doc_link" };
    const msg = docMessage(exam, true, opts);
    const recips = await membersInSet(idList(exam.not_filled_ids ?? ""));
    targets = recips.map((r) => ({ lineUserId: r.lineUserId, msg }));
  } else {
    const { rows } = await ranking();
    targets = rows
      .map((r) => ({ r, msg: messageFor(mode, r, opts) }))
      .filter((x) => x.msg && x.r.lineUserId)
      .map((x) => ({ lineUserId: x.r.lineUserId, msg: x.msg! }));
  }

  if (targets.length === 0) return { ok: false, count: 0, testMode, error: "no_recipients" };
  const sample = targets[0].msg;
  try {
    if (testMode) {
      const preview = `[ทดสอบวิชาการ] โหมด "${AUDIENCE_LABEL[mode]}" จะส่งถึง ${targets.length} คน\nตัวอย่างข้อความที่ผู้รับจะเห็น:\n\n${sample}`;
      for (const a of adminIds) await pushTo(a, [{ type: "text", text: preview }]);
    } else {
      for (const t of targets) await pushTo(t.lineUserId, [{ type: "text", text: t.msg }]);
    }
  } catch (err) {
    return { ok: false, count: 0, testMode, error: String(err) };
  }
  return { ok: true, count: targets.length, testMode, sample };
}

// ── cron: ส่งเตือนกรอกเอกสารที่ตั้งเวลาไว้และถึงกำหนดแล้ว ─────────────────────
export async function runDueDocReminders(adminIds: string[], now = Date.now()): Promise<number> {
  const exams = await readExams();
  let sent = 0;
  for (const e of exams) {
    if (e.doc_reminder_status !== "pending" || !e.doc_reminder_at || !e.doc_link) continue;
    const t = new Date(e.doc_reminder_at).getTime();
    if (isNaN(t) || t > now) continue;
    const r = await academicBroadcast("doc", false, adminIds, e, { template: e.doc_reminder_template }); // ส่งจริงถึงทุกคน
    if (e.__row) await patchRecord("exams", e.__row, e as never, { doc_reminder_status: "sent" });
    if (r.ok) sent++;
  }
  if (sent) invalidateExams();
  return sent;
}
