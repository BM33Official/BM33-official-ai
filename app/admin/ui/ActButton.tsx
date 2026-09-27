"use client";
// ปุ่มเรียก action เดียว (+ ยืนยันก่อน) แล้วรีโหลด — ใช้ซ้ำได้ทุกหน้า
import { useState, type ReactNode } from "react";
import { act } from "./api";

export default function ActButton({ action, payload, children, confirmText, className = "btn-sm", done }: {
  action: string; payload?: Record<string, unknown>; children: ReactNode; confirmText?: string; className?: string; done?: (r: Record<string, unknown>) => string;
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
        const m = done?.(r);
        if (m) setMsg(m); else window.location.reload();
      }}>{busy ? "…" : children}</button>
      {msg && <span className="hint">{msg}</span>}
    </span>
  );
}
