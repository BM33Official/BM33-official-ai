"use client";
// สวิตช์ "เชื่อใจ": เพื่อนกด "กรอกแล้ว" ในแอป = เสร็จเลย ไม่ต้องรอแอดมินยืนยัน
import { useState } from "react";
import { act } from "./api";

export default function TrustSwitch({ id, on: init }: { id: string; on: boolean }) {
  const [on, setOn] = useState(init);
  const [busy, setBusy] = useState(false);
  return (
    <label className="row" style={{ gap: 10, flexWrap: "nowrap", cursor: "pointer" }} title="เปิด = เพื่อนกด “กรอกแล้ว” แล้วนับว่าเสร็จทันที">
      <span className="switch"><input type="checkbox" checked={on} disabled={busy} onChange={async (e) => {
        const v = e.target.checked; setOn(v); setBusy(true);
        const r = await act("form.trust", { id, on: v });
        setBusy(false); if (!r.ok) setOn(!v);
      }} /><span /></span>
      <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>ไม่ต้องตรวจ<br /><span className="hint" style={{ fontWeight: 600 }}>กดกรอกแล้ว = เสร็จเลย</span></span>
    </label>
  );
}
