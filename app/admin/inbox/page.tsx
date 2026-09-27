// รออนุมัติ — ทุกอย่างที่ต้องให้คนตัดสินใจก่อนถึงเพื่อน ๆ (ส่งให้คุณตรวจทาง LINE ด้วยเสมอ)
import { Inbox, Hand, IdCard, History, MessageCircle, CheckCircle2, XCircle, Clock, CheckCheck } from "lucide-react";
import ActButton from "../ui/ActButton";
import { requireAdmin } from "@/lib/bc/auth";
import { readMembers } from "@/lib/bc/members";
import { readForms } from "@/lib/bc/forms";
import { readOverlay } from "@/lib/bc/status";
import { readRoster } from "@/lib/bc/roster";
import { readOutbox, resolveAudience, audienceLabel, unpackMessages } from "@/lib/bc/outbox";
import ConfirmButtons from "../ui/ConfirmButtons";
import OutboxCard from "../ui/OutboxCard";
import { Head, Sq, Empty } from "../ui/kit";
import { thDateTime, agoTh } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const digits = (s: string) => String(s ?? "").replace(/\D/g, "");
type Msg = { type: string; contents?: { body?: { contents?: { action?: { label: string; uri: string } }[] } } };

export default async function InboxPage() {
  await requireAdmin();
  const [members, forms, overlay, roster, outbox] = await Promise.all([readMembers(true), readForms(), readOverlay(true), readRoster(), readOutbox(true)]);
  const nameById = new Map(roster.map((r) => [r.student_id, r.nickname || r.full_name]));
  const formById = new Map(forms.map((f) => [f.form_id, f.name]));
  const now = Date.now();
  const pending = outbox.filter((o) => o.status === "pending" && !(o.expires_at && new Date(o.expires_at).getTime() < now));
  const history = outbox.filter((o) => !pending.includes(o)).slice(-12).reverse();
  const items = await Promise.all(pending.map(async (o) => {
    let links: { label: string; url: string }[] = [];
    let personal = false;
    try {
      const v = unpackMessages(o.messages);
      if (Array.isArray(v)) links = (v as Msg[]).flatMap((m) => m.contents?.body?.contents?.map((c) => c.action).filter(Boolean) ?? []).map((a) => ({ label: a!.label, url: a!.uri }));
      else personal = true;
    } catch { /* */ }
    return {
      id: o.id, code: o.code, title: o.title, audience: o.audience, audienceLabel: personal ? "ข้อความเฉพาะคน" : audienceLabel(o.audience),
      count: (await resolveAudience(o.audience)).length, preview: o.preview, links, kind: o.kind, personal,
      created: thDateTime(o.created_at), expires: o.expires_at ? thDateTime(o.expires_at) : "",
    };
  }));
  const claims = overlay.filter((o) => o.state === "claimed");
  const mismatches = members.filter((m) => m.onboarding_state === "mismatch");

  return (
    <div className="wrap">
      <Head icon={Inbox} tone="red" title="รออนุมัติ" sub="ไม่มีข้อความไหนถึงเพื่อน ๆ จนกว่าคุณจะกดส่ง" />

      <div className="card flat row" style={{ gap: 14, marginBottom: 18 }}>
        <Sq icon={MessageCircle} tone="line" size="lg" />
        <div style={{ flex: 1, minWidth: 220 }}><b>อนุมัติจาก LINE ได้เลย</b><div className="hint">ทุกรายการใหม่ บอทส่งการ์ดให้คุณในแชต — กดปุ่ม หรือพิมพ์ <b>approve 123</b> · <b>approve all</b> · <b>reject 123</b><br />เตือนเดดไลน์อัตโนมัติรวมเป็น <b>“สรุปเตือนวันนี้” ฉบับเดียว</b> ทุกเช้า 08:00 — แต่ละคนเห็นเฉพาะเรื่องที่ยังไม่ได้ทำ</div></div>
        <ActButton action="outbox.digestNow" className="btn-sm" doneText="ร่างแล้ว #{code} · {items} เรื่อง · {people} คน — รีเฟรชหน้าเพื่อดู">ร่างสรุปเตือนตอนนี้</ActButton>
      </div>

      {items.length === 0 ? <div className="card"><Empty icon={CheckCircle2} title="ไม่มีข้อความรออนุมัติ" sub="ระบบจะร่างเตือนเดดไลน์ให้เองก่อน 3 วัน · 1 วัน · เช้าวันจริง" /></div>
        : <div className="stack">{items.map((it) => <OutboxCard key={it.id} it={it} />)}</div>}

      {claims.length > 0 && (
        <>
          <h2 className="row" style={{ gap: 10 }}><Sq icon={Hand} tone="orange" /> กด “กรอกแล้ว” รอยืนยัน <span className="badge b-orange">{claims.length}</span></h2>
          <div className="stack">
            {Array.from(new Set(claims.map((c) => c.form_id))).map((fid) => {
              const list = claims.filter((c) => c.form_id === fid);
              return (
                <div key={fid} className="card">
                  <div className="card-h" style={{ flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0 }}>{formById.get(fid) || fid} <span className="badge b-orange">{list.length} คน</span></h3>
                    <div className="row" style={{ gap: 8 }}>
                      <ActButton action="form.approveAll" payload={{ id: fid }} className="btn-sm btn-green"><CheckCheck size={15} /> ยืนยันทั้งหมด</ActButton>
                      <ActButton action="form.approveAll" payload={{ id: fid, trust: true }} className="btn-sm" confirmText="ยืนยันทุกคน และต่อไปใครกด “กรอกแล้ว” ในงานนี้ นับว่าเสร็จเลยโดยไม่ต้องรอคุณ?">ยืนยัน + ต่อไปไม่ต้องตรวจ</ActButton>
                    </div>
                  </div>
                  <div className="list">
                    {list.map((c, i) => (
                      <div key={i} className="li">
                        <span className="ic c-orange" style={{ fontWeight: 800 }}>{(nameById.get(digits(c.student_id)) ?? "?").slice(0, 1)}</span>
                        <div className="li-b"><b>{nameById.get(digits(c.student_id)) || c.student_id}</b><small>#{Number(digits(c.student_id).slice(-3))}{c.note ? ` · ${c.note}` : ""} · {agoTh(c.updated_at)}</small></div>
                        <ConfirmButtons studentId={c.student_id} formId={c.form_id} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {mismatches.length > 0 && (
        <>
          <h2 className="row" style={{ gap: 10 }}><Sq icon={IdCard} tone="pink" /> ยืนยันตัวตนไม่ตรง <span className="badge b-red">{mismatches.length}</span></h2>
          <div className="list">
            {mismatches.map((m, i) => (
              <div key={i} className="li"><span className="ic lg c-pink"><IdCard strokeWidth={2.4} /></span>
                <div className="li-b"><b>{m.display_name || "-"} → {m.claimed_name}</b><small>รหัสที่ขอ {m.pending_student_id || `…${m.last3}`} · ผ่าน{m.liff_user_id ? "แอป" : "บอท"} · มีบัญชีอื่นยืนยันรหัสนี้ไปแล้ว ถ้าบัญชีเดิมผิดให้ลบ liff_user_id ของแถวเดิมใน BC_members</small></div>
              </div>
            ))}
          </div>
        </>
      )}

      {history.length > 0 && (
        <details className="more" style={{ marginTop: 26 }}>
          <summary><History size={16} /> ประวัติล่าสุด</summary>
          <div className="list" style={{ marginTop: 10 }}>
            {history.map((o) => {
              const expired = o.status === "pending";
              const sent = o.status === "sent";
              return (
                <div key={o.id} className="li">
                  {sent ? <CheckCircle2 color="#34c759" /> : expired ? <Clock color="#8e8e93" /> : <XCircle color="#ff3b30" />}
                  <div className="li-b"><b>{o.title}</b><small>#{o.code} · {expired ? "หมดเวลา" : sent ? "ส่งแล้ว" : o.status === "rejected" ? "ไม่ส่ง" : o.status} · {thDateTime(o.sent_at || o.decided_at || o.created_at)} · {o.result}</small></div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
