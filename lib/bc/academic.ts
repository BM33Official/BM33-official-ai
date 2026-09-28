// ระบบวิชาการ — ติดตามการจำข้อสอบ + จัดอันดับ red zone (สะสม) + ประกาศเฉพาะกลุ่ม
import { readKey, readKeyFresh, appendRecord, patchRecord, nowISO } from "@/lib/bc/sheets";
import { deleteRow } from "@/lib/google-sheets";
import { TABS, Exam } from "@/lib/bc/types";
import { verifiedMembers } from "@/lib/bc/members";
import { readRoster } from "@/lib/bc/roster";
import { getConfig } from "@/lib/bc/config";
import { pushTo } from "@/lib/line";
import type { messagingApi } from "@line/bot-sdk";
type Msg = messagingApi.Message;
type FlexBubble = messagingApi.FlexBubble;
type FlexButton = messagingApi.FlexButton;
type FlexText = messagingApi.FlexText;
import { bust } from "@/lib/cache";

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
// บันทึกชุด student_id ที่ "ยังไม่ได้กรอก/จำ" ของข้อสอบนี้ — รายชื่อเดียวใช้ทั้ง Red Zone และการตามเตือน
// (not_filled_ids เขียนค่าเดียวกันไว้ให้ของเก่า · คนที่ "ยอมโดน" แต่ถูกเอาออกจากรายชื่อ -> ล้างสถานะยอมโดนด้วย)
export async function setNotMemorized(examId: string, studentIds: string[]): Promise<void> {
  const e = await getExam(examId, true);
  if (!e?.__row) return;
  const clean = Array.from(new Set(studentIds.map(digits).filter(Boolean)));
  const accepted = idList(e.accepted_ids ?? "").filter((x) => clean.includes(x));
  await patchRecord("exams", e.__row, e as never, { not_memorized_ids: clean.join(","), not_filled_ids: clean.join(","), accepted_ids: accepted.join(",") });
}
export const setNotFilled = setNotMemorized; // รวมเป็นรายชื่อเดียวแล้ว

// เพื่อนกด "จำไม่ได้ ยอมโดน" ในแอป (on=false = ยกเลิก) — เฉพาะข้อสอบที่ตัวเองยังไม่ได้กรอก
export async function setAccepted(examId: string, studentId: string, on: boolean): Promise<boolean> {
  const e = await getExam(examId, true);
  const sid = digits(studentId);
  if (!e?.__row || !idList(e.not_memorized_ids).includes(sid)) return false;
  const set = new Set(idList(e.accepted_ids ?? ""));
  if (on) set.add(sid); else set.delete(sid);
  await patchRecord("exams", e.__row, e as never, { accepted_ids: Array.from(set).join(",") });
  return true;
}

// ข้อสอบที่ "ยังไม่ได้กรอก" ของแต่ละคน (ใหม่ -> เก่า)
export interface PendingExam { exam_id: string; name: string; link: string; title: string; date: string; accepted: boolean }
export async function pendingExams(): Promise<Map<string, PendingExam[]>> {
  const out = new Map<string, PendingExam[]>();
  for (const e of examOrder(await readExams())) {
    const acc = new Set(idList(e.accepted_ids ?? ""));
    for (const sid of idList(e.not_memorized_ids)) {
      const list = out.get(sid) ?? [];
      list.push({ exam_id: e.exam_id, name: e.name, link: e.doc_link ?? "", title: e.doc_title ?? "", date: e.exam_date ?? "", accepted: acc.has(sid) });
      out.set(sid, list);
    }
  }
  return out;
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
  misses: number; // ไม่ได้จำข้อสอบ (ครั้ง)
  missedExams: string[];
  feeMisses: number; // เงินรุ่นเลยกำหนดแล้วยังไม่จ่าย (เดือน)
  feeMonths: string[];
  score: number; // คะแนนสะสม = ข้อสอบ (ล่าสุดมีน้ำหนักมากกว่า) + เงินรุ่นค้าง
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

// เงินรุ่นที่ "เลยกำหนดแล้วยังไม่จ่าย" ของทุกคน (student id -> ป้ายเดือน) — ใช้ร่วมกับ red zone
export async function overdueFees(now = Date.now()): Promise<Map<string, string[]>> {
  const { readFeeMonths, readPayments, stateFor, monthLabel } = await import("@/lib/bc/fees");
  const [months, payments] = await Promise.all([readFeeMonths(), readPayments()]);
  const pay = new Map(payments.map((p) => [`${digits(p.student_id)}|${p.month}`, p]));
  const out = new Map<string, string[]>();
  const roster = await readRoster();
  for (const r of roster) {
    const sid = digits(r.student_id);
    const list = months.filter((m) => stateFor(m, pay.get(`${sid}|${m.month}`), now) === "overdue").map((m) => m.label || monthLabel(m.month));
    if (list.length) out.set(sid, list);
  }
  return out;
}

export async function redZoneFeeRule(): Promise<{ on: boolean; weight: number }> {
  const cfg = await getConfig();
  const w = Number(cfg.red_zone_fee_weight);
  return { on: (cfg.red_zone_fees ?? "").trim() !== "0", weight: Number.isFinite(w) && w > 0 ? w : 1 };
}

// เดือนที่ค้างยกมาจากระบบเดิม (ฝ่ายการเงินกรอกเอง) — {"<student_id>": n}
export async function feeCarry(): Promise<Map<string, number>> {
  const cfg = await getConfig();
  const out = new Map<string, number>();
  try {
    for (const [k, v] of Object.entries(JSON.parse(cfg.fee_carry_json || "{}") as Record<string, unknown>)) {
      const n = Math.max(0, Math.min(24, Math.round(Number(v) || 0)));
      if (n > 0 && digits(k)) out.set(digits(k), n);
    }
  } catch { /* ค่าเสีย = ไม่มียอดยกมา */ }
  return out;
}

// ระดับ Red Zone ตาม "จำนวนที่ค้าง" (ข้อสอบที่ยังไม่ได้กรอก + เดือนเงินรุ่นที่เลยกำหนด/ยกมา)
//   3 ขึ้นไป = Red Zone · 2 = ใกล้ · 1 = เฝ้าระวัง · 0 = ปลอดภัย   (ลำดับยังเรียงตามคะแนนสะสม)
export const ZONE_RED = 3;
export function levelFor(strikes: number): ZoneLevel {
  return strikes >= ZONE_RED ? "red" : strikes === 2 ? "close" : strikes === 1 ? "watch" : "safe";
}

export async function ranking(): Promise<{ rows: RankRow[]; redzoneMin: number; size: number; threshold: number; fees: { on: boolean; weight: number } }> {
  const [roster, members, exams, fees, carry, rule] = await Promise.all([readRoster(), verifiedMembers(), readExams(), overdueFees().catch(() => new Map<string, string[]>()), feeCarry(), redZoneFeeRule()]);
  const lineById = new Map(members.map((m) => [digits(m.matched_student_id), m.line_user_id]));
  const ordered = examOrder(exams);
  const weight = new Map(ordered.map((e, i) => [e.exam_id, Math.max(0.35, RECENCY_DECAY ** i)]));

  const base = roster.map((r) => {
    const sid = digits(r.student_id);
    const missed = ordered.filter((e) => idList(e.not_memorized_ids).includes(sid));
    // red zone = ข้อสอบที่ยังไม่ได้กรอก + เงินรุ่นเลยกำหนด/ค้างยกมา (ฝ่ายการเงินปิดได้ / ปรับน้ำหนักได้)
    const c = rule.on ? carry.get(sid) ?? 0 : 0;
    const feeMonths = rule.on ? [...(c ? [`ค้างยกมา ${c} เดือน`] : []), ...(fees.get(sid) ?? [])] : [];
    const feeN = rule.on ? c + (fees.get(sid)?.length ?? 0) : 0;
    const score = Math.round((missed.reduce((a, e) => a + (weight.get(e.exam_id) ?? 1), 0) + feeN * rule.weight) * 100) / 100;
    return {
      student_id: sid, nickname: r.nickname || r.full_name || sid, lineUserId: lineById.get(sid) || "",
      misses: missed.length, missedExams: missed.map((e) => e.name), feeMisses: feeN, feeMonths, score,
    };
  });

  const strikes = (r: { misses: number; feeMisses: number }) => r.misses + r.feeMisses;
  const sorted = [...base].sort((a, b) => b.score - a.score || strikes(b) - strikes(a));
  const rows: RankRow[] = sorted.map((r) => {
    const level = levelFor(strikes(r));
    return { ...r, level, redzone: level === "red", distanceToRed: Math.max(0, ZONE_RED - strikes(r)) };
  });
  return { rows, redzoneMin: ZONE_RED, size: rows.filter((r) => r.redzone).length, threshold: ZONE_RED, fees: rule };
}

// ── ส่งข้อความถึงเพื่อน — 3 แบบ ชัด ๆ ─────────────────────────────────────────
//   invite = ก่อนตรวจ: ชวน "ทุกคน" ไปกรอกข้อสอบที่เลือก (ลิงก์เอกสารของข้อสอบนั้น · ตั้งเวลาได้)
//   chase  = หลังตรวจ: ตามเฉพาะคนที่ "ยังไม่ได้กรอก" — 1 ข้อความรวมทุกข้อสอบที่ค้าง + ปุ่มลิงก์แยกทีละข้อสอบ
//            (คนที่กด "จำไม่ได้ ยอมโดน" ในแอป = ไม่ตามแล้ว)
//   zone   = แจ้งระดับ Red Zone ให้คนที่ค้าง 2 อย่างขึ้นไป (ใกล้ + Red Zone) พร้อมรายการที่ค้าง
export type AcademicMode = "invite" | "chase" | "zone";
const MODE_ALIAS: Record<string, AcademicMode> = { doc: "invite", doc_unfilled: "chase", unmemorized: "chase", rest: "zone", redzone: "zone" };
export const normMode = (m: string): AcademicMode => (["invite", "chase", "zone"].includes(m) ? m as AcademicMode : MODE_ALIAS[m] ?? "chase");

export interface AcademicOpts { template?: string; link?: string; examIds?: string[]; by?: string }

const APP = "https://liff.line.me/2011755768-aSlCqo7l";
export const DEFAULT_TEMPLATES: Record<AcademicMode, string> = {
  invite: `ฝากทุกคนไปกรอกข้อที่ตัวเองรับผิดชอบใน "{ข้อสอบ}" ด้วยน้า 📄\nกรอกครบแล้วข้ามได้เลย ขอบคุณมาก ๆ 🙏`,
  chase: `{ชื่อเล่น} จ๋า 📝 ยังไม่เห็นข้อที่รับผิดชอบใน {จำนวน} ข้อสอบนี้เลย กดปุ่มไปกรอกทีละอันได้เลยน้า\nถ้าจำไม่ได้จริง ๆ กด “จำไม่ได้ ยอมโดน” ในแอปได้ ระบบจะไม่ตามอีก`,
  zone: `{ชื่อเล่น} จ๋า 📕 ตอนนี้อยู่ระดับ “{ระดับ}” (ค้าง {ค้าง} อย่าง · ครบ 3 = Red Zone)\nเคลียร์ทีละอย่างได้เลย เดี๋ยวก็หลุดโซน สู้ ๆ 💪`,
};
const LEVEL_TH: Record<ZoneLevel, string> = { red: "Red Zone", close: "ใกล้ Red Zone", watch: "เฝ้าระวัง", safe: "ปลอดภัย" };
const LEVEL_COLOR: Record<ZoneLevel, string> = { red: "#E11D48", close: "#EA580C", watch: "#CA8A04", safe: "#16A34A" };

// การ์ดกลาง: ใช้ทั้งสร้าง LINE Flex และตัวอย่างในหน้าเว็บ (ให้เห็นเหมือนกันเป๊ะ)
export interface MsgCard {
  color: string; head: string; title: string; text: string; lines: string[];
  bubbles: { title: string; sub: string; buttons: { label: string; url: string }[] }[];
  app: { label: string; url: string };
}

function fill(tpl: string, t: Record<string, string>): string {
  return tpl.replace(/\{(ชื่อเล่น|จำนวน|ข้อสอบ|ระดับ|ค้าง)\}/g, (_, k) => t[k] ?? "");
}
const examLabel = (e: { name: string; date?: string }) => e.name + (e.date ? ` (${e.date.slice(8, 10)}/${e.date.slice(5, 7)})` : "");

export function cardToMessages(c: MsgCard): Msg[] {
  const btn = (b: { label: string; url: string }, i: number, color: string): FlexButton => ({
    type: "button", height: "sm", style: i === 0 ? "primary" : "secondary", color: i === 0 ? color : undefined,
    action: { type: "uri", label: b.label.slice(0, 20), uri: b.url },
  });
  const main: FlexBubble = {
    type: "bubble", size: "kilo",
    header: { type: "box", layout: "vertical", backgroundColor: c.color, paddingAll: "14px", contents: [
      { type: "text", text: c.head, color: "#FFFFFFCC", size: "xs", weight: "bold" },
      { type: "text", text: c.title.slice(0, 60), color: "#FFFFFF", size: "lg", weight: "bold", wrap: true, margin: "xs" },
    ] },
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", contents: [
      { type: "text", text: c.text.slice(0, 900), size: "sm", wrap: true, color: "#0F172A" },
      ...(c.lines.length ? [{ type: "separator", margin: "md" } as const] : []),
      ...c.lines.slice(0, 10).map((l): FlexText => ({ type: "text", text: l.slice(0, 90), size: "xs", wrap: true, color: "#334155" })),
    ] },
    footer: { type: "box", layout: "vertical", paddingAll: "12px", contents: [btn(c.app, 0, c.color)] },
  };
  const rest: FlexBubble[] = c.bubbles.slice(0, 9).map((b) => ({
    type: "bubble", size: "micro",
    header: { type: "box", layout: "vertical", backgroundColor: c.color, paddingAll: "10px", contents: [{ type: "text", text: "📄 ข้อสอบ", color: "#FFFFFF", size: "xs", weight: "bold" }] },
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", contents: [
      { type: "text", text: b.title.slice(0, 80), weight: "bold", size: "sm", wrap: true, maxLines: 3 },
      ...(b.sub ? [{ type: "text", text: b.sub.slice(0, 60), size: "xxs", color: "#64748B", wrap: true } as FlexText] : []),
    ] },
    footer: { type: "box", layout: "vertical", spacing: "xs", paddingAll: "10px", contents: b.buttons.slice(0, 2).map((x, i) => btn(x, i, c.color)) },
  }));
  const alt = `${c.title} — ${c.text}`.replace(/\s+/g, " ").slice(0, 380);
  return [{ type: "flex", altText: alt, contents: rest.length ? { type: "carousel", contents: [main, ...rest] } : main }];
}

// ── ใครได้อะไร ──────────────────────────────────────────────────────────────
interface Target { sid: string; lineUserId: string; card: MsgCard }

async function buildTargets(mode: AcademicMode, opts: AcademicOpts = {}): Promise<{ targets: Target[]; unreg: number; label: string; error?: string }> {
  const tpl = (opts.template ?? "").trim() || DEFAULT_TEMPLATES[mode];
  const extra = (opts.link ?? "").trim();
  const extraBtn = /^https?:\/\//.test(extra) ? [{ label: "ลิงก์เพิ่มเติม", url: extra }] : [];
  const { rows } = await ranking();
  const exams = await readExams();

  if (mode === "invite") {
    const e = exams.find((x) => x.exam_id === opts.examIds?.[0]);
    if (!e) return { targets: [], unreg: 0, label: "", error: "เลือกข้อสอบก่อน" };
    const members = await verifiedMembers();
    const card: MsgCard = {
      color: "#4F46E5", head: "📄 ชวนกรอกข้อสอบ", title: examLabel({ name: e.name, date: e.exam_date }),
      text: fill(tpl, { ข้อสอบ: e.doc_title || e.name }), lines: [], bubbles: [],
      app: e.doc_link ? { label: "ไปกรอกเลย", url: e.doc_link } : { label: "ดูในแอป", url: `${APP}?tab=zone` },
    };
    if (extraBtn.length) card.bubbles.push({ title: "ลิงก์เพิ่มเติม", sub: "", buttons: extraBtn });
    return { targets: members.map((m) => ({ sid: digits(m.matched_student_id), lineUserId: m.line_user_id, card })), unreg: 0, label: `ทุกคนที่ลงทะเบียน (${members.length} คน) · ข้อสอบ ${e.name}` };
  }

  const pend = await pendingExams();
  const pick = new Set(opts.examIds?.length ? opts.examIds : exams.map((e) => e.exam_id));
  const targets: Target[] = [];
  let unreg = 0;
  for (const r of rows) {
    const mine = (pend.get(r.student_id) ?? []).filter((p) => !p.accepted && pick.has(p.exam_id));
    let card: MsgCard | null = null;
    if (mode === "chase" && mine.length) {
      card = {
        color: "#E11D48", head: "📝 ยังไม่ได้กรอก", title: `${mine.length} ข้อสอบ`,
        text: fill(tpl, { ชื่อเล่น: r.nickname, จำนวน: String(mine.length), ข้อสอบ: mine.map((m) => m.name).join(", "), ระดับ: LEVEL_TH[r.level], ค้าง: String(r.misses + r.feeMisses) }),
        lines: mine.map((m) => `• ${examLabel(m)}`),
        bubbles: [...mine.map((m) => ({ title: examLabel(m), sub: m.title, buttons: m.link ? [{ label: "ไปกรอก", url: m.link }, { label: "จำไม่ได้ ยอมโดน", url: `${APP}?tab=zone` }] : [{ label: "ดูในแอป", url: `${APP}?tab=zone` }] })),
          ...(extraBtn.length ? [{ title: "ลิงก์เพิ่มเติม", sub: "", buttons: extraBtn }] : [])],
        app: { label: "ดูทั้งหมดในแอป", url: `${APP}?tab=zone` },
      };
    }
    if (mode === "zone" && (r.level === "red" || r.level === "close")) {
      const all = pend.get(r.student_id) ?? [];
      card = {
        color: LEVEL_COLOR[r.level], head: "📕 สถานะ Red Zone", title: LEVEL_TH[r.level],
        text: fill(tpl, { ชื่อเล่น: r.nickname, จำนวน: String(all.length), ข้อสอบ: all.map((m) => m.name).join(", "), ระดับ: LEVEL_TH[r.level], ค้าง: String(r.misses + r.feeMisses) }),
        lines: [...all.map((m) => `📝 ${examLabel(m)}${m.accepted ? " (ยอมโดนแล้ว)" : ""}`), ...r.feeMonths.map((f) => `💸 เงินรุ่น ${f}`)],
        bubbles: [...all.filter((m) => !m.accepted && m.link).map((m) => ({ title: examLabel(m), sub: m.title, buttons: [{ label: "ไปกรอก", url: m.link }] })),
          ...(r.feeMisses ? [{ title: "เงินรุ่นที่ค้าง", sub: r.feeMonths.join(", "), buttons: [{ label: "จ่าย/ส่งสลิป", url: `${APP}?tab=fees` }] }] : []),
          ...(extraBtn.length ? [{ title: "ลิงก์เพิ่มเติม", sub: "", buttons: extraBtn }] : [])],
        app: { label: "ดูในแอป", url: `${APP}?tab=zone` },
      };
    }
    if (!card) continue;
    if (!r.lineUserId) { unreg++; continue; }
    targets.push({ sid: r.student_id, lineUserId: r.lineUserId, card });
  }
  const label = mode === "chase" ? "เฉพาะคนที่ยังไม่ได้กรอก (ไม่รวมคนที่กดยอมโดน)" : "คนที่อยู่ Red Zone และใกล้ Red Zone (ค้าง 2 อย่างขึ้นไป)";
  return { targets, unreg, label };
}

// ── preview: นับผู้รับ + ตัวอย่างการ์ด (ไม่ส่งจริง) ───────────────────────────
export interface AcademicPreview { count: number; audience: string; card: MsgCard | null; unreg: number; error?: string }
export async function academicPreview(mode: AcademicMode, opts?: AcademicOpts): Promise<AcademicPreview> {
  const t = await buildTargets(mode, opts);
  // ตัวอย่าง = คนที่มีรายการเยอะสุด (เห็นว่ามีหลายข้อสอบแล้วมีปุ่มแยก)
  const best = [...t.targets].sort((a, b) => b.card.bubbles.length - a.card.bubbles.length)[0];
  return { count: t.targets.length, audience: t.label + (t.unreg ? ` · อีก ${t.unreg} คนยังไม่ลงทะเบียน (ส่งไม่ได้)` : ""), card: best?.card ?? null, unreg: t.unreg, error: t.error };
}

export interface AcademicSendResult { ok: boolean; count: number; testMode: boolean; error?: string; code?: string }

// testMode = ส่งการ์ดตัวอย่างจริงให้แอดมินดูใน LINE · ไม่ใช่ testMode = ส่งถึงเพื่อนทันที (ฝ่ายวิชาการมีสิทธิ์ส่งเองตามที่ประธาน/แอดมินอนุญาต)
export async function academicBroadcast(mode: AcademicMode, testMode: boolean, adminIds: string[], opts?: AcademicOpts): Promise<AcademicSendResult> {
  const t = await buildTargets(mode, opts);
  if (t.error) return { ok: false, count: 0, testMode, error: t.error };
  if (!t.targets.length) return { ok: false, count: 0, testMode, error: "no_recipients" };
  const best = [...t.targets].sort((a, b) => b.card.bubbles.length - a.card.bubbles.length)[0];
  try {
    if (testMode) {
      for (const a of adminIds) await pushTo(a, [{ type: "text", text: `[ทดสอบวิชาการ] จะส่งถึง ${t.targets.length} คน — ${t.label}\nตัวอย่างที่คนหนึ่งจะได้รับ 👇` }, ...cardToMessages(best.card)]);
      return { ok: true, count: t.targets.length, testMode };
    }
    const { createOutbox, approveAndSend } = await import("@/lib/bc/outbox");
    const per: Record<string, Msg[]> = {};
    for (const x of t.targets) per[x.sid] = cardToMessages(x.card);
    const title = mode === "invite" ? "ชวนกรอกข้อสอบ" : mode === "chase" ? "ตามคนที่ยังไม่ได้กรอก" : "แจ้งสถานะ Red Zone";
    const item = await createOutbox({
      kind: "academic", title: `วิชาการ: ${title} (${t.targets.length} คน)`,
      audience: `ids:${Object.keys(per).join(",")}`, messages: [], perRecipient: per,
      preview: `${t.label}\nแต่ละคนได้ 1 ข้อความ (การ์ดเลื่อนได้ · ปุ่มลิงก์แยกทีละข้อสอบ)\n\nตัวอย่าง: ${best.card.title}\n${best.card.text}\n${best.card.lines.join("\n")}`,
      notify: false,
    });
    // ฝ่ายวิชาการมีสิทธิ์ส่งเอง: กดส่ง = ส่งทันที (แถวใน BC_outbox เป็นประวัติ)
    const sent = await approveAndSend(item.id, opts?.by || "academic");
    if (!sent.ok) return { ok: false, count: 0, testMode, error: sent.error, code: item.code };
    return { ok: true, count: sent.count, testMode, code: item.code };
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
    const r = await academicBroadcast("invite", false, adminIds, { examIds: [e.exam_id], template: e.doc_reminder_template, by: "academic:ตั้งเวลา" }); // ฝ่ายวิชาการตั้งเวลาไว้เอง -> ส่งทันทีเมื่อถึงเวลา
    if (e.__row) await patchRecord("exams", e.__row, e as never, { doc_reminder_status: "sent" });
    if (r.ok) sent++;
  }
  return sent;
}
