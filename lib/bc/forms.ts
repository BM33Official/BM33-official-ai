// ทะเบียนฟอร์มที่ติดตาม (BC_forms) + เพิ่มฟอร์มใหม่จากลิงก์ response sheet
import { readKey, readKeyFresh, appendRecord, patchRecord, nowISO } from "@/lib/bc/sheets";
import { getForeignTitles, parseSheetId } from "@/lib/google-sheets";
import { FormDef } from "@/lib/bc/types";

export async function readForms(force = false): Promise<FormDef[]> {
  const rows = force ? await readKeyFresh<FormDef>("forms") : await readKey<FormDef>("forms");
  return rows.filter((f) => f.status !== "deleted");
}

export async function getForm(formId: string): Promise<FormDef | null> {
  return (await readForms()).find((f) => f.form_id === formId) ?? null;
}

// ตรวจลิงก์ response sheet -> คืน sheetId + รายชื่อแท็บ (ให้ผู้ใช้เลือก id_column)
export async function inspectResponseSheet(
  link: string
): Promise<{ sheetId: string; tabs: string[] } | { error: string }> {
  const sheetId = parseSheetId(link);
  if (!sheetId) return { error: "ลิงก์ไม่ถูกต้อง — วางลิงก์ Google Sheet ของ response" };
  try {
    const tabs = await getForeignTitles(sheetId);
    return { sheetId, tabs };
  } catch {
    return { error: "อ่านชีตไม่ได้ — ตรวจว่าแชร์ให้ service account เป็น Viewer/Editor แล้ว" };
  }
}

export async function addForm(input: {
  name: string;
  type: string;
  response_sheet_id: string;
  response_tab: string;
  id_column: string;
  done_condition: string;
  access: "auto" | "manual";
  deadline_at?: string;
  link?: string;
  description?: string;
  source?: string;
  announcement_id?: string;
}): Promise<string> {
  const form_id = `F-${Date.now().toString(36).toUpperCase()}`;
  await appendRecord("forms", { form_id, ...input, created_at: nowISO(), status: "open" });
  return form_id;
}

export async function updateForm(form: FormDef, patch: Partial<FormDef>): Promise<void> {
  const latest = (await readForms(true)).find((f) => f.form_id === form.form_id);
  if (!latest?.__row) return;
  // จำเวลาปิด (แอปโชว์ "ปิดแล้ว" ต่ออีก 1 วัน แล้วซ่อน) · เปิดใหม่ = ล้าง
  if (patch.status === "closed" && latest.status !== "closed" && !patch.closed_at) patch = { ...patch, closed_at: new Date().toISOString() };
  if (patch.status && patch.status !== "closed" && latest.closed_at) patch = { ...patch, closed_at: "" };
  await patchRecord("forms", latest.__row, latest as never, patch as Record<string, string>);
}


// ── สิ่งที่ต้องกรอก "อัตโนมัติ": ประกาศที่มีลิงก์ฟอร์ม -> สร้างรายการให้เลย (แอดมินแค่ตรวจ/แก้) ──
export const FORM_URL = /(forms\.gle\/|docs\.google\.com\/forms\/|forms\.office\.com|form\.jotform|typeform\.com)/i;

export async function syncFormFromAnnouncement(a: { id: string; title: string; summary: string; deadline_at: string; links: { label: string; url: string }[]; status?: string }): Promise<string | null> {
  const link = a.links.find((l) => FORM_URL.test(l.url))?.url;
  if (!link) return null;
  const forms = await readForms(true);
  const existing = forms.find((f) => f.announcement_id === a.id || (f.link && f.link === link));
  if (existing) {
    // ประกาศถูกแก้เดดไลน์/ซ่อน -> ตามไปด้วย (เฉพาะรายการที่ระบบสร้าง)
    if (existing.source === "auto") {
      const patch: Partial<FormDef> = {};
      if (a.deadline_at && a.deadline_at !== existing.deadline_at) patch.deadline_at = a.deadline_at;
      if (a.status && ["hidden", "deleted"].includes(a.status) && existing.status !== "deleted") patch.status = "deleted";
      if (Object.keys(patch).length) await updateForm(existing, patch);
    }
    return existing.form_id;
  }
  if (a.status && a.status !== "live") return null;
  return addForm({
    name: a.title.slice(0, 80), type: "form", response_sheet_id: "", response_tab: "", id_column: "", done_condition: "",
    access: "manual", deadline_at: a.deadline_at, link, description: a.summary.slice(0, 300), source: "auto", announcement_id: a.id,
  });
}

// ── ปิดแล้ว = โชว์ต่ออีก 1 วัน แล้วซ่อนจากแอปทั้งหมด (ประกาศไม่รก) ─────────────────
export const CLOSED_GRACE_MS = 86_400_000;
// เวลาที่ฟอร์ม "จบ" (ปิดเอง หรือเลยเดดไลน์) · null = ยังเปิดอยู่ · 0 = จบนานแล้ว (ปิดก่อนมีการจำเวลา/ลบ)
export function formEndedAt(f: Pick<FormDef, "status" | "deadline_at" | "closed_at">, now = Date.now()): number | null {
  if (f.status === "deleted") return 0;
  const dl = f.deadline_at ? new Date(f.deadline_at).getTime() : NaN;
  if (f.status === "closed") {
    const c = f.closed_at ? new Date(f.closed_at).getTime() : NaN;
    return !isNaN(c) ? (!isNaN(dl) ? Math.min(c, dl) : c) : !isNaN(dl) && dl < now ? dl : 0;
  }
  return !isNaN(dl) && dl < now ? dl : null;
}
export function formVisible(f: Pick<FormDef, "status" | "deadline_at" | "closed_at">, now = Date.now()): boolean {
  const end = formEndedAt(f, now);
  return end === null || now - end < CLOSED_GRACE_MS;
}
// ประกาศ: เลยเดดไลน์ หรือฟอร์มที่ผูกไว้ปิดไปแล้ว > 1 วัน -> ซ่อน
export function announcementVisible(a: { id: string; deadline_at: string; form_id: string }, forms: FormDef[], now = Date.now()): boolean {
  const dl = a.deadline_at ? new Date(a.deadline_at).getTime() : NaN;
  if (!isNaN(dl) && now - dl >= CLOSED_GRACE_MS) return false;
  // ฟอร์มที่ถูกลบ (เช่น ไม่ใช่งานจริง) ไม่ทำให้ประกาศหาย — ดูเฉพาะที่ปิด/เลยเดดไลน์
  const f = forms.find((x) => x.status !== "deleted" && ((a.form_id && x.form_id === a.form_id) || (x.announcement_id && x.announcement_id === a.id)));
  return !f || formVisible(f, now);
}
