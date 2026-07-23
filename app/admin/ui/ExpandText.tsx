"use client";
import { useState } from "react";

export default function ExpandText({ text, limit = 90 }: { text: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  const t = text ?? "";
  if (t.length <= limit) return <span className="hint">{t || "-"}</span>;
  return (
    <span className="hint">
      {open ? t : t.slice(0, limit) + "… "}
      <button
        className="btn-sm"
        style={{ padding: "1px 8px", marginLeft: 4, fontSize: 12 }}
        onClick={() => setOpen(!open)}
      >
        {open ? "ย่อ" : "ดูเพิ่ม"}
      </button>
    </span>
  );
}
