"use client";
// ติ๊กเองทีละคน — รายชื่อเดียว: "ยังไม่ได้กรอก" (ใช้ทั้งนับ Red Zone และส่งเตือน)
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { act } from "./api";

type Row = { student_id: string; nickname: string; name: string };

export default function MarkGrid({ examId, examName, rows, initial, accepted = [], onSaved }: {
  examId: string; examName: string; rows: Row[]; initial: string[]; accepted?: string[]; onSaved?: () => void;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(new Set(initial));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const base = useMemo(() => [...initial].sort().join(","), [initial]);
  const dirty = [...checked].sort().join(",") !== base;
  const acc = useMemo(() => new Set(accepted), [accepted]);

  // ข้อมูลใหม่จากเซิร์ฟเวอร์ (อีกคนแก้ / หลังบันทึก) -> ตามให้ ถ้าเรายังไม่ได้แก้ค้างไว้
  useEffect(() => { if (!dirty) setChecked(new Set(initial)); }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => {
    const n = new Set(checked);
    if (n.has(id)) n.delete(id); else n.add(id);
    setChecked(n);
  };
  async function save() {
    setBusy(true); setMsg("");
    const r = await act("academic.setMarks", { examId, ids: Array.from(checked) });
    setBusy(false);
    setMsg(r.ok ? `บันทึกแล้ว ✓ ยังไม่ได้กรอก ${checked.size} คน — Red Zone และปุ่มส่งเตือนด้านล่างอัปเดตแล้ว` : `บันทึกไม่สำเร็จ: ${r.error ?? ""}`);
    if (r.ok) { router.refresh(); onSaved?.(); }
  }
  const shown = rows.filter((r) => !q || (r.nickname + r.name + r.student_id).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="card" data-dirty={dirty ? "1" : "0"}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>ใครยังไม่ได้กรอก — {examName}</h3>
        <span className="badge b-red">ยังไม่ได้กรอก {checked.size}</span>
      </div>
      <p className="hint">ติ๊กคนที่ <b>ยังไม่ได้กรอก</b> ข้อที่ตัวเองรับผิดชอบลงเอกสาร (ไม่ติ๊ก = กรอกแล้ว) · 1 ข้อสอบที่ค้าง = ค้าง 1 อย่างใน Red Zone · ป้าย “ยอมโดน” = เพื่อนกดยอมรับในแอปแล้ว ระบบจะไม่ตามเตือน</p>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <input placeholder="ค้นหาชื่อ/ชื่อเล่น/รหัส…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
        <button className="btn-sm btn-ghost" onClick={() => setChecked(new Set())}>ล้างทั้งหมด</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6, maxHeight: 420, overflowY: "auto" }}>
        {shown.map((r) => {
          const on = checked.has(r.student_id);
          return (
            <label key={r.student_id} className="row" style={{ gap: 8, padding: "8px 10px", borderRadius: 10, cursor: "pointer", background: on ? "#ffe5e5" : "transparent", transition: "background .12s ease", flexWrap: "nowrap" }}>
              <input type="checkbox" checked={on} onChange={() => toggle(r.student_id)} />
              <span style={{ fontSize: 14, flex: 1 }}>{r.nickname} <span className="hint">#{r.student_id.slice(-3)}</span></span>
              {on && acc.has(r.student_id) && <span className="badge" style={{ fontSize: 11 }}>ยอมโดน</span>}
            </label>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn-primary" onClick={save} disabled={busy || !dirty}>{busy ? "กำลังบันทึก…" : dirty ? "บันทึก" : "บันทึกแล้ว"}</button>
        {dirty && <button className="btn-sm btn-ghost" onClick={() => setChecked(new Set(initial))}>ยกเลิกที่แก้</button>}
        {msg && <span className="hint">{msg}</span>}
      </div>
    </div>
  );
}
