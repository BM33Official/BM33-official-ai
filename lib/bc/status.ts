// เครื่องมือสถานะ — ใครทำ/ยังไม่ทำ ต่อฟอร์ม โดย join บน student id
// รวม 3 แหล่ง: (1) response sheet จริง (auto) (2) overlay BC_status (claimed/confirmed/manual)
import { readTab, appendRecord, patchRecord, nowISO } from "@/lib/bc/sheets";
import { readForeignTable } from "@/lib/google-sheets";
import { TABS, FormDef, Member, StatusOverlay, StatusState } from "@/lib/bc/types";
import { verifiedMembers } from "@/lib/bc/members";

const digits = (s: string) => String(s ?? "").replace(/\D/g, "");

// อ่าน overlay ทั้งหมด (cache สั้น)
let _ovCache: { rows: StatusOverlay[]; at: number } | null = null;
export async function readOverlay(force = false): Promise<StatusOverlay[]> {
  if (!force && _ovCache && Date.now() - _ovCache.at < 15_000) return _ovCache.rows;
  const rows = await readTab<StatusOverlay>(TABS.status);
  _ovCache = { rows, at: Date.now() };
  return rows;
}

// อ่าน student id ที่ "ทำแล้ว" จาก response sheet จริง (เฉพาะ auto forms)
export async function autoDoneSet(form: FormDef): Promise<Set<string>> {
  const done = new Set<string>();
  if (form.access !== "auto" || !form.response_sheet_id || !form.response_tab) return done;
  let rows;
  try {
    rows = await readForeignTable(form.response_sheet_id, form.response_tab);
  } catch {
    return done; // อ่านไม่ได้ -> ถือว่าไม่มีใครทำ (จะ fallback ไป claim/manual)
  }
  // done_condition: "" = มีแถว=ทำแล้ว | "Header=Value" | "Header" (คอลัมน์ไม่ว่าง)
  const cond = form.done_condition?.trim() ?? "";
  const [condCol, condVal] = cond.includes("=") ? cond.split("=").map((s) => s.trim()) : [cond, ""];
  for (const r of rows) {
    const sid = digits(String(r[form.id_column] ?? ""));
    if (!sid) continue;
    let ok = true;
    if (condCol) {
      const cell = String(r[condCol] ?? "").trim();
      ok = condVal ? cell === condVal : cell.length > 0;
    }
    if (ok) done.add(sid);
  }
  return done;
}

export interface MemberFormState {
  member: Member;
  state: StatusState; // done | claimed | none
}

// สถานะรายสมาชิกสำหรับ 1 ฟอร์ม
export async function statusForForm(form: FormDef): Promise<MemberFormState[]> {
  const [members, overlay, doneSet] = await Promise.all([
    verifiedMembers(), readOverlay(), autoDoneSet(form),
  ]);
  const ov = new Map<string, StatusOverlay>();
  for (const o of overlay) if (o.form_id === form.form_id) ov.set(digits(o.student_id), o);

  return members.map((member) => {
    const sid = digits(member.matched_student_id);
    const o = ov.get(sid);
    let state: StatusState = "none";
    if (doneSet.has(sid) || o?.state === "confirmed" || o?.state === "done") state = "done";
    else if (o?.state === "claimed") state = "claimed";
    return { member, state };
  });
}

// ผู้รับสำหรับ segment: form ("" = ทุกคน) + condition (undone|done|all)
export async function segmentRecipients(
  formId: string,
  condition: string
): Promise<Member[]> {
  if (!formId) return verifiedMembers(); // broadcast ทั่วไป
  const { getForm } = await import("@/lib/bc/forms");
  const form = await getForm(formId);
  if (!form) return [];
  const rows = await statusForForm(form);
  const cond = condition || "undone";
  if (cond === "all") return rows.map((r) => r.member);
  if (cond === "done") return rows.filter((r) => r.state === "done").map((r) => r.member);
  return rows.filter((r) => r.state !== "done").map((r) => r.member); // undone
}

// เขียน overlay (upsert ตาม student+form)
export async function setStatus(
  studentId: string,
  formId: string,
  state: StatusState,
  source: string,
  note = ""
): Promise<void> {
  const overlay = await readOverlay(true);
  const sid = digits(studentId);
  const existing = overlay.find((o) => digits(o.student_id) === sid && o.form_id === formId);
  const rec = { student_id: studentId, form_id: formId, state, source, updated_at: nowISO(), note };
  if (existing?.__row) await patchRecord("status", existing.__row, existing as never, rec);
  else await appendRecord("status", rec);
  _ovCache = null;
}

// สรุปนับ done/undone ของฟอร์ม
export async function summarize(form: FormDef): Promise<{ total: number; done: number; undone: number; claimed: number }> {
  const rows = await statusForForm(form);
  const done = rows.filter((r) => r.state === "done").length;
  const claimed = rows.filter((r) => r.state === "claimed").length;
  return { total: rows.length, done, undone: rows.length - done, claimed };
}
