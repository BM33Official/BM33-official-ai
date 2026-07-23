import { requireAuth } from "@/lib/bc/auth";
import { ensureBcTabs } from "@/lib/bc/sheets";
import { readMembers } from "@/lib/bc/members";
import { readForms } from "@/lib/bc/forms";
import { summarize, readOverlay } from "@/lib/bc/status";
import { readBroadcasts } from "@/lib/bc/broadcast";
import { messageQuota } from "@/lib/line";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  requireAuth();
  await ensureBcTabs();

  const [members, forms, overlay, quota, broadcasts] = await Promise.all([
    readMembers(true), readForms(), readOverlay(true), messageQuota(), readBroadcasts(),
  ]);
  const verified = members.filter((m) => m.status === "verified").length;
  const onboarding = members.filter((m) => m.onboarding_state && m.onboarding_state !== "done").length;
  const claimed = overlay.filter((o) => o.state === "claimed").length;
  const mismatch = members.filter((m) => m.onboarding_state === "mismatch").length;
  const pendingBroadcasts = broadcasts.filter((b) => ["draft", "pending", "scheduled"].includes(b.status)).length;

  const summaries = await Promise.all(
    forms.map(async (f) => ({ f, s: await summarize(f) }))
  );

  return (
    <div className="wrap">
      <h1>แดชบอร์ด</h1>
      <p className="sub">ภาพรวมระบบบรอดแคสต์อัตโนมัติของรุ่น BM33</p>

      <div className="grid g4">
        <div className="card"><div className="label">สมาชิกยืนยันแล้ว</div><div className="stat">{verified}<small> / {members.length} คน</small></div></div>
        <div className="card"><div className="label">โควตาข้อความคงเหลือ</div><div className="stat">{quota.remaining === null ? "∞" : quota.remaining}<small> ใช้ไป {quota.used}</small></div></div>
        <div className="card"><div className="label">รอตรวจ (กดว่าทำแล้ว)</div><div className="stat">{claimed + mismatch}<small> รายการ</small></div></div>
        <div className="card"><div className="label">บรอดแคสต์ค้าง</div><div className="stat">{pendingBroadcasts}<small> รายการ</small></div></div>
      </div>

      <h2>ฟอร์ม/รายการที่ติดตาม</h2>
      <div className="card tablecard">
        {forms.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>ยังไม่มีฟอร์ม — <Link href="/admin/forms">เพิ่มฟอร์มแรก</Link></p>
        ) : (
          <table>
            <thead><tr><th>ชื่อ</th><th>ประเภท</th><th>ทำแล้ว</th><th>ยังไม่ทำ</th><th>รอตรวจ</th><th>การตรวจ</th></tr></thead>
            <tbody>
              {summaries.map(({ f, s }) => (
                <tr key={f.form_id}>
                  <td><b>{f.name}</b></td>
                  <td>{f.type || "-"}</td>
                  <td><span className="badge b-ok">{s.done}</span></td>
                  <td><span className="badge b-warn">{s.undone}</span></td>
                  <td>{s.claimed ? <span className="badge b-blue">{s.claimed}</span> : "-"}</td>
                  <td>{f.access === "auto" ? <span className="badge b-ok">อัตโนมัติ</span> : <span className="badge b-muted">แมนนวล</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {onboarding > 0 && (
        <p className="hint" style={{ marginTop: 12 }}>มี {onboarding} คนกำลังลงทะเบียนอยู่ (ยังไม่ยืนยันเสร็จ)</p>
      )}
    </div>
  );
}
