"use client";
import { useState } from "react";
import { act } from "./api";

export default function ExamCreate() {
  const [f, setF] = useState({ name: "", exam_date: "", question_count: "" });
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!f.name) return;
    setBusy(true);
    const r = await act("academic.addExam", f);
    setBusy(false);
    if (r.ok) window.location.href = `/admin/academic?exam=${r.exam_id}`;
  }
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>สร้างข้อสอบใหม่</h2>
      <div className="grid g2">
        <div className="field"><label>ชื่อข้อสอบ</label>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="เช่น Anatomy สอบย่อย 1" /></div>
        <div className="field"><label>วันสอบ</label>
          <input type="date" value={f.exam_date} onChange={(e) => setF({ ...f, exam_date: e.target.value })} /></div>
        <div className="field"><label>จำนวนข้อที่ต้องท่อง</label>
          <input type="number" value={f.question_count} onChange={(e) => setF({ ...f, question_count: e.target.value })} placeholder="เช่น 50" /></div>
      </div>
      <button className="btn-primary" onClick={save} disabled={busy || !f.name}>สร้างข้อสอบ</button>
    </div>
  );
}
