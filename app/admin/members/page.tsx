import { requireAuth } from "@/lib/bc/auth";
import { ensureBcTabs } from "@/lib/bc/sheets";
import { readMembers } from "@/lib/bc/members";
import { readRoster } from "@/lib/bc/roster";
import { bkkDate } from "@/lib/bc/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusBadge(s: string) {
  if (s === "verified") return <span className="badge b-ok">ยืนยันแล้ว</span>;
  if (s === "mismatch") return <span className="badge b-danger">ไม่ตรง</span>;
  return <span className="badge b-warn">ยังไม่ยืนยัน</span>;
}

export default async function Members() {
  requireAuth();
  await ensureBcTabs();
  const [members, roster] = await Promise.all([readMembers(true), readRoster()]);
  const nameById = new Map(roster.map((r) => [String(r.student_id).replace(/\D/g, ""), r.full_name]));

  return (
    <div className="wrap">
      <h1>สมาชิก</h1>
      <p className="sub">คนที่แอดไลน์และลงทะเบียนแล้ว — จับคู่กับทะเบียนรุ่น {roster.length} คน</p>
      <div className="card tablecard">
        {members.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>ยังไม่มีสมาชิกลงทะเบียน (ให้เพื่อนแอดไลน์ OA แล้วพิมพ์ชื่อ + 3 ตัวท้ายรหัส)</p>
        ) : (
          <table>
            <thead><tr><th>ชื่อ LINE</th><th>ชื่อที่แจ้ง</th><th>รหัส นศ.</th><th>ชื่อในทะเบียน</th><th>สถานะ</th><th>ลงทะเบียนเมื่อ</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.line_user_id}>
                  <td>{m.display_name || "-"}</td>
                  <td>{m.claimed_name || "-"}</td>
                  <td>{m.matched_student_id || (m.last3 ? `…${m.last3}` : "-")}</td>
                  <td>{nameById.get(String(m.matched_student_id).replace(/\D/g, "")) || "-"}</td>
                  <td>{statusBadge(m.status)}</td>
                  <td>{m.onboarded_at ? bkkDate(m.onboarded_at) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
