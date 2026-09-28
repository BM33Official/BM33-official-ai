"use client";
// Red Zone จากเงินรุ่น — เดือนที่เลยกำหนดแล้วยังไม่จ่าย นับรวมกับข้อสอบที่ยังไม่ได้จำ
import { useState } from "react";
import { act } from "./api";

type Row = { sid: string; nickname: string; months: string[]; level: "red" | "close" | "watch" | "safe" };
const LEVEL = { red: ["Red Zone", "b-red"], close: ["ใกล้ Red Zone", "b-orange"], watch: ["เฝ้าระวัง", ""], safe: ["ปลอดภัย", "b-green"] } as const;

export default function RedZoneFees({ on: on0, weight: w0, rows }: { on: boolean; weight: number; rows: Row[] }) {
  const [on, setOn] = useState(on0);
  const [w, setW] = useState(String(w0));
  const [msg, setMsg] = useState("");
  async function save(nextOn = on, nextW = w) {
    const n = Number(nextW);
    const r = await act("finance.settings", { values: { red_zone_fees: nextOn ? "1" : "0", red_zone_fee_weight: Number.isFinite(n) && n > 0 ? String(n) : "1" } });
    setMsg(r.ok ? "บันทึกแล้ว ✓ ฝ่ายวิชาการและแอปเห็นทันที" : `บันทึกไม่ได้: ${r.error ?? ""}`);
  }
  return (
    <div className="card">
      <label className="row" style={{ gap: 12, flexWrap: "nowrap", cursor: "pointer" }}>
        <span className="switch"><input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); save(e.target.checked); }} /><span /></span>
        <span><b>นับเงินรุ่นที่เลยกำหนดใน Red Zone</b><div className="hint">แต่ละเดือนที่เลยวันครบกำหนดแล้วยังไม่จ่าย (รวม “ค้างยกมา”) = ค้าง 1 อย่าง · ค้างรวมกับข้อสอบครบ 3 = Red Zone · จ่ายแล้วหลุดทันที · เพื่อนเห็นเหตุผลเฉพาะของตัวเองในแอป</div></span>
      </label>
      {on && (
        <div className="row" style={{ gap: 10, marginTop: 12 }}>
          <span className="hint">น้ำหนักในการเรียงอันดับ: 1 เดือนที่ค้าง =</span>
          <input style={{ width: 80 }} type="number" min="0.25" step="0.25" value={w} onChange={(e) => setW(e.target.value)} onBlur={() => save()} />
          <span className="hint">ครั้ง (ข้อสอบล่าสุด = 1)</span>
        </div>
      )}
      {msg && <div className="hint" style={{ marginTop: 8 }}>{msg}</div>}
      {rows.length === 0 ? <div className="hint" style={{ marginTop: 14 }}>ไม่มีใครค้าง 🎉</div> : (
        <div className="rzf-grid">
          {rows.map((r) => (
            <span key={r.sid} className={`rzf ${on ? r.level : ""}`} title={`${r.nickname} · ${r.months.join(", ")}${on ? ` · ${LEVEL[r.level][0]}` : ""}`}>
              <b>#{Number(r.sid.slice(-3))}</b> {r.nickname}<small>{r.months.length > 1 ? `${r.months.length} รายการ` : r.months[0]}</small>
            </span>
          ))}
        </div>
      )}
      {on && rows.length > 0 && <div className="legend" style={{ marginTop: 10 }}><span><i style={{ background: "#ff3b30" }} />Red Zone</span><span><i style={{ background: "#ff9500" }} />ใกล้</span><span><i style={{ background: "#ffd60a" }} />เฝ้าระวัง</span><span className="hint">(นับรวมกับข้อสอบที่ยังไม่ได้กรอก)</span></div>}
    </div>
  );
}
