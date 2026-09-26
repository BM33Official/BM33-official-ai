// ตารางเรียน + สอบมหาวิทยาลัย (BC_schedule / BC_uni_exams / BC_uploads)
// อัปโหลดไฟล์ตารางของแต่ละ block -> AI ถอดเป็นรายการ (สถานะ draft) -> แอดมินตรวจ/แก้ -> เผยแพร่ (live)
import { z } from "zod";
import {
  readKey, readKeyFresh, appendRecords, appendRecord, patchRecord, nowISO, newId,
} from "@/lib/bc/sheets";
import { batchUpdateRanges, colLetter } from "@/lib/google-sheets";
import { TABS, HEADERS, ScheduleItem, UniExam, UploadRec } from "@/lib/bc/types";
import { generateJSON, Type, Part } from "@/lib/gemini";
import { nowContextTh, bkkDate, bkkDayKey } from "@/lib/time";
import { bust } from "@/lib/cache";

export const KINDS = ["lecture", "lab", "exam", "activity", "other"] as const;
export const KIND_TH: Record<string, string> = {
  lecture: "บรรยาย", lab: "แล็บ/ปฏิบัติ", exam: "สอบ", activity: "กิจกรรม", other: "อื่น ๆ",
};

export async function readSchedule(force = false): Promise<ScheduleItem[]> {
  const rows = force ? await readKeyFresh<ScheduleItem>("schedule") : await readKey<ScheduleItem>("schedule");
  return rows.filter((r) => r.status !== "deleted");
}
export async function liveSchedule(): Promise<ScheduleItem[]> {
  return (await readSchedule())
    .filter((r) => r.status === "live" && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}
export async function readUniExams(force = false): Promise<UniExam[]> {
  const rows = force ? await readKeyFresh<UniExam>("uniExams") : await readKey<UniExam>("uniExams");
  return rows.filter((r) => r.status !== "deleted");
}
export async function liveUniExams(): Promise<UniExam[]> {
  return (await readUniExams())
    .filter((r) => r.status === "live" && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}
export async function readUploads(): Promise<UploadRec[]> {
  return readKey<UploadRec>("uploads");
}

export function examStart(e: Pick<UniExam, "date" | "start">): Date {
  return bkkDate(e.date, e.start || "08:00");
}
export async function nextUniExam(now = Date.now()): Promise<UniExam | null> {
  return (await liveUniExams()).find((e) => examStart(e).getTime() > now - 3 * 3600_000) ?? null;
}

// ── เขียน ──────────────────────────────────────────────────────────────────
type SchedInput = Partial<ScheduleItem>;
function schedRecord(s: SchedInput): Record<string, string> {
  return {
    id: s.id || newId("SC"),
    block: s.block ?? "",
    date: s.date ?? "",
    start: s.start ?? "",
    end: s.end ?? "",
    subject: s.subject ?? "",
    topic: s.topic ?? "",
    lecturer: s.lecturer ?? "",
    building: s.building ?? "",
    room: s.room ?? "",
    kind: s.kind || "lecture",
    note: s.note ?? "",
    status: s.status || "draft",
    upload_id: s.upload_id ?? "",
    updated_at: nowISO(),
  };
}
function examRecord(e: Partial<UniExam>): Record<string, string> {
  return {
    id: e.id || newId("UX"),
    name: e.name ?? "",
    date: e.date ?? "",
    start: e.start ?? "",
    end: e.end ?? "",
    building: e.building ?? "",
    room: e.room ?? "",
    block: e.block ?? "",
    note: e.note ?? "",
    status: e.status || "live",
    updated_at: nowISO(),
  };
}

export async function addScheduleItems(items: SchedInput[]): Promise<number> {
  await appendRecords("schedule", items.map(schedRecord));
  return items.length;
}
export async function addUniExams(items: Partial<UniExam>[]): Promise<number> {
  await appendRecords("uniExams", items.map(examRecord));
  return items.length;
}

// บันทึกหลายแถวที่แก้ในตาราง (1 request) — rows ต้องมี id
async function saveRows<T extends { id: string }>(
  key: "schedule" | "uniExams",
  rows: Partial<T>[],
  toRecord: (x: Partial<T>) => Record<string, string>
): Promise<number> {
  const current = await readKeyFresh<T & { __row: number }>(key);
  const byId = new Map(current.map((r) => [r.id, r]));
  const headers = HEADERS[key];
  const lastCol = colLetter(headers.length);
  const updates: { range: string; values: string[][] }[] = [];
  const creates: Record<string, string>[] = [];
  for (const r of rows) {
    const cur = r.id ? byId.get(r.id) : undefined;
    const rec = toRecord({ ...(cur ?? {}), ...r } as Partial<T>);
    if (cur?.__row) updates.push({ range: `'${TABS[key]}'!A${cur.__row}:${lastCol}${cur.__row}`, values: [headers.map((h) => rec[h] ?? "")] });
    else creates.push(rec);
  }
  await batchUpdateRanges(updates);
  if (creates.length) await appendRecords(key, creates);
  bust("bc");
  return updates.length + creates.length;
}
export async function saveScheduleRows(rows: SchedInput[]): Promise<number> {
  return saveRows<ScheduleItem>("schedule", rows, schedRecord);
}
export async function saveUniExamRows(rows: Partial<UniExam>[]): Promise<number> {
  return saveRows<UniExam>("uniExams", rows, examRecord);
}

// เผยแพร่ทุกแถว draft ของไฟล์ที่อัปโหลด
export async function publishUpload(uploadId: string): Promise<number> {
  const rows = (await readSchedule(true)).filter((r) => r.upload_id === uploadId && r.status === "draft");
  const n = await saveScheduleRows(rows.map((r) => ({ id: r.id, status: "live" })));
  const exams = (await readUniExams(true)).filter((e) => e.note.includes(`[upload:${uploadId}]`) && e.status === "draft");
  await saveUniExamRows(exams.map((e) => ({ id: e.id, status: "live" })));
  const up = (await readKeyFresh<UploadRec>("uploads")).find((u) => u.id === uploadId);
  if (up?.__row) await patchRecord("uploads", up.__row, up as never, { status: "published" });
  return n;
}

// ── AI: ถอดตารางจากไฟล์ (PDF/รูป/ข้อความ CSV) ────────────────────────────────
const SessionZ = z.object({
  date: z.string().default(""),
  start: z.string().default(""),
  end: z.string().default(""),
  subject: z.string().default(""),
  topic: z.string().default(""),
  lecturer: z.string().default(""),
  building: z.string().default(""),
  room: z.string().default(""),
  kind: z.string().default("lecture"),
  note: z.string().default(""),
});
const ExamZ = z.object({
  name: z.string().default(""),
  date: z.string().default(""),
  start: z.string().default(""),
  end: z.string().default(""),
  building: z.string().default(""),
  room: z.string().default(""),
  note: z.string().default(""),
});
const ParseZ = z.object({
  block_name: z.string().default(""),
  sessions: z.array(SessionZ).default([]),
  exams: z.array(ExamZ).default([]),
  warnings: z.array(z.string()).default([]),
});
export type ParsedTimetable = z.infer<typeof ParseZ>;

const PARSE_SYSTEM = `คุณคือผู้ช่วยถอด "ตารางเรียน" ของนักศึกษาแพทย์ชั้นปีที่ 2 (รุ่น BM33 วชิรพยาบาล) จากไฟล์ให้เป็นข้อมูลโครงสร้าง
- sessions: ทุกคาบเรียนในไฟล์ 1 คาบ = 1 รายการ (อย่ารวมหลายวัน/หลายคาบเป็นรายการเดียว)
  · date = YYYY-MM-DD (ค.ศ.) — ถ้าไฟล์ใช้ พ.ศ. ให้ลบ 543; ถ้าไม่มีปี เดาจากช่วงเวลาปัจจุบัน
  · start/end = HH:mm (24 ชม.)
  · subject = ชื่อรายวิชา/หัวข้อหลัก, topic = หัวข้อย่อย/ชื่อ lecture
  · lecturer = ชื่ออาจารย์ (ถ้ามี), building = อาคาร, room = ห้อง
  · kind = lecture | lab | exam | activity | other
- exams: การสอบของมหาวิทยาลัย (สอบกลางภาค/ปลายภาค/สอบ block/สอบย่อยที่ระบุในไฟล์) พร้อมวันเวลาและสถานที่
- block_name: ชื่อ block/รายวิชาของไฟล์นี้
- warnings: สิ่งที่อ่านไม่ชัด/ไม่แน่ใจ (ภาษาไทยสั้น ๆ)
ห้ามแต่งข้อมูลที่ไม่มีในไฟล์ ถ้าช่องไหนไม่มีให้เว้นว่าง`;

const PARSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    block_name: { type: Type.STRING },
    sessions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING }, start: { type: Type.STRING }, end: { type: Type.STRING },
          subject: { type: Type.STRING }, topic: { type: Type.STRING }, lecturer: { type: Type.STRING },
          building: { type: Type.STRING }, room: { type: Type.STRING }, kind: { type: Type.STRING }, note: { type: Type.STRING },
        },
        required: ["date", "start", "subject"],
      },
    },
    exams: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING }, date: { type: Type.STRING }, start: { type: Type.STRING }, end: { type: Type.STRING },
          building: { type: Type.STRING }, room: { type: Type.STRING }, note: { type: Type.STRING },
        },
        required: ["name", "date"],
      },
    },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["sessions", "exams"],
};

const hhmm = (s: string) => {
  const m = String(s ?? "").match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};
const ymd = (s: string) => {
  const m = String(s ?? "").match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return "";
  let y = +m[1];
  if (y > 2400) y -= 543;
  return `${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
};

export async function parseTimetable(parts: Part[], hint: { block?: string; text?: string } = {}): Promise<ParsedTimetable> {
  const { data } = await generateJSON(
    PARSE_SYSTEM,
    `ตอนนี้: ${nowContextTh()}\nชื่อ block ที่แอดมินระบุ: ${hint.block || "-"}\n${hint.text ? `<ข้อมูลตาราง>\n${hint.text.slice(0, 120_000)}\n</ข้อมูลตาราง>` : "ไฟล์แนบด้านล่าง"}`,
    PARSE_SCHEMA,
    ParseZ as unknown as z.ZodType<ParsedTimetable>,
    { timeoutMs: 52_000, temperature: 0.2, thinking: "LOW", maxOutputTokens: 32_000, extraParts: parts }
  );
  if (!data) throw new Error("อ่านตารางจากไฟล์ไม่สำเร็จ ลองไฟล์ที่ชัดขึ้นหรือแยกเป็นหลายไฟล์");
  data.sessions = data.sessions
    .map((s) => ({ ...s, date: ymd(s.date), start: hhmm(s.start), end: hhmm(s.end), kind: (KINDS as readonly string[]).includes(s.kind) ? s.kind : "lecture" }))
    .filter((s) => s.date && (s.subject || s.topic));
  data.exams = data.exams.map((e) => ({ ...e, date: ymd(e.date), start: hhmm(e.start), end: hhmm(e.end) })).filter((e) => e.date && e.name);
  return data;
}

// บันทึกผลการถอดเป็น draft (ต้องกดเผยแพร่ก่อนเพื่อน ๆ ถึงจะเห็น)
export async function saveParsedUpload(opts: { filename: string; mime: string; block: string; parsed: ParsedTimetable }): Promise<string> {
  const id = newId("UP");
  const block = opts.block || opts.parsed.block_name || opts.filename;
  await addScheduleItems(opts.parsed.sessions.map((s) => ({ ...s, block, status: "draft", upload_id: id })));
  if (opts.parsed.exams.length) {
    await addUniExams(opts.parsed.exams.map((e) => ({ ...e, block, status: "draft", note: `${e.note} [upload:${id}]`.trim() })));
  }
  await appendRecord("uploads", {
    id, filename: opts.filename, mime: opts.mime, block, status: "parsed",
    summary: `${opts.parsed.sessions.length} คาบ · ${opts.parsed.exams.length} สอบ${opts.parsed.warnings.length ? ` · ⚠️ ${opts.parsed.warnings.join(" / ")}` : ""}`.slice(0, 1000),
    created_at: nowISO(), note: "",
  });
  return id;
}

// วันนี้/พรุ่งนี้ของตาราง (ใช้ในหน้าแรก + สรุปประจำวัน)
export async function scheduleForDay(dayKey = bkkDayKey()): Promise<ScheduleItem[]> {
  return (await liveSchedule()).filter((s) => s.date === dayKey);
}
