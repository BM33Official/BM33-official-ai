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
