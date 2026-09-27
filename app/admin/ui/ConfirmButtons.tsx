"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { act } from "./api";

export default function ConfirmButtons({ studentId, formId }: { studentId: string; formId: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  async function set(state: "confirmed" | "none") {
    setBusy(true);
    await act("status.set", { student_id: studentId, form_id: formId, state });
    setDone(state === "confirmed" ? "ยืนยันแล้ว" : "ปฏิเสธแล้ว");
  }
  if (done) return <span className="badge b-muted">{done}</span>;
  return (
    <div className="row" style={{ gap: 6 }}>
      <button className="btn btn-sm btn-green" onClick={() => set("confirmed")} disabled={busy}><Check size={15} /> ใช่</button>
      <button className="btn btn-sm btn-danger" onClick={() => set("none")} disabled={busy}><X size={15} /></button>
    </div>
  );
}
