"use client";
import { useState } from "react";
import { act } from "./api";

type Item = { id: string; code: string; title: string; audience: string; audienceLabel: string; count: number; preview: string; links: { label: string; url: string }[]; created: string; expires: string; kind: string };

export default function OutboxCard({ it }: { it: Item }) {
  const [text, setText] = useState(it.preview);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const dirty = text !== it.preview;

  async function save() {
    setBusy(true);
    const r = await act("outbox.update", { id: it.id, text, title: it.title, links: it.links });
    setBusy(false); setMsg(r.ok ? "บันทึกแล้ว" : "บันทึกไม่ได้");
  }
  async function approve() {
    if (!confirm(`ส่งข้อความนี้ถึง ${it.count} คนจริง ๆ ตอนนี้?`)) return;
    setBusy(true); setMsg("");
    if (dirty) await act("outbox.update", { id: it.id, text, title: it.title, links: it.links });
    const r = await act("outbox.approve", { id: it.id });
    setBusy(false);
    setMsg(r.ok ? `ส่งแล้ว ✅ ${r.count} คน` : `ส่งไม่ได้: ${r.error}`);
    if (r.ok) setTimeout(() => window.location.reload(), 900);
  }
  async function reject() {
    setBusy(true);
    await act("outbox.reject", { id: it.id });
    window.location.reload();
  }
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><span className="badge b-blue">#{it.code}</span> <b>{it.title}</b></div>
        <span className="badge b-muted">{it.audienceLabel} · {it.count} คน</span>
      </div>
      <div className="hint">สร้าง {it.created}{it.expires ? ` · หมดอายุ ${it.expires}` : ""} · หรือพิมพ์ <b>approve {it.code}</b> ในแชต LINE ของบอท</div>
      <textarea style={{ marginTop: 10, minHeight: 150 }} value={text} onChange={(e) => setText(e.target.value)} />
      {it.links.length > 0 && <div className="hint">ปุ่มที่แนบ: {it.links.map((l) => l.label).join(" · ")}</div>}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn-green" onClick={approve} disabled={busy}>อนุมัติ & ส่งเลย</button>
        {dirty && <button onClick={save} disabled={busy}>บันทึกข้อความ</button>}
        <button className="btn-danger" onClick={reject} disabled={busy}>ไม่ส่ง</button>
        {msg && <span className="badge b-ok">{msg}</span>}
      </div>
    </div>
  );
}
