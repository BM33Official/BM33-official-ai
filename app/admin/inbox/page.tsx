import { requireAuth } from "@/lib/bc/auth";
import { ensureBcTabs } from "@/lib/bc/sheets";
import { readMembers } from "@/lib/bc/members";
import { readForms } from "@/lib/bc/forms";
import { readOverlay } from "@/lib/bc/status";
import { readRoster } from "@/lib/bc/roster";
import ConfirmButtons from "../ui/ConfirmButtons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const digits = (s: string) => String(s ?? "").replace(/\D/g, "");

export default async function Inbox() {
  requireAuth();
  await ensureBcTabs();
  const [members, forms, overlay, roster] = await Promise.all([
    readMembers(true), readForms(), readOverlay(true), readRoster(),
  ]);
  const nameById = new Map(roster.map((r) => [digits(r.student_id), r.full_name]));
  const formById = new Map(forms.map((f) => [f.form_id, f.name]));

  const claims = overlay.filter((o) => o.state === "claimed");
  const mismatches = members.filter((m) => m.onboarding_state === "mismatch");

  return (
    <div className="wrap">
      <h1>กล่องรอตรวจ</h1>
      <p className="sub">รายการที่สมาชิกกด &quot;ทำแล้ว&quot; แต่ระบบยังตรวจไม่พบ — ยืนยันหรือปฏิเสธได้เลย</p>

      <h2>รอยืนยัน ({claims.length})</h2>
      <div className="card tablecard">
        {claims.length === 0 ? <p className="sub" style={{ margin: 0 }}>ไม่มีรายการรอตรวจ 🎉</p> : (
          <table>
            <thead><tr><th>นักศึกษา</th><th>รหัส</th><th>รายการ</th><th>หมายเหตุ</th><th>เมื่อ</th><th></th></tr></thead>
            <tbody>
              {claims.map((c, i) => (
                <tr key={i}>
                  <td><b>{nameById.get(digits(c.student_id)) || "-"}</b></td>
                  <td>{c.student_id}</td>
                  <td>{formById.get(c.form_id) || c.form_id}</td>
                  <td className="hint">{c.note}</td>
                  <td className="hint">{c.updated_at?.slice(0, 16).replace("T", " ")}</td>
                  <td><ConfirmButtons studentId={c.student_id} formId={c.form_id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mismatches.length > 0 && (
        <>
          <h2>ลงทะเบียนไม่ตรง ({mismatches.length})</h2>
          <div className="card tablecard">
            <table>
              <thead><tr><th>ชื่อ LINE</th><th>ชื่อที่แจ้ง</th><th>3 ตัวท้าย</th></tr></thead>
              <tbody>
                {mismatches.map((m) => (
                  <tr key={m.line_user_id}><td>{m.display_name}</td><td>{m.claimed_name}</td><td>…{m.last3}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="hint" style={{ marginTop: 10 }}>เพื่อนกลุ่มนี้กรอกชื่อ/รหัสไม่ตรงทะเบียน — ทักไปช่วยยืนยันได้</p>
          </div>
        </>
      )}
    </div>
  );
}
