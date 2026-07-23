"use client";
import { useEffect, useState } from "react";
import { act } from "./api";

// ส่งเตือนเฉพาะคนที่ถูกติ๊กว่า "ยังไม่กรอกเอกสาร" (โหมด doc_unfilled)
export default function DocReminder({ examId }: { examId: string }) {
  const [testMode, setTestMode] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [pv, setPv] = useState<{ count: number; sample: string } | null>(null);

  const load = () =>
    act("academic.preview", { mode: "doc_unfilled", examId })
      .then((r) => { if (r.ok) setPv({ count: r.count as number, sample: r.sample as string }); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [examId]);

  async function send() {
    if (!testMode && !confirm(`ส่งเตือนจริงถึงคนที่ยังไม่กรอกเอกสาร (${pv?.count ?? 0} คน)?`)) return;
    setBusy(true); setMsg(null);
    const r = await act("academic.broadcast", { mode: "doc_unfilled", testMode, examId });
    setBusy(false);
    if (r.ok) setMsg({ t: `ส่งแล้ว ${r.count} คน${r.testMode ? " · โหมดทดสอบ (หาแอดมิน)" : " · ส่งจริงเรียบร้อย ✅"}`, ok: true });
    else setMsg({ t: `ส่งไม่ได้: ${r.error === "no_recipients" ? "ยังไม่มีใครถูกติ๊กว่ายังไม่กรอก" : r.error}`, ok: false });
  }

  return (
    <div className="card" style={{ background: "linear-gradient(180deg,#f7f9ff,#fff)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>ส่งเตือนเฉพาะคนที่ยังไม่กรอกเอกสาร</b>
        <span className="badge b-blue">{pv?.count ?? "—"} คน</span>
      </div>
      <p className="hint">ติ๊กรายชื่อด้านบนให้ครบก่อน แล้วกดส่ง — ระบบจะทักเฉพาะคนที่ยังไม่กรอก (ที่ลงทะเบียนไว้)</p>
      {pv?.sample && (
        <div className="preview" style={{ maxWidth: 320, marginBottom: 10 }}>
          <div className="pb" style={{ fontSize: 13.5 }}>{pv.sample}</div>
        </div>
      )}
      <label className="row" style={{ gap: 8, fontWeight: 700, marginBottom: 10 }}>
        <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
        โหมดทดสอบ — ส่งตัวอย่างให้แอดมินเท่านั้น
      </label>
      {msg && <div className={`msg ${msg.ok ? "msg-ok" : "msg-err"}`}>{msg.t}</div>}
      <button className={testMode ? "btn-primary" : "btn-green"} onClick={send} disabled={busy || (pv?.count ?? 0) === 0}>
        {busy ? "กำลังส่ง…" : testMode ? "🧪 ส่งทดสอบให้แอดมิน" : `📢 ส่งจริงถึง ${pv?.count ?? 0} คน`}
      </button>
    </div>
  );
}
