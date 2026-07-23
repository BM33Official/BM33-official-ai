"use client";
import { useState } from "react";
import { act } from "./api";

export default function AcademicBroadcast() {
  const [testMode, setTestMode] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  async function send(mode: "unmemorized" | "redzone" | "rest", label: string) {
    if (!testMode && !confirm(`ส่งประกาศจริงถึงกลุ่ม "${label}"?`)) return;
    setBusy(true); setMsg(null);
    const r = await act("academic.broadcast", { mode, testMode });
    setBusy(false);
    if (r.ok) setMsg({ t: `ส่งแล้ว ${r.count} คน${r.testMode ? " (ทดสอบ — ส่งหาแอดมิน)" : ""}`, ok: true });
    else setMsg({ t: `ส่งไม่ได้: ${r.error || "ไม่มีผู้รับ"}`, ok: false });
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>ประกาศเฉพาะกลุ่ม (วิชาการ)</h2>
      <div className="field">
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
          โหมดทดสอบ (ส่งตัวอย่างหาแอดมินเท่านั้น)
        </label>
      </div>
      {msg && <div className={`msg ${msg.ok ? "msg-ok" : "msg-err"}`}>{msg.t}</div>}
      <div className="row">
        <button onClick={() => send("unmemorized", "ทุกคนที่ยังไม่ท่อง")} disabled={busy}>แจ้งทุกคนที่ยังไม่ท่อง</button>
        <button className="btn-danger" onClick={() => send("redzone", "Red Zone")} disabled={busy}>แจ้งคนใน Red Zone</button>
        <button onClick={() => send("rest", "ที่เหลือ")} disabled={busy}>แจ้งที่เหลือ (+ระยะห่าง red zone)</button>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>ข้อความปรับให้แต่ละคนอัตโนมัติ (จำนวนครั้งที่พลาด, ชื่อข้อสอบ, ระยะห่างจาก red zone) และแนบหมายเหตุให้ทักฝ่ายวิชาการถ้าคิดว่าผิด</p>
    </div>
  );
}
