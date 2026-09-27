// ตรวจ "จำข้อสอบ" อัตโนมัติ
//   1) ใบแบ่งข้อ (ชีต/รูป/ไฟล์) -> ใครรับผิดชอบข้อไหน  (หรือสูตร: เลขที่ mod จำนวนข้อ)
//   2) เอกสารที่ทุกคนพิมพ์ข้อสอบลงไป -> ข้อไหน "มีเนื้อหาแล้ว"
//   3) คนที่มีข้อของตัวเองว่างอย่างน้อย 1 ข้อ = ยังไม่ได้จำ (ข้อเดียวกันหลายคนรับ แล้วว่าง -> ทุกคนที่รับข้อนั้น)
//   ฝ่ายวิชาการแค่ตรวจทานตาราง แล้วกดบันทึก -> red zone อัปเดตเอง
import { z } from "zod";
import { generateJSON, Type, Part } from "@/lib/gemini";
import { readRoster } from "@/lib/bc/roster";
import { getExam } from "@/lib/bc/academic";
import { patchRecord, nowISO, digits } from "@/lib/bc/sheets";
import { log } from "@/lib/logger";

export type AssignMap = Record<string, number[]>; // student_id -> ข้อ

// ── 1) ใบแบ่งข้อ ─────────────────────────────────────────────────────────────
const AssignZ = z.object({
  pairs: z.array(z.object({ student: z.string().default(""), questions: z.array(z.number()).default([]) })).default([]),
  question_count: z.number().default(0),
  note: z.string().default(""),
});

const ASSIGN_SYSTEM = `อ่าน "ใบแบ่งข้อจำข้อสอบ" ของนักศึกษาแพทย์ (ตาราง/รูป) แล้วแปลงเป็น JSON
- pairs: รายการ { student, questions } — student = เลขที่ (1–100) หรือรหัสนักศึกษา 10 หลัก หรือชื่อ/ชื่อเล่น ตามที่เขียนในเอกสาร, questions = เลขข้อที่คนนั้นต้องจำ (กางช่วง เช่น 5-7 -> [5,6,7])
- ถ้าตารางเป็นแบบ "ข้อ -> เลขที่" ให้กลับด้านให้ถูก (แต่ละคน -> ข้อของตัวเอง)
- ถ้ามีหลายส่วน (MCQ / short answer / lab) ใช้เลขข้อตามที่เขียน และบอกใน note
- question_count = จำนวนข้อทั้งหมด (ถ้ารู้)
ห้ามเดาข้อมูลที่ไม่มี`;

export async function parseAssignment(input: { text?: string; parts?: Part[] }, who = ""): Promise<{ map: AssignMap; unresolved: string[]; count: number; note: string }> {
  const { data } = await generateJSON(ASSIGN_SYSTEM, input.text ? `<เอกสาร>\n${input.text.slice(0, 60_000)}\n</เอกสาร>` : "เอกสารแนบด้านล่าง", {
    type: Type.OBJECT,
    properties: {
      pairs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { student: { type: Type.STRING }, questions: { type: Type.ARRAY, items: { type: Type.INTEGER } } }, required: ["student", "questions"] } },
      question_count: { type: Type.INTEGER }, note: { type: Type.STRING },
    },
    required: ["pairs"],
  }, AssignZ as unknown as z.ZodType<z.infer<typeof AssignZ>>, {
    extraParts: input.parts, timeoutMs: 50_000, temperature: 0.1, thinking: "LOW", maxOutputTokens: 12_000, feature: "academic", who,
  });
  if (!data) throw new Error("อ่านใบแบ่งข้อไม่สำเร็จ");
  const { resolve } = await studentResolver();
  const map: AssignMap = {};
  const unresolved: string[] = [];
  for (const p of data.pairs) {
    const sid = resolve(p.student);
    if (!sid) { unresolved.push(p.student); continue; }
    map[sid] = Array.from(new Set([...(map[sid] ?? []), ...p.questions.filter((q) => q > 0 && q < 1000)])).sort((a, b) => a - b);
  }
  const maxQ = Math.max(0, ...Object.values(map).flat());
  return { map, unresolved, count: data.question_count || maxQ, note: data.note };
}

// สูตร: เลขที่ n จำข้อ ((n-1) mod N) + 1 (+ รอบถัดไปถ้าจำนวนคนน้อยกว่าข้อ)
export async function assignByModulo(count: number): Promise<AssignMap> {
  const roster = await readRoster();
  const map: AssignMap = {};
  const nums = roster.map((r) => ({ sid: r.student_id, no: Number(r.student_id.slice(-3)) })).filter((x) => x.no > 0).sort((a, b) => a.no - b.no);
  for (const { sid, no } of nums) map[sid] = [((no - 1) % count) + 1];
  // ข้อที่ยังไม่มีใครรับ (คนน้อยกว่าข้อ) -> แจกวนต่อ
  for (let q = nums.length + 1; q <= count; q++) {
    const who = nums[(q - 1) % nums.length];
    if (who) map[who.sid].push(q);
  }
  return map;
}

async function studentResolver() {
  const roster = await readRoster();
  const byNo = new Map(roster.map((r) => [Number(r.student_id.slice(-3)), r.student_id]));
  const byName = new Map<string, string>();
  for (const r of roster) {
    for (const n of [r.nickname, r.full_name, r.full_name?.split(" ")[0], r.nickname_en, r.name_en]) {
      const k = String(n ?? "").replace(/\s+/g, "").toLowerCase();
      if (k.length >= 2 && !byName.has(k)) byName.set(k, r.student_id);
    }
  }
  const resolve = (raw: string): string => {
    const s = String(raw ?? "").trim();
    const d = digits(s);
    if (d.length >= 9) return roster.find((r) => r.student_id === d || r.student_id.endsWith(d.slice(-3)))?.student_id ?? "";
    if (d && d.length <= 3 && /^\D{0,12}\d{1,3}\D{0,3}$/.test(s)) return byNo.get(Number(d)) ?? "";
    const k = s.replace(/^(นาย|นางสาว|นาง|น\.ส\.)/, "").replace(/\s+/g, "").toLowerCase();
    return byName.get(k) ?? [...byName].find(([n]) => k.length >= 3 && (n.startsWith(k) || k.startsWith(n)))?.[1] ?? "";
  };
  return { resolve, roster };
}

// ── 2) เอกสารที่พิมพ์ข้อสอบ ───────────────────────────────────────────────────
export interface DocCheck { filled: number[]; empty: number[]; snippets: Record<number, string>; method: "rule" | "ai" }

const TEMPLATE_WORDS = /(โจทย์|คำถาม|ตัวเลือก|ช้อยส์|choice|คำตอบ|เฉลย|answer|ข้อที่|ข้อ|question|\(ว่าง\)|ว่าง|-|_|\.|:|ก\.|ข\.|ค\.|ง\.|จ\.|a\)|b\)|c\)|d\)|e\))/gi;

export function checkDocByRule(text: string, count: number): DocCheck | null {
  const lines = text.replace(/\r/g, "").replace(/\f/g, "\n").split("\n");
  type M = { q: number; i: number };
  let marks: M[] = [];
  lines.forEach((l, i) => { const m = l.match(/^\s*(?:ข้อ(?:ที่)?|Q|No\.?)\s*(\d{1,3})\b/i); if (m) marks.push({ q: +m[1], i }); });
  if (marks.length < Math.max(3, count * 0.4)) {
    // ไม่มีคำว่า "ข้อ" -> ใช้เลขนำบรรทัดที่เรียงต่อกัน (1. 2. 3.)
    const seq: M[] = [];
    let prev = 0;
    lines.forEach((l, i) => {
      const m = l.match(/^\s*(\d{1,3})\s*[.)]\s*/);
      if (m && +m[1] > prev && +m[1] <= prev + 3) { seq.push({ q: +m[1], i }); prev = +m[1]; }
    });
    if (seq.length > marks.length) marks = seq;
  }
  if (marks.length < Math.max(3, count * 0.4)) return null;
  const filled = new Set<number>();
  const snippets: Record<number, string> = {};
  marks.forEach((m, k) => {
    const end = marks[k + 1]?.i ?? lines.length;
    const body = [lines[m.i].replace(/^\s*(?:ข้อ(?:ที่)?|Q|No\.?)?\s*\d{1,3}\s*[.)\]:：-]?/i, ""), ...lines.slice(m.i + 1, end)].join(" ");
    const core = body.replace(TEMPLATE_WORDS, "").replace(/\s+/g, "");
    if (core.length >= 12) { filled.add(m.q); snippets[m.q] = body.trim().slice(0, 140); }
  });
  const total = Math.max(count, ...marks.map((m) => m.q));
  const empty: number[] = [];
  for (let q = 1; q <= total; q++) if (!filled.has(q)) empty.push(q);
  return { filled: [...filled].sort((a, b) => a - b), empty, snippets, method: "rule" };
}

const DocZ = z.object({ filled: z.array(z.number()).default([]), notes: z.string().default("") });
export async function checkDocByAI(input: { text?: string; parts?: Part[] }, count: number, who = ""): Promise<DocCheck & { notes: string }> {
  const { data } = await generateJSON(
    `เอกสารนี้คือที่นักศึกษาแพทย์ช่วยกันพิมพ์ "ข้อสอบที่จำได้" ทีละข้อ (ทั้งหมดประมาณ ${count || "?"} ข้อ) บางข้อยังว่าง/มีแต่เลขข้อ/แม่แบบ
ตอบ JSON: filled = เลขข้อที่ "มีเนื้อหาโจทย์จริงแล้ว" (ไม่ใช่แค่เลขข้อ หัวข้อบท ช่องว่าง หรือแม่แบบตัวเลือกเปล่า)
การนับเลขข้อ: ถ้าเอกสารมีเลขข้อต่อเนื่องทั้งเล่มให้ใช้ตามนั้น · ถ้าเลขข้อเริ่มใหม่ในแต่ละบท/ส่วน ให้นับเรียงต่อกันทั้งเอกสาร (บทแรก 1–12 บทต่อไป 13–...) · ตัวเลือก 1-5 ใต้โจทย์ไม่ใช่เลขข้อ
notes = บอกสั้น ๆ ว่านับแบบไหน และแต่ละส่วนมีข้อไหนถึงข้อไหน`,
    input.text ? `<เอกสาร>\n${input.text.slice(0, 90_000)}\n</เอกสาร>` : "เอกสารแนบด้านล่าง",
    { type: Type.OBJECT, properties: { filled: { type: Type.ARRAY, items: { type: Type.INTEGER } }, notes: { type: Type.STRING } }, required: ["filled"] },
    DocZ as unknown as z.ZodType<z.infer<typeof DocZ>>,
    { extraParts: input.parts, timeoutMs: 50_000, temperature: 0.1, thinking: "LOW", maxOutputTokens: 4000, feature: "academic", who }
  );
  const filled = Array.from(new Set(data?.filled ?? [])).filter((q) => q > 0).sort((a, b) => a - b);
  const total = Math.max(count, ...filled, 0);
  const empty: number[] = [];
  for (let q = 1; q <= total; q++) if (!filled.includes(q)) empty.push(q);
  return { filled, empty, snippets: {}, method: "ai", notes: data?.notes ?? "" };
}

// ── 3) รวมผล ────────────────────────────────────────────────────────────────
export interface StudentCheck { student_id: string; no: number; nickname: string; assigned: number[]; missing: number[]; ok: boolean }

export async function combine(map: AssignMap, filled: number[]): Promise<StudentCheck[]> {
  const roster = await readRoster();
  const f = new Set(filled);
  return roster.map((r) => {
    const assigned = map[r.student_id] ?? [];
    const missing = assigned.filter((q) => !f.has(q));
    return { student_id: r.student_id, no: Number(r.student_id.slice(-3)), nickname: r.nickname || r.full_name, assigned, missing, ok: assigned.length > 0 && missing.length === 0 };
  }).sort((a, b) => a.no - b.no);
}

// บันทึกผลที่ฝ่ายวิชาการตรวจทานแล้ว
export async function saveCheck(examId: string, map: AssignMap, filled: number[], notMemorized: string[], count: number): Promise<boolean> {
  const e = await getExam(examId, true);
  if (!e?.__row) return false;
  const assign = JSON.stringify(map);
  if (assign.length > 45_000) log.warn("assign_json_large", { len: assign.length });
  await patchRecord("exams", e.__row, e as never, {
    assign_json: assign.slice(0, 48_000), recalled: filled.join(","), check_at: nowISO(), question_count2: String(count),
    not_memorized_ids: Array.from(new Set(notMemorized.map(digits).filter(Boolean))).join(","),
  });
  return true;
}
