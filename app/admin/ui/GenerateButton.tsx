"use client";
import { useState } from "react";
import { act } from "./api";

export default function GenerateButton({ action, label, payload }: { action: string; label: string; payload?: Record<string, unknown> }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <span className="row">
      <button className="btn-primary" disabled={busy} onClick={async () => {
        setBusy(true); setMsg("");
        const r = await act(action, payload);
        setBusy(false);
        if (r.ok) window.location.reload(); else setMsg(String(r.error ?? "ไม่สำเร็จ"));
      }}>{busy ? "กำลังทำ…" : label}</button>
      {msg && <span className="badge b-danger">{msg}</span>}
    </span>
  );
}
