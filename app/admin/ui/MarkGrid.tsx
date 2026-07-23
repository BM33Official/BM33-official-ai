"use client";
import { useState } from "react";
import { act } from "./api";

type Row = { student_id: string; nickname: string; name: string };

export default function MarkGrid({ examId, examName, rows, initial }: {
  examId: string; examName: string; rows: Row[]; initial: string[];
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(initial));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");

  const toggle = (id: string) => {
    const n = new Set(checked);
    n.has(id) ? n.delete(id) : n.add(id);
    setChecked(n);
  };
  async function save() {
    setBusy(true); setMsg("");
    const r = await act("academic.setMarks", { examId, ids: Array.from(checked) });
    setBusy(false);
    setMsg(r.ok ? "บันทึกแล้ว ✅" : "บันทึกไม่สำเร็จ");
    if (r.ok) setTimeout(() => window.location.reload(), 600);
  }
  const shown = rows.filter((r) => !q || (r.nickname + r.name + r.student_id).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>ทำเครื่องหมาย &quot;ยังไม่ท่อง&quot; — {examName}</h2>
        <span className="badge b-warn">เลือกแล้ว {checked.size}</span>
      </div>
      <p className="hint">ติ๊กคนที่ <b>ยังไม่ได้ท่อง</b> ข้อสอบนี้ (ไม่ติ๊ก = ท่องแล้ว)</p>
      <input placeholder="ค้นหาชื่อ/ชื่อเล่น/รหัส…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 6, maxHeight: 420, overflowY: "auto" }}>
        {shown.map((r) => (
          <label key={r.student_id} className="row" style={{ gap: 8, padding: "6px 8px", borderRadius: 8, background: checked.has(r.student_id) ? "#fff3e0" : "transparent" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={checked.has(r.student_id)} onChange={() => toggle(r.student_id)} />
            <span style={{ fontSize: 14 }}>{r.nickname} <span className="hint">#{r.student_id.slice(-3)}</span></span>
          </label>
        ))}
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn-primary" onClick={save} disabled={busy}>บันทึกการทำเครื่องหมาย</button>
        {msg && <span className="badge b-ok">{msg}</span>}
      </div>
    </div>
  );
}
