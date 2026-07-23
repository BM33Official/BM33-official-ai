"use client";
import { useState } from "react";
import { act } from "./api";

type Item = { id: string; kind: string; title: string; body: string; created_at: string };

function Card({ it, testMode }: { it: Item; testMode: boolean }) {
  const [body, setBody] = useState(it.body);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function saveEdits() {
    setBusy(true);
    await act("summary.update", { id: it.id, patch: { body } });
    setBusy(false); setMsg("บันทึกแล้ว");
  }
  async function sendAll() {
    if (!testMode && !confirm("ส่งสรุปนี้ให้สมาชิกทุกคนจริง ๆ?")) return;
    setBusy(true); setMsg("");
    if (body !== it.body) await act("summary.update", { id: it.id, patch: { body } });
    const r = await act("summary.sendAll", { id: it.id, testMode });
    setBusy(false);
    if (r.ok) { setMsg(`ส่งแล้ว ${r.count} คน${r.testMode ? " (ทดสอบ)" : ""}`); setTimeout(() => window.location.reload(), 900); }
    else setMsg(`ส่งไม่ได้: ${r.error || ""}`);
  }
  async function del() {
    if (!confirm("ลบร่างนี้?")) return;
    await act("summary.delete", { id: it.id });
    window.location.reload();
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>{it.title}</b>
        <span className={`badge ${it.kind === "duedate" ? "b-warn" : "b-blue"}`}>{it.kind === "duedate" ? "ใกล้เดดไลน์" : "สรุปสัปดาห์"}</span>
      </div>
      <textarea style={{ marginTop: 10 }} value={body} onChange={(e) => setBody(e.target.value)} />
      {msg && <div className="msg msg-ok">{msg}</div>}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn-primary btn-sm" onClick={sendAll} disabled={busy}>ส่งให้ทุกคน</button>
        <button className="btn-sm" onClick={saveEdits} disabled={busy}>บันทึกแก้ไข</button>
        <button className="btn-danger btn-sm" onClick={del} disabled={busy}>ลบ</button>
      </div>
    </div>
  );
}

export default function SummaryPanel({ items }: { items: Item[] }) {
  const [busy, setBusy] = useState(false);
  const [testMode, setTestMode] = useState(true);

  async function generate() {
    setBusy(true);
    await act("summary.generate", {});
    window.location.reload();
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <b>สร้างสรุปงานสัปดาห์นี้</b>
            <div className="hint">AI จะรวบรวมงานค้าง เดดไลน์ และ red zone มาร่างข้อความให้ (รออนุมัติก่อนส่ง)</div>
          </div>
          <button className="btn-primary" onClick={generate} disabled={busy}>{busy ? "กำลังสร้าง…" : "สร้างสรุปเดี๋ยวนี้"}</button>
        </div>
        <label className="row" style={{ gap: 6, marginTop: 12 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
          โหมดทดสอบ (ส่งหาแอดมินเท่านั้น)
        </label>
      </div>

      {items.length === 0 ? (
        <div className="card"><p className="sub" style={{ margin: 0 }}>ไม่มีรายการรอส่ง — กด &quot;สร้างสรุปเดี๋ยวนี้&quot; หรือรอระบบสร้างอัตโนมัติ</p></div>
      ) : (
        items.map((it) => <Card key={it.id} it={it} testMode={testMode} />)
      )}
    </div>
  );
}
