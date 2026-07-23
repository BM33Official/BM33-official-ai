"use client";
import { useState } from "react";
import { act } from "./api";

export default function ConfirmButtons({ studentId, formId }: { studentId: string; formId: string }) {
  const [busy, setBusy] = useState(false);
  async function set(state: "confirmed" | "none") {
    setBusy(true);
    await act("status.set", { student_id: studentId, form_id: formId, state });
    window.location.reload();
  }
  return (
    <div className="row" style={{ gap: 6 }}>
      <button className="btn-primary btn-sm" onClick={() => set("confirmed")} disabled={busy}>ยืนยันว่าทำแล้ว</button>
      <button className="btn-danger btn-sm" onClick={() => set("none")} disabled={busy}>ปฏิเสธ</button>
    </div>
  );
}
