"use client";
import { useState } from "react";
import { act } from "./api";
import { bkkDateTime } from "@/lib/bc/format";

type Item = { id: string; kind: string; title: string; body: string; status: string; schedule_at: string; created_at: string };

const toISO = (local: string) => (local ? new Date(local).toISOString() : "");

function Card({ it, testMode }: { it: Item; testMode: boolean }) {
  const [body, setBody] = useState(it.body);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const scheduled = it.status === "scheduled";

  async function saveEdits() {
    setBusy(true);
    await act("summary.update", { id: it.id, patch: { body } });
    setBusy(false); setMsg("บันทึกแล้ว");
  }
  async function sendAll() {
    if (!testMode && !confirm("ส่งข้อความนี้ให้สมาชิกทุกคนจริง ๆ เดี๋ยวนี้?")) return;
    setBusy(true); setMsg("");
    if (body !== it.body) await act("summary.update", { id: it.id, patch: { body } });
    const r = await act("summary.sendAll", { id: it.id, testMode });
    setBusy(false);
    if (r.ok) { setMsg(`ส่งแล้ว ${r.count} คน${r.testMode ? " (ทดสอบ)" : ""}`); setTimeout(() => window.location.reload(), 900); }
    else setMsg(`ส่งไม่ได้: ${r.error || ""}`);
  }
  async function schedule() {
    if (!when) { setMsg("เลือกวัน–เวลาก่อนน้า"); return; }
    setBusy(true); setMsg("");
    const r = await act("summary.schedule", { id: it.id, at: toISO(when), body });
    setBusy(false);
    if (r.ok) { setMsg("ตั้งเวลาส่งแล้ว ✅"); setTimeout(() => window.location.reload(), 800); }
    else setMsg("ตั้งเวลาไม่ได้");
  }
  async function unschedule() {
    setBusy(true);
    await act("summary.unschedule", { id: it.id });
    window.location.reload();
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
        <div className="row" style={{ gap: 6 }}>
          {scheduled && <span className="badge b-ok">⏰ {bkkDateTime(it.schedule_at)} น.</span>}
          <span className={`badge ${it.kind === "duedate" ? "b-warn" : "b-blue"}`}>{it.kind === "duedate" ? "เตือนเดดไลน์" : "สรุปสัปดาห์"}</span>
        </div>
      </div>

      <textarea style={{ marginTop: 10 }} value={body} onChange={(e) => setBody(e.target.value)} disabled={scheduled} />
      {msg && <div className="msg msg-ok">{msg}</div>}

      {scheduled ? (
        <div className="row" style={{ marginTop: 8 }}>
          <span className="hint">ตั้งเวลาส่งอัตโนมัติไว้แล้ว — ระบบจะส่งให้ทุกคนเมื่อถึงเวลา</span>
          <span style={{ flex: 1 }} />
          <button className="btn-sm" onClick={unschedule} disabled={busy}>ยกเลิกกำหนดเวลา / กลับมาแก้</button>
          <button className="btn-danger btn-sm" onClick={del} disabled={busy}>ลบ</button>
        </div>
      ) : (
        <>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn-primary btn-sm" onClick={sendAll} disabled={busy}>ส่งเลย (ให้ทุกคน)</button>
            <button className="btn-sm" onClick={saveEdits} disabled={busy}>บันทึกแก้ไข</button>
            <button className="btn-danger btn-sm" onClick={del} disabled={busy}>ลบ</button>
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <span className="hint" style={{ fontWeight: 700 }}>หรือ ตั้งเวลาส่ง:</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ maxWidth: 220, width: "auto" }} />
            <button className="btn-sm" onClick={schedule} disabled={busy || !when}>⏰ ตั้งเวลาส่ง</button>
          </div>
        </>
      )}
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
        <label className="row" style={{ gap: 8, marginTop: 12, fontWeight: 700 }}>
          <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
          โหมดทดสอบ — “ส่งเลย” จะส่งหาแอดมินเท่านั้น (การตั้งเวลาส่งจะส่งจริงเสมอเมื่อถึงเวลา)
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
