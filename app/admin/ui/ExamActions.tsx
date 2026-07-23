"use client";
import { useState } from "react";
import { act } from "./api";

export default function ExamActions({ examId, examName }: { examId: string; examName: string }) {
  const [busy, setBusy] = useState(false);
  async function cancel() {
    if (!confirm(`ยกเลิก/ลบข้อสอบ "${examName}"?\n(ประวัติการทำเครื่องหมายของข้อสอบนี้จะหายไป)`)) return;
    setBusy(true);
    const r = await act("academic.deleteExam", { examId });
    if (r.ok) window.location.href = "/admin/academic";
    else { setBusy(false); alert("ยกเลิกไม่สำเร็จ ลองใหม่อีกครั้งน้า"); }
  }
  return (
    <div className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "nowrap" }}>
      <a className="btn btn-sm" href={`/admin/academic?exam=${examId}`}>ทำเครื่องหมาย</a>
      <button className="btn btn-sm btn-danger" onClick={cancel} disabled={busy}>{busy ? "…" : "ยกเลิก"}</button>
    </div>
  );
}
