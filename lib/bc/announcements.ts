// ประกาศบนแอปสมาชิก (BC_announcements)
// ที่มา: ข้อความกรรมการในกลุ่ม (อัตโนมัติ) / กรรมการส่ง "ประกาศ ..." มาทาง DM / แอดมินวางในหน้าเว็บ
// AI แยก: หัวข้อ สรุปสั้น หมวด เดดไลน์ วันงาน สถานที่ ลิงก์ — ต้นฉบับเก็บครบใน body เสมอ
import { z } from "zod";
import { readKey, readKeyFresh, appendRecord, patchRecord, nowISO, newId } from "@/lib/bc/sheets";
import { Announcement, LinkItem } from "@/lib/bc/types";
import { generateJSON, Type } from "@/lib/gemini";
import { nowContextTh, normalizeISO, bkkParts } from "@/lib/time";
import { log } from "@/lib/logger";

export const CATEGORIES = ["ทั่วไป", "การเงิน", "วิชาการ", "กิจกรรม", "ฟอร์ม/เอกสาร", "ด่วน"] as const;

export function parseLinks(s: string): LinkItem[] {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.url === "string").map((x) => ({ label: String(x.label || "เปิดลิงก์"), url: String(x.url) })) : [];
  } catch {
    return [];
  }
}

export function extractUrls(text: string): string[] {
  return Array.from(new Set((text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? []).map((u) => u.replace(/[.,;!?]+$/, ""))));
}

export async function readAnnouncements(force = false): Promise<Announcement[]> {
  const rows = force ? await readKeyFresh<Announcement>("announcements") : await readKey<Announcement>("announcements");
  return rows.filter((a) => a.status !== "deleted");
}

export async function liveAnnouncements(): Promise<Announcement[]> {
  return (await readAnnouncements())
    .filter((a) => a.status === "live")
    .sort((a, b) => Number(b.pinned === "1") - Number(a.pinned === "1") || (b.created_at || "").localeCompare(a.created_at || ""));
}

export async function getAnnouncement(id: string, force = false): Promise<Announcement | null> {
  return (await readAnnouncements(force)).find((a) => a.id === id) ?? null;
}

export async function createAnnouncement(input: Partial<Announcement>, opts: { autoForm?: boolean } = {}): Promise<string> {
  const id = input.id || newId("AN");
  await appendRecord("announcements", {
    id,
    title: input.title ?? "",
    summary: input.summary ?? "",
    body: input.body ?? "",
    author: input.author ?? "",
    author_role: input.author_role ?? "",
    category: input.category ?? "ทั่วไป",
    deadline_at: input.deadline_at ?? "",
    event_at: input.event_at ?? "",
    location: input.location ?? "",
    links: input.links ?? "[]",
    source: input.source ?? "manual",
    source_ref: input.source_ref ?? "",
    status: input.status ?? "live",
    pinned: input.pinned ?? "",
    created_at: input.created_at ?? nowISO(),
    updated_at: nowISO(),
    reminders: input.reminders ?? "{}",
    form_id: input.form_id ?? "",
  });
  if (opts.autoForm !== false && !input.form_id) {
    const fid = await syncForm({ id, title: input.title ?? "", summary: input.summary ?? "", deadline_at: input.deadline_at ?? "", links: input.links ?? "[]", status: input.status ?? "live" });
    // ผูกประกาศกับรายการ "สิ่งที่ต้องกรอก" -> ข้อความเตือนส่งเฉพาะคนที่ยังไม่กรอก
    if (fid) { const a = await getAnnouncement(id, true); if (a?.__row) await patchRecord("announcements", a.__row, a as never, { form_id: fid }); }
  }
  return id;
}

// ประกาศที่มีลิงก์ฟอร์ม -> "สิ่งที่ต้องกรอก" อัตโนมัติ
async function syncForm(a: { id: string; title: string; summary: string; deadline_at: string; links: string; status: string }): Promise<string | null> {
  try {
    const { syncFormFromAnnouncement } = await import("@/lib/bc/forms");
    return await syncFormFromAnnouncement({ ...a, links: parseLinks(a.links) });
  } catch { return null; /* ไม่ให้การสร้างประกาศล้มเพราะเรื่องนี้ */ }
}

export async function updateAnnouncement(id: string, patch: Partial<Announcement>): Promise<boolean> {
  const a = await getAnnouncement(id, true);
  if (!a?.__row) return false;
  await patchRecord("announcements", a.__row, a as never, { ...(patch as Record<string, string>), updated_at: nowISO() });
  const n = { ...a, ...patch };
  await syncForm({ id: n.id, title: n.title, summary: n.summary, deadline_at: n.deadline_at, links: n.links, status: n.status });
  return true;
}

// ── AI: ถอดข้อความเป็นประกาศ ──────────────────────────────────────────────────
const ParsedSchema = z.object({
  is_announcement: z.boolean(),
  title: z.string().default(""),
  summary: z.string().default(""),
  category: z.string().default("ทั่วไป"),
  deadline: z.string().default(""),
  event_time: z.string().default(""),
  location: z.string().default(""),
  links: z.array(z.object({ label: z.string().default(""), url: z.string().default("") })).default([]),
  // ใครต้องทำ: all = ทุกคนต้องกรอก/ทำ · some = เฉพาะบางคน (มีรายชื่อ) · optional = ใครสนใจ · none = แค่แจ้งข่าว
  required_for: z.enum(["all", "some", "optional", "none"]).catch("optional").default("optional"),
});
export type ParsedAnnouncement = z.infer<typeof ParsedSchema>;

const PARSE_SYSTEM = `คุณคือบรรณาธิการประกาศของรุ่น BM33 (นักศึกษาแพทย์ วชิรพยาบาล)
หน้าที่: อ่านข้อความจากกรรมการรุ่น แล้วตัดสินว่าเป็น "ประกาศ/เรื่องที่ทุกคนต้องรู้หรือต้องทำ" หรือไม่ ถ้าใช่ ให้ถอดเป็นข้อมูลโครงสร้าง
- is_announcement=false สำหรับ: คุยเล่น ตอบกลับสั้น ๆ ถามคำถาม อีโมจิ ข้อความส่วนตัว
- title: หัวข้อสั้น ≤ 40 ตัวอักษร ชัดเจน (ไม่มีอีโมจิเกิน 1 ตัว)
- summary: สรุป 1–2 ประโยค เข้าใจได้ทันทีว่า "ต้องทำอะไร ภายในเมื่อไร" คงตัวเลข/จำนวนเงินให้ครบ
- category: เลือกจาก ${["ทั่วไป", "การเงิน", "วิชาการ", "กิจกรรม", "ฟอร์ม/เอกสาร", "ด่วน"].join(" / ")}
- deadline: เวลาปิด/วันสุดท้ายที่ต้องทำ เป็น ISO 8601 พร้อม +07:00 (ถ้าไม่ระบุเวลา ใช้ 23:59) ไม่มีให้ ""
- event_time: วันเวลางาน/นัดหมาย/สอบ เป็น ISO 8601 +07:00 ไม่มีให้ ""
- ปีในข้อความอาจเป็น พ.ศ. (2569 = 2026) หรือไม่ระบุปี -> ใช้ปีที่ใกล้วันนี้ที่สุดในอนาคต
- location: สถานที่ถ้ามี
- required_for: all = ขอให้ "ทุกคน" กรอก/ทำ (เช่น ฟอร์มที่ต้องกรอกทุกคน ประเมิน ลงชื่อ) · some = เฉพาะบางคนที่มีรายชื่อ/เลขที่ · optional = รับสมัคร/ชวน/ขายของ ใครสนใจ · none = แจ้งข่าวอย่างเดียว
- links: ทุกลิงก์ในข้อความ พร้อม label ภาษาไทยสั้น ≤ 18 ตัวอักษร บอกว่ากดแล้วไปทำอะไร (เช่น "กรอกฟอร์ม", "ดูรายละเอียด")
ห้ามแต่งข้อมูลที่ไม่มีในข้อความ`;

const PARSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    is_announcement: { type: Type.BOOLEAN },
    title: { type: Type.STRING },
    summary: { type: Type.STRING },
    category: { type: Type.STRING },
    deadline: { type: Type.STRING },
    event_time: { type: Type.STRING },
    location: { type: Type.STRING },
    links: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, url: { type: Type.STRING } } },
    },
    required_for: { type: Type.STRING, enum: ["all", "some", "optional", "none"] },
  },
  required: ["is_announcement", "title", "summary", "category", "deadline", "event_time", "links", "required_for"],
};

// เดดไลน์ที่ไม่ได้ระบุเวลา -> 23:59 น. ของวันนั้น
export function deadlineISO(v: string): string {
  const iso = normalizeISO(v);
  if (!iso) return "";
  const p = bkkParts(iso);
  if (p.hh === 0 && p.mm === 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim())) {
    return new Date(new Date(iso).getTime() + (23 * 60 + 59) * 60_000).toISOString();
  }
  return iso;
}

export async function parseAnnouncement(text: string, author = ""): Promise<ParsedAnnouncement | null> {
  try {
    const { data } = await generateJSON(
      PARSE_SYSTEM,
      `ตอนนี้: ${nowContextTh()}\nผู้ส่ง: ${author || "-"}\n<ข้อความ>\n${text.slice(0, 6000)}\n</ข้อความ>`,
      PARSE_SCHEMA,
      ParsedSchema as unknown as z.ZodType<ParsedAnnouncement>,
      { timeoutMs: 25_000, temperature: 0.3, thinking: "LOW", maxOutputTokens: 2500, feature: "announce" }
    );
    if (!data) return null;
    // ลิงก์: ยึดจาก regex เป็นหลัก (AI อาจตกหล่น) แล้วใช้ label จาก AI ถ้ามี
    const urls = extractUrls(text);
    const byUrl = new Map(data.links.filter((l) => l.url).map((l) => [l.url.replace(/[.,;!?]+$/, ""), l.label]));
    data.links = urls.map((u, i) => ({ url: u, label: (byUrl.get(u) || (urls.length > 1 ? `ลิงก์ ${i + 1}` : "เปิดลิงก์")).slice(0, 20) }));
    data.deadline = deadlineISO(data.deadline);
    data.event_time = normalizeISO(data.event_time);
    if (!(["ทั่วไป", "การเงิน", "วิชาการ", "กิจกรรม", "ฟอร์ม/เอกสาร", "ด่วน"] as string[]).includes(data.category)) data.category = "ทั่วไป";
    return data;
  } catch (err) {
    log.warn("announcement_parse_failed", { message: String(err).slice(0, 200) });
    return null;
  }
}

// ถอด + สร้างประกาศ (คืน id หรือ null ถ้าไม่ใช่ประกาศ)
export async function announcementFromText(opts: {
  text: string; author: string; authorRole: string; source: string; sourceRef?: string; status?: string; force?: boolean;
}): Promise<{ id: string; parsed: ParsedAnnouncement } | null> {
  const text = opts.text.trim();
  if (text.length < 12 && !opts.force) return null;
  // กันซ้ำ: message id เดียวกันสร้างครั้งเดียว
  if (opts.sourceRef) {
    const dup = (await readAnnouncements()).find((a) => a.source_ref === opts.sourceRef);
    if (dup) return null;
  }
  const parsed = await parseAnnouncement(text, opts.author);
  if (!parsed) {
    if (!opts.force) return null;
  } else if (!parsed.is_announcement && !opts.force) {
    return null;
  }
  const p = parsed ?? {
    is_announcement: true, required_for: "optional" as const, title: text.split("\n")[0].slice(0, 40), summary: text.slice(0, 120),
    category: "ทั่วไป", deadline: "", event_time: "", location: "", links: extractUrls(text).map((u) => ({ url: u, label: "เปิดลิงก์" })),
  };
  const id = await createAnnouncement({
    title: p.title || text.split("\n")[0].slice(0, 40),
    summary: p.summary,
    body: text,
    author: opts.author,
    author_role: opts.authorRole,
    category: p.category,
    deadline_at: p.deadline,
    event_at: p.event_time,
    location: p.location,
    links: JSON.stringify(p.links),
    source: opts.source,
    source_ref: opts.sourceRef ?? "",
    status: opts.status ?? "live",
  }, { autoForm: p.required_for === "all" || p.required_for === "some" });
  return { id, parsed: p };
}
