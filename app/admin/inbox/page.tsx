import { requireAdmin } from "@/lib/bc/auth";
import { readMembers } from "@/lib/bc/members";
import { readForms } from "@/lib/bc/forms";
import { readOverlay } from "@/lib/bc/status";
import { readRoster } from "@/lib/bc/roster";
import { readOutbox, resolveAudience, audienceLabel } from "@/lib/bc/outbox";
import ConfirmButtons from "../ui/ConfirmButtons";
import OutboxCard from "../ui/OutboxCard";
import PageHead from "../ui/PageHead";
import { thDateTime } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const digits = (s: string) => String(s ?? "").replace(/\D/g, "");
type Msg = { type: string; contents?: { body?: { contents?: { action?: { label: string; uri: string } }[] } } };

export default async function Inbox() {
  await requireAdmin();
  const [members, forms, overlay, roster, outbox] = await Promise.all([
    readMembers(true), readForms(), readOverlay(true), readRoster(), readOutbox(true),
  ]);
  const nameById = new Map(roster.map((r) => [r.student_id, `${r.nickname} (${r.full_name})`]));
  const formById = new Map(forms.map((f) => [f.form_id, f.name]));
  const now = Date.now();
  const pending = outbox.filter((o) => o.status === "pending" && !(o.expires_at && new Date(o.expires_at).getTime() < now));
  const history = outbox.filter((o) => o.status !== "pending" || (o.expires_at && new Date(o.expires_at).getTime() < now)).slice(-15).reverse();
  const items = await Promise.all(pending.map(async (o) => {
    let links: { label: string; url: string }[] = [];
    try {
      const msgs = JSON.parse(o.messages) as Msg[];
      links = msgs.flatMap((m) => m.contents?.body?.contents?.map((c) => c.action).filter(Boolean) ?? []).map((a) => ({ label: a!.label, url: a!.uri }));
    } catch { /* */ }
    return {
      id: o.id, code: o.code, title: o.title, audience: o.audience, audienceLabel: audienceLabel(o.audience),
      count: (await resolveAudience(o.audience)).length, preview: o.preview, links, kind: o.kind,
      created: thDateTime(o.created_at), expires: o.expires_at ? thDateTime(o.expires_at) : "",
    };
  }));
  const claims = overlay.filter((o) => o.state === "claimed");
  const mismatches = members.filter((m) => m.onboarding_state === "mismatch");

  return (
    <div className="wrap">
      <PageHead icon="📥" title="กล่องรอตรวจ" desc="ทุกอย่างที่ต้องให้คนตัดสินใจก่อน — ข้อความที่จะส่งถึงเพื่อน ๆ, คนที่กด “ทำแล้ว”, และการยืนยันตัวตนที่ไม่ตรง"
        steps={["อ่าน/แก้ข้อความ", "กดอนุมัติ & ส่ง (หรือพิมพ์ approve ใน LINE)", "ไม่ต้องการก็กด “ไม่ส่ง”"]} />

      <h2 style={{ marginTop: 0 }}>✉️ ข้อความรออนุมัติ ({items.length})</h2>
      {items.length === 0 ? <div className="card"><p className="hint" style={{ margin: 0 }}>ไม่มีข้อความรออนุมัติ — ระบบจะร่างเตือนเดดไลน์ให้อัตโนมัติ และทักคุณใน LINE เมื่อมีรายการใหม่</p></div>
        : items.map((it) => <OutboxCard key={it.id} it={it} />)}

      <h2>🙋 กด “ทำแล้ว” รอยืนยัน ({claims.length})</h2>
      <div className="card tablecard">
        {claims.length === 0 ? <p className="sub" style={{ margin: 0, padding: 8 }}>ไม่มีรายการรอตรวจ 🎉</p> : (
          <table>
            <thead><tr><th>นักศึกษา</th><th>รายการ</th><th>หมายเหตุ</th><th>เมื่อ</th><th></th></tr></thead>
            <tbody>
              {claims.map((c, i) => (
                <tr key={i}>
                  <td><b>{nameById.get(digits(c.student_id)) || c.student_id}</b></td>
                  <td>{formById.get(c.form_id) || c.form_id}</td>
                  <td className="hint">{c.note}</td>
                  <td className="hint">{thDateTime(c.updated_at)}</td>
                  <td><ConfirmButtons studentId={c.student_id} formId={c.form_id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mismatches.length > 0 && (
        <>
          <h2>🪪 ยืนยันตัวตนไม่ตรง ({mismatches.length})</h2>
          <div className="card tablecard">
            <table>
              <thead><tr><th>ชื่อ LINE</th><th>ที่แจ้ง</th><th>รหัสที่ขอ</th><th>ช่องทาง</th></tr></thead>
              <tbody>
                {mismatches.map((m, i) => (
                  <tr key={i}><td>{m.display_name || "-"}</td><td>{m.claimed_name}</td><td>{m.pending_student_id || `…${m.last3}`}</td><td className="hint">{m.liff_user_id ? "แอป" : "บอท"}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="hint" style={{ marginTop: 10 }}>กรณี “ขอยืนยันซ้ำ” = มีบัญชี LINE อื่นยืนยันรหัสนี้ไปแล้ว ตรวจกับเจ้าตัว ถ้าบัญชีเดิมผิด ให้ลบค่า liff_user_id ของแถวเดิมในแท็บ BC_members</p>
          </div>
        </>
      )}

      {history.length > 0 && (
        <>
          <h2>ประวัติล่าสุด</h2>
          <div className="card tablecard">
            <table>
              <thead><tr><th>#</th><th>รายการ</th><th>สถานะ</th><th>เมื่อ</th><th>ผล</th></tr></thead>
              <tbody>
                {history.map((o) => {
                  const expired = o.status === "pending";
                  return (
                    <tr key={o.id}>
                      <td>{o.code}</td><td>{o.title}</td>
                      <td><span className={`badge ${o.status === "sent" ? "b-ok" : o.status === "rejected" || expired ? "b-muted" : "b-danger"}`}>{expired ? "หมดอายุ" : o.status === "sent" ? "ส่งแล้ว" : o.status === "rejected" ? "ไม่ส่ง" : o.status}</span></td>
                      <td className="hint">{thDateTime(o.sent_at || o.decided_at || o.created_at)}</td>
                      <td className="hint">{o.result}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
