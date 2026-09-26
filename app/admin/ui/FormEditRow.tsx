"use client";
import { useState } from "react";
import { act } from "./api";
import { isoToLocalInput, localInputToIso } from "./dt";

export default function FormEditRow({ id, deadline, link, description, status }: { id: string; deadline: string; link: string; description: string; status: string }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ deadline: isoToLocalInput(deadline), link, description });
  const [msg, setMsg] = useState("");
  async function save(patch: Record<string, string>) {
    const r = await act("form.update", { id, patch });
    setMsg(r.ok ? "บันทึกแล้ว" : `ไม่สำเร็จ: ${r.error}`);
    if (r.ok) setTimeout(() => window.location.reload(), 500);
  }
  return (
    <>
      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <button className="btn-sm" onClick={() => setOpen((v) => !v)}>{open ? "ปิด" : "แก้ไข"}</button>
        {status === "closed" ? <button className="btn-sm" onClick={() => save({ status: "open" })}>เปิดอีกครั้ง</button> : <button className="btn-sm btn-ghost" onClick={() => save({ status: "closed" })}>ปิดฟอร์ม</button>}
      </div>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, minWidth: 280 }}>
          <input type="datetime-local" value={d.deadline} onChange={(e) => setD({ ...d, deadline: e.target.value })} />
          <input value={d.link} onChange={(e) => setD({ ...d, link: e.target.value })} placeholder="ลิงก์ฟอร์ม" />
          <input value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="คำอธิบาย" />
          <button className="btn-sm btn-primary" onClick={() => save({ deadline_at: localInputToIso(d.deadline), link: d.link, description: d.description })}>บันทึก</button>
          {msg && <span className="hint">{msg}</span>}
        </div>
      )}
    </>
  );
}
