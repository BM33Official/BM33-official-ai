"use client";
// รายการรออนุมัติ 1 ชิ้น — ดูเหมือนแชต LINE จริง (ผู้รับจะเห็นแบบนี้) + ปุ่มใหญ่ ส่ง / ไม่ส่ง
import { useState } from "react";
import { Send, X, Pencil, Users, Clock, MessageCircle } from "lucide-react";
import { act } from "./api";

type Item = { id: string; code: string; title: string; audience: string; audienceLabel: string; count: number; preview: string; links: { label: string; url: string }[]; created: string; expires: string; kind: string; personal?: boolean };

const KIND: Record<string, { th: string; tone: string }> = {
  deadline: { th: "เตือนเดดไลน์", tone: "b-orange" }, fee: { th: "เงินรุ่น", tone: "b-green" }, draw: { th: "ผลสุ่ม", tone: "b-purple" },
  academic: { th: "วิชาการ", tone: "b-purple" }, announcement: { th: "ประกาศ", tone: "b-blue" }, broadcast: { th: "ประกาศ", tone: "b-blue" }, summary: { th: "สรุป", tone: "b-blue" },
};

export default function OutboxCard({ it }: { it: Item }) {
  const [text, setText] = useState(it.preview);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [gone, setGone] = useState(false);
  const dirty = text !== it.preview;
  const k = KIND[it.kind] ?? { th: it.kind, tone: "b-muted" };

  async function approve() {
    if (!confirm(`ส่งถึง ${it.count} คนตอนนี้เลย?`)) return;
    setBusy(true); setMsg("");
    if (dirty) await act("outbox.update", { id: it.id, text, title: it.title, links: it.links });
    const r = await act("outbox.approve", { id: it.id });
    setBusy(false);
    setMsg(r.ok ? `ส่งแล้ว ${r.count} คน` : `ส่งไม่ได้: ${r.error}`);
    if (r.ok) setTimeout(() => setGone(true), 900);
  }
  async function reject() {
    setBusy(true);
    await act("outbox.reject", { id: it.id });
    setGone(true);
  }
  async function save() {
    setBusy(true);
    const r = await act("outbox.update", { id: it.id, text, title: it.title, links: it.links });
    setBusy(false); setEditing(false); setMsg(r.ok ? "บันทึกแล้ว" : "บันทึกไม่ได้");
  }
  if (gone) return null;

  return (
    <div className="card fade-in split">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row"><span className={`badge ${k.tone}`}>{k.th}</span><span className="badge b-muted">#{it.code}</span></div>
        <h3 style={{ fontSize: 20 }}>{it.title}</h3>
        <div className="stack" style={{ gap: 8 }}>
          <div className="row hint" style={{ gap: 8 }}><Users size={16} /> ส่งถึง <b style={{ color: "var(--text)" }}>{it.count} คน</b> · {it.audienceLabel}</div>
          {it.expires && <div className="row hint" style={{ gap: 8 }}><Clock size={16} /> ต้องส่งก่อน {it.expires}</div>}
          <div className="row hint" style={{ gap: 8 }}><MessageCircle size={16} /> หรือพิมพ์ <b style={{ color: "var(--text)" }}>approve {it.code}</b> ในแชตบอท</div>
        </div>
        <div className="row" style={{ marginTop: "auto" }}>
          <button className="btn btn-green btn-lg" onClick={approve} disabled={busy}><Send size={18} /> ส่งเลย</button>
          <button className="btn" onClick={() => setEditing(!editing)} disabled={busy || it.personal}><Pencil size={16} /> แก้</button>
          <button className="btn btn-danger" onClick={reject} disabled={busy}><X size={16} /> ไม่ส่ง</button>
        </div>
        {msg && <div className="msg msg-ok">{msg}</div>}
      </div>
      <div className="phone line">
        {editing ? (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 200, background: "#fff" }} />
            <div className="row"><button className="btn btn-sm btn-primary" onClick={save} disabled={busy || !dirty}>บันทึก</button><button className="btn btn-sm" style={{ background: "#fff" }} onClick={() => { setText(it.preview); setEditing(false); }}>ยกเลิก</button></div>
          </>
        ) : (
          <>
            <div className="bubble">{text}</div>
            {it.links.length > 0 && <div className="bubble-btns">{it.links.map((l, i) => <span key={i}>{l.label}</span>)}</div>}
          </>
        )}
      </div>
    </div>
  );
}
