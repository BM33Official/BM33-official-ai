"use client";
import { useState } from "react";
import { act } from "./api";

export default function ExamCreate() {
  const [f, setF] = useState({ name: "", exam_date: "", doc_link: "", doc_title: "" });
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
        <div className="field"><label>วันสอบ <span className="hint" style={{ fontWeight: 400 }}>(ไม่บังคับ)</span></label>
          <input type="date" value={f.exam_date} onChange={(e) => setF({ ...f, exam_date: e.target.value })} /></div>
      </div>
      <div className="field"><label>ลิงก์เอกสารแบ่งข้อรับผิดชอบ <span className="hint" style={{ fontWeight: 400 }}>(ไม่บังคับ)</span></label>
        <input value={f.doc_link} onChange={(e) => setF({ ...f, doc_link: e.target.value })} placeholder="วางลิงก์ Google Doc/Sheet ที่ให้ทุกคนกรอกว่าใครรับผิดชอบข้อไหน" /></div>
      <div className="field"><label>ชื่อเอกสาร <span className="hint" style={{ fontWeight: 400 }}>(ไม่บังคับ — ใช้ตอนแจ้งเตือน)</span></label>
        <input value={f.doc_title} onChange={(e) => setF({ ...f, doc_title: e.target.value })} placeholder="เช่น ตารางแบ่งข้อ Anatomy สอบย่อย 1" /></div>
      <p className="hint" style={{ marginTop: -4, marginBottom: 14 }}>ไม่ต้องกรอกจำนวนข้อแล้ว — ระบบดูแค่ว่าใครยังไม่ได้จำ และเตือนคนที่ยังไม่กรอกเอกสารได้</p>
      <button className="btn-primary" onClick={save} disabled={busy || !f.name}>สร้างข้อสอบ</button>
    </div>
  );
}
