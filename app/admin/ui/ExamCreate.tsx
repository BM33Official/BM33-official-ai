"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
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
    <div className="card flat">
      <div className="row" style={{ gap: 8 }}>
        <input style={{ flex: 2, minWidth: 200 }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ชื่อข้อสอบ เช่น Anatomy สอบย่อย 1" />
        <input type="date" style={{ flex: 1, minWidth: 150 }} value={f.exam_date} onChange={(e) => setF({ ...f, exam_date: e.target.value })} />
        <button className="btn-primary" onClick={save} disabled={busy || !f.name}><Plus size={16} /> สร้าง</button>
      </div>
      <input style={{ marginTop: 8, width: "100%" }} value={f.doc_link} onChange={(e) => setF({ ...f, doc_link: e.target.value })} placeholder="(ไม่บังคับ) ลิงก์เอกสารให้ทุกคนกรอก — ใช้ส่งเตือน “ไปกรอกเอกสาร”" />
    </div>
  );
}
