"use client";
// สวิตช์หลัก Red Zone — ปิด = ทุกคน (แอป + control center) อยู่ Green Zone · ข้อมูลข้อสอบ/เงินรุ่นยังเก็บตามปกติ
import { useState } from "react";
import { useRouter } from "next/navigation";
import { act } from "./api";

export default function RedZoneSwitch({ on: init, canEdit }: { on: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(init);
  const [busy, setBusy] = useState(false);
  return (
    <label className="row" style={{ gap: 10, flexWrap: "nowrap", cursor: canEdit ? "pointer" : "default" }} title={canEdit ? "" : "เฉพาะแอดมินเปิด/ปิดได้"}>
      <span className="switch"><input type="checkbox" checked={on} disabled={busy || !canEdit} onChange={async (e) => {
        const v = e.target.checked;
        if (v && !confirm("เปิด Red Zone? เพื่อน ๆ จะเห็นระดับของตัวเองในแอปทันที (นับข้อสอบที่ยังไม่ได้กรอก + เงินรุ่นที่เลยกำหนด)")) return;
        setOn(v); setBusy(true);
        const r = await act("settings.set", { key: "red_zone_enabled", value: v ? "1" : "0" });
        setBusy(false);
        if (!r.ok) setOn(!v); else router.refresh();
      }} /><span /></span>
      <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{on ? "Red Zone เปิดอยู่" : "ปิด Red Zone (ทุกคน Green)"}<br /><span className="hint" style={{ fontWeight: 600 }}>{on ? "เพื่อนเห็นระดับของตัวเอง" : "เปิดเมื่อพร้อมใช้"}</span></span>
    </label>
  );
}
