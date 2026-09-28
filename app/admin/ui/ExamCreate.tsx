"use client";
// สร้างข้อสอบใหม่ — การ์ดมีกรอบชัด + ช่องมีป้ายชื่อ
import { useState } from "react";
import { Plus, FilePlus2 } from "lucide-react";
import { act } from "./api";

export default function ExamCreate() {
  const [f, setF] = useState({ name: "", exam_date: "", doc_link: "", doc_title: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    if (!f.name.trim()) return;
    setBusy(true); setErr("");
    const r = await act("academic.addExam", f);
    setBusy(false);
    if (r.ok) window.location.href = `/admin/academic?exam=${r.exam_id}`;
    else setErr(String(r.error ?? "สร้างไม่ได้"));
  }
  return (
    <div className="card exam-create">
      <div className="row" style={{ gap: 10, marginBottom: 14 }}>
        <span className="ic c-purple"><FilePlus2 strokeWidth={2.4} /></span>
        <div><b style={{ fontSize: 17 }}>ข้อสอบใหม่</b><div className="hint" style={{ margin: 0 }}>สร้างแล้วค่อยตรวจด้วย AI หรือติ๊กเองทีละคน</div></div>
      </div>
      <div className="grid g2">
        <div className="field"><label>ชื่อข้อสอบ *</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="เช่น Anatomy สอบย่อย 1" autoFocus /></div>
        <div className="field"><label>วันที่สอบ</label><input type="date" value={f.exam_date} onChange={(e) => setF({ ...f, exam_date: e.target.value })} /></div>
      </div>
      <div className="grid g2">
        <div className="field"><label>ลิงก์เอกสารให้เพื่อนกรอกข้อที่จำ</label><input value={f.doc_link} onChange={(e) => setF({ ...f, doc_link: e.target.value })} placeholder="https://docs.google.com/…" /></div>
        <div className="field"><label>ชื่อเอกสาร (ไม่บังคับ)</label><input value={f.doc_title} onChange={(e) => setF({ ...f, doc_title: e.target.value })} placeholder="เช่น Recall Anatomy 1" /></div>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>ลิงก์นี้จะเป็นปุ่ม “ไปกรอก” ในข้อความเตือนและในแอปของคนที่ยังไม่ได้กรอก (แต่ละข้อสอบมีปุ่มของตัวเอง)</p>
      <div className="row">
        <button className="btn-primary" onClick={save} disabled={busy || !f.name.trim()}><Plus size={16} /> {busy ? "กำลังสร้าง…" : "สร้างข้อสอบ"}</button>
        {err && <span className="badge b-red">{err}</span>}
      </div>
    </div>
  );
}
