"use client";
import { useState } from "react";
import { act } from "./api";

export default function RowActions({ id, status }: { id: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function approve() {
    setBusy(true);
    const r = await act("broadcast.approveSend", { id });
    setBusy(false);
    if (r.ok || r.scheduled) window.location.reload();
    else setNote(String(r.blocked || r.error || "ส่งไม่ได้"));
  }
  async function del() {
    if (!confirm("ยกเลิก/ลบรายการนี้?")) return;
    setBusy(true);
    await act("broadcast.delete", { id });
    window.location.reload();
  }

  return (
    <div className="row" style={{ gap: 6 }}>
      {["draft", "pending"].includes(status) && (
        <a className="btn btn-sm" href={`/admin/broadcasts?edit=${id}`}>แก้ไข</a>
      )}
      {["draft", "pending"].includes(status) && (
        <button className="btn-primary btn-sm" onClick={approve} disabled={busy}>อนุมัติ & ส่ง</button>
      )}
      {["draft", "pending", "scheduled", "approved"].includes(status) && (
        <button className="btn-danger btn-sm" onClick={del} disabled={busy}>ยกเลิก</button>
      )}
      {note && <span className="badge b-danger">{note}</span>}
    </div>
  );
}
