// ทะเบียนฟอร์มที่ติดตาม (BC_forms) + เพิ่มฟอร์มใหม่จากลิงก์ response sheet
import { readTab, appendRecord, patchRecord, nowISO } from "@/lib/bc/sheets";
import { getForeignTitles, parseSheetId } from "@/lib/google-sheets";
import { TABS, FormDef } from "@/lib/bc/types";

export async function readForms(): Promise<FormDef[]> {
  return readTab<FormDef>(TABS.forms);
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
}): Promise<string> {
  const form_id = `F-${Date.now().toString(36).toUpperCase()}`;
  await appendRecord("forms", { form_id, ...input, created_at: nowISO() });
  return form_id;
}

export async function updateForm(form: FormDef, patch: Partial<FormDef>): Promise<void> {
  if (!form.__row) return;
  await patchRecord("forms", form.__row, form as never, patch as Record<string, string>);
}
