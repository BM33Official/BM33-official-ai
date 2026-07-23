// ระบบวิชาการ — ติดตามการท่องข้อสอบ + จัดอันดับ red zone + ประกาศเฉพาะกลุ่ม
import { readTab, appendRecord, patchRecord, nowISO } from "@/lib/bc/sheets";
import { TABS, Exam } from "@/lib/bc/types";
import { verifiedMembers } from "@/lib/bc/members";
import { readRoster } from "@/lib/bc/roster";
import { pushTo } from "@/lib/line";

export const RED_ZONE_SIZE = 6;
const digits = (s: string) => String(s ?? "").replace(/\D/g, "");
const idList = (s: string) => String(s ?? "").split(",").map((x) => digits(x)).filter(Boolean);

export async function readExams(): Promise<Exam[]> {
  return readTab<Exam>(TABS.exams);
}
export async function getExam(examId: string): Promise<Exam | null> {
  return (await readExams()).find((e) => e.exam_id === examId) ?? null;
}
export async function addExam(name: string, exam_date: string, question_count: string): Promise<string> {
  const exam_id = `EX-${Date.now().toString(36).toUpperCase()}`;
  await appendRecord("exams", { exam_id, name, exam_date, question_count, not_memorized_ids: "", created_at: nowISO() });
  return exam_id;
}
// บันทึกชุด student_id ที่ "ยังไม่ท่อง" ของข้อสอบนี้
export async function setNotMemorized(examId: string, studentIds: string[]): Promise<void> {
  const e = await getExam(examId);
  if (!e?.__row) return;
  const clean = Array.from(new Set(studentIds.map(digits).filter(Boolean)));
  await patchRecord("exams", e.__row, e as never, { not_memorized_ids: clean.join(",") });
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

export type AcademicMode = "unmemorized" | "redzone" | "rest";

function messageFor(mode: AcademicMode, r: RankRow): string | null {
  const remark = "\n\nถ้าคิดว่าข้อมูลไม่ถูกต้อง ทักฝ่ายวิชาการได้เลยนะ 🙏";
  if (mode === "redzone") {
    if (!r.redzone) return null;
    return `เพื่อน ${r.nickname} 📕 ตอนนี้อยู่ใน red zone (ท่องข้อสอบน้อยสุด ${RED_ZONE_SIZE} อันดับของรุ่น) พลาดไปแล้ว ${r.misses} ครั้ง (${r.missedExams.join(", ")})\nรบกวนช่วยงานรุ่น/เข้าร่วมกิจกรรมถ้ามีรับสมัครนะ${remark}`;
  }
  if (mode === "rest") {
    if (r.redzone || r.misses === 0) return null;
    return `เพื่อน ${r.nickname} 📖 ยังไม่ได้ท่องข้อสอบ ${r.misses} ครั้ง (${r.missedExams.join(", ")})\nอีก ${r.distanceToRed} ครั้งจะเข้า red zone แล้วน้า เร่งท่องหน่อยน้าา${remark}`;
  }
  if (r.misses === 0) return null;
  return `เพื่อน ${r.nickname} 📝 มีข้อสอบที่ยังไม่ได้ท่อง ${r.misses} ครั้ง: ${r.missedExams.join(", ")}${remark}`;
}

export interface AcademicSendResult { ok: boolean; count: number; testMode: boolean; sample?: string; error?: string }

export async function academicBroadcast(mode: AcademicMode, testMode: boolean, adminIds: string[]): Promise<AcademicSendResult> {
  const { rows } = await ranking();
  const targets = rows
    .map((r) => ({ r, msg: messageFor(mode, r) }))
    .filter((x) => x.msg && x.r.lineUserId) as { r: RankRow; msg: string }[];

  if (targets.length === 0) return { ok: false, count: 0, testMode, error: "no_recipients" };
  const sample = targets[0].msg;
  try {
    if (testMode) {
      const preview = `[ทดสอบวิชาการ] โหมด "${mode}" จะส่งถึง ${targets.length} คน\nตัวอย่างข้อความ:\n\n${sample}`;
      for (const a of adminIds) await pushTo(a, [{ type: "text", text: preview }]);
    } else {
      for (const t of targets) await pushTo(t.r.lineUserId, [{ type: "text", text: t.msg }]);
    }
  } catch (err) {
    return { ok: false, count: 0, testMode, error: String(err) };
  }
  return { ok: true, count: targets.length, testMode, sample };
}
