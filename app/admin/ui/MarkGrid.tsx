"use client";
import { useState } from "react";
import { act } from "./api";

type Row = { student_id: string; nickname: string; name: string };

type Variant = "memorize" | "doc";
const COPY: Record<Variant, { action: string; title: string; hint: string; check: string; save: string; on: string }> = {
  memorize: {
    action: "academic.setMarks",
    title: 'ทำเครื่องหมาย "ยังไม่ได้จำ"',
    hint: "ติ๊กคนที่ ยังไม่ได้จำ ข้อสอบนี้ (ไม่ติ๊ก = จำแล้ว)",
    check: "#fff3e0",
    save: "บันทึกการทำเครื่องหมาย",
    on: "เลือกแล้ว",
  },
  doc: {
    action: "academic.setNotFilled",
    title: 'ทำเครื่องหมาย "ยังไม่กรอกเอกสาร"',
    hint: "ติ๊กคนที่ ยังไม่กรอกเอกสารแบ่งข้อ (เช็กจากเอกสารจริง) — ระบบจะส่งเตือนเฉพาะคนที่ติ๊ก",
    check: "#e8f0fe",
    save: "บันทึกรายชื่อที่ยังไม่กรอก",
    on: "ยังไม่กรอก",
  },
};

export default function MarkGrid({ examId, examName, rows, initial, variant = "memorize" }: {
  examId: string; examName: string; rows: Row[]; initial: string[]; variant?: Variant;
}) {
  const c = COPY[variant];
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
    const r = await act(c.action, { examId, ids: Array.from(checked) });
    setBusy(false);
    setMsg(r.ok ? "บันทึกแล้ว ✅" : "บันทึกไม่สำเร็จ");
    if (r.ok) setTimeout(() => window.location.reload(), 600);
  }
  const shown = rows.filter((r) => !q || (r.nickname + r.name + r.student_id).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{c.title} — {examName}</h2>
        <span className={`badge ${variant === "doc" ? "b-blue" : "b-warn"}`}>{c.on} {checked.size}</span>
      </div>
      <p className="hint">{c.hint}</p>
      <input placeholder="ค้นหาชื่อ/ชื่อเล่น/รหัส…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6, maxHeight: 420, overflowY: "auto" }}>
        {shown.map((r) => (
          <label key={r.student_id} className="row" style={{ gap: 8, padding: "8px 10px", borderRadius: 10, cursor: "pointer", background: checked.has(r.student_id) ? c.check : "transparent", transition: "background .12s ease" }}>
            <input type="checkbox" checked={checked.has(r.student_id)} onChange={() => toggle(r.student_id)} />
            <span style={{ fontSize: 14 }}>{r.nickname} <span className="hint">#{r.student_id.slice(-3)}</span></span>
          </label>
        ))}
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn-primary" onClick={save} disabled={busy}>{c.save}</button>
        {msg && <span className="badge b-ok">{msg}</span>}
      </div>
    </div>
  );
}
