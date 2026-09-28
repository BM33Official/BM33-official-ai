"use client";
// Red Zone จากเงินรุ่น — เดือนที่เลยกำหนดแล้วยังไม่จ่าย นับรวมกับข้อสอบที่ยังไม่ได้จำ
import { useState } from "react";
import { Flame } from "lucide-react";
import { act } from "./api";

type Row = { sid: string; nickname: string; months: string[]; level: "red" | "close" | "watch" | "safe" };
const LEVEL = { red: ["Red Zone", "b-red"], close: ["ใกล้ Red Zone", "b-orange"], watch: ["เฝ้าระวัง", ""], safe: ["ปลอดภัย", "b-green"] } as const;

export default function RedZoneFees({ on: on0, weight: w0, rows }: { on: boolean; weight: number; rows: Row[] }) {
  const [on, setOn] = useState(on0);
  const [w, setW] = useState(String(w0));
  const [msg, setMsg] = useState("");
  async function save(nextOn = on, nextW = w) {
    const n = Number(nextW);
    const rs = await Promise.all([
      act("finance.setting", { key: "red_zone_fees", value: nextOn ? "1" : "0" }),
      act("finance.setting", { key: "red_zone_fee_weight", value: Number.isFinite(n) && n > 0 ? String(n) : "1" }),
    ]);
    setMsg(rs.every((r) => r.ok) ? "บันทึกแล้ว ✓ (อัปเดตในแอปภายในไม่กี่วินาที)" : "บันทึกไม่ได้");
  }
  return (
    <div className="card">
      <label className="row" style={{ gap: 12, flexWrap: "nowrap", cursor: "pointer" }}>
        <span className="switch"><input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); save(e.target.checked); }} /><span /></span>
        <span><b>นับเงินรุ่นที่เลยกำหนดใน Red Zone</b><div className="hint">แต่ละเดือนที่เลยวันครบกำหนดแล้วยังไม่จ่าย = คะแนน Red Zone เพิ่ม · จ่ายแล้ว/ยืนยันสลิปแล้ว หลุดทันที · เพื่อนเห็นเหตุผลเฉพาะของตัวเองในแอป</div></span>
      </label>
      {on && (
        <div className="row" style={{ gap: 10, marginTop: 12 }}>
          <span className="hint">1 เดือนที่ค้าง นับเท่ากับไม่ได้จำข้อสอบ</span>
          <input style={{ width: 80 }} type="number" min="0.25" step="0.25" value={w} onChange={(e) => setW(e.target.value)} onBlur={() => save()} />
          <span className="hint">ครั้ง (ข้อสอบล่าสุด = 1)</span>
        </div>
      )}
      {msg && <div className="hint" style={{ marginTop: 8 }}>{msg}</div>}
      <div className="list" style={{ marginTop: 14, boxShadow: "none", background: "var(--fill)" }}>
        {rows.length === 0 && <div className="li"><div className="li-b"><b>ไม่มีใครเลยกำหนด 🎉</b></div></div>}
        {rows.map((r) => (
          <div key={r.sid} className="li">
            <span className="ic c-red"><Flame strokeWidth={2.4} /></span>
            <div className="li-b"><b>{r.nickname} <span className="hint">#{Number(r.sid.slice(-3))}</span></b><small>เลยกำหนด {r.months.length} เดือน · {r.months.join(", ")}</small></div>
            {on && <span className={`badge ${LEVEL[r.level][1]}`}>{LEVEL[r.level][0]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
