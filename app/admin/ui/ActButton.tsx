"use client";
// ปุ่มเรียก action เดียว (+ ยืนยันก่อน) แล้วรีโหลด — ใช้ซ้ำได้ทุกหน้า
import { useState, type ReactNode } from "react";
import { act } from "./api";

// doneText: ข้อความหลังสำเร็จ (ใส่ {code} {n} {count} ได้) — ว่าง = รีโหลดหน้า · ต้องเป็น string (ส่งจาก server component ได้)
export default function ActButton({ action, payload, children, confirmText, className = "btn-sm", doneText }: {
  action: string; payload?: Record<string, unknown>; children: ReactNode; confirmText?: string; className?: string; doneText?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <span className="row" style={{ gap: 8 }}>
      <button className={className} disabled={busy} onClick={async () => {
        if (confirmText && !confirm(confirmText)) return;
        setBusy(true); setMsg("");
        const r = await act(action, payload);
        setBusy(false);
        if (!r.ok) { setMsg(String(r.error ?? "ไม่สำเร็จ")); return; }
        if (doneText) setMsg(doneText.replace(/\{(\w+)\}/g, (_, k) => String(r[k] ?? ""))); else window.location.reload();
      }}>{busy ? "…" : children}</button>
      {msg && <span className="hint">{msg}</span>}
    </span>
  );
}
