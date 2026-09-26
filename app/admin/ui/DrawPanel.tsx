"use client";
import { useMemo, useState } from "react";
import { act } from "./api";
import { isoToLocalInput, localInputToIso } from "./dt";

type P = { sid: string; nickname: string; level: string; misses: number };
type D = { id: string; activity: string; need: number; pool: string[]; selected: string[]; status: string; phase: string; show: string; reveal: string; notified: string };

export default function DrawPanel({ people, draws }: { people: P[]; draws: D[] }) {
  const reds = people.filter((p) => p.level === "red").map((p) => p.sid);
  const [activity, setActivity] = useState("");
  const [need, setNeed] = useState(2);
  const [pool, setPool] = useState<Set<string>>(new Set(reds));
  const [showAt, setShowAt] = useState(() => isoToLocalInput(new Date(Date.now() + 3 * 60_000).toISOString()));
  const [delay, setDelay] = useState(90);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [all, setAll] = useState(false);
  const nick = useMemo(() => new Map(people.map((p) => [p.sid, p.nickname])), [people]);
  const list = all ? people : people.filter((p) => p.misses > 0 || pool.has(p.sid));

  async function create() {
    if (!activity.trim()) { setMsg("ใส่ชื่อกิจกรรมก่อน"); return; }
    if (!pool.size) { setMsg("เลือกรายชื่อใน pool ก่อน"); return; }
    if (!confirm(`สุ่ม ${need} คนจาก ${pool.size} คน สำหรับ "${activity}"?\nหน้าต่างสุ่มจะเด้งในแอปของทุกคนเวลาที่ตั้งไว้`)) return;
    setBusy(true);
    const show = localInputToIso(showAt) || new Date().toISOString();
    const reveal = new Date(new Date(show).getTime() + delay * 1000).toISOString();
    const r = await act("draw.create", { activity, need, pool: Array.from(pool), showAt: show, revealAt: reveal });
    setBusy(false);
    if (r.ok) { setMsg(`สุ่มแล้ว (ผลลับ) — ${(r.selected as string[]).map((s) => nick.get(s) ?? s).join(", ")}`); setTimeout(() => window.location.reload(), 1800); }
    else setMsg(`ไม่สำเร็จ: ${r.error}`);
  }
  async function cancel(id: string) {
    if (!confirm("ยกเลิกการสุ่มนี้? (หน้าต่างในแอปจะหายไป)")) return;
    await act("draw.cancel", { id });
    window.location.reload();
  }

  return (
    <div className="card">
      <b>🎲 สุ่มผู้เข้าร่วมกิจกรรมจาก Red Zone</b>
      <p className="hint">ทุกคนจะเห็นหน้าต่าง “กำลังสุ่ม” ในแอปแบบไม่มีชื่อใคร · เฉพาะคนใน pool ที่เห็นผลของตัวเอง · ข้อความแจ้งผลทาง LINE จะเข้ากล่องรอตรวจให้อนุมัติก่อน</p>
      <div className="grid g2">
        <div className="field"><label>ชื่อกิจกรรม</label><input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="เช่น ช่วยงานต้อนรับน้อง 12 ต.ค." /></div>
        <div className="field"><label>ต้องการกี่คน</label><input type="number" min={1} value={need} onChange={(e) => setNeed(Math.max(1, Number(e.target.value)))} /></div>
        <div className="field"><label>เวลาเริ่มหน้าต่างสุ่มในแอป</label><input type="datetime-local" value={showAt} onChange={(e) => setShowAt(e.target.value)} /></div>
        <div className="field"><label>ลุ้นกี่วินาทีก่อนประกาศผล</label><input type="number" min={10} value={delay} onChange={(e) => setDelay(Math.max(10, Number(e.target.value)))} /></div>
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <label style={{ fontSize: 13, fontWeight: 700 }}>Pool ({pool.size} คน) — ค่าเริ่มต้น = Red Zone สะสม</label>
        <label className="row hint" style={{ margin: 0 }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />แสดงทุกคน</label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 6, maxHeight: 260, overflowY: "auto", marginTop: 8 }}>
        {list.map((p) => (
          <label key={p.sid} className="row" style={{ gap: 8, padding: "7px 10px", borderRadius: 10, background: pool.has(p.sid) ? "#ffe9ea" : "transparent", cursor: "pointer" }}>
            <input type="checkbox" checked={pool.has(p.sid)} onChange={() => setPool((s) => { const n = new Set(s); n.has(p.sid) ? n.delete(p.sid) : n.add(p.sid); return n; })} />
            <span style={{ fontSize: 14 }}>{p.nickname} <span className="hint">{p.level === "red" ? "🔴" : p.level === "close" ? "🟠" : ""} พลาด {p.misses}</span></span>
          </label>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn-primary" disabled={busy} onClick={create}>🎲 สุ่มเลย</button>
        {msg && <span className="badge b-ok">{msg}</span>}
      </div>

      {draws.length > 0 && (
        <table style={{ marginTop: 16 }}>
          <thead><tr><th>กิจกรรม</th><th>สุ่ม</th><th>ผล (เห็นเฉพาะกรรมการ)</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>
            {draws.map((d) => (
              <tr key={d.id}>
                <td><b>{d.activity}</b><div className="hint">เริ่ม {d.show} · ผล {d.reveal}</div></td>
                <td>{d.need}/{d.pool.length}</td>
                <td>{d.selected.map((s) => nick.get(s) ?? s).join(", ")}</td>
                <td><span className={`badge ${d.phase === "revealed" ? "b-ok" : d.phase === "canceled" ? "b-muted" : "b-warn"}`}>{d.phase === "upcoming" ? "รอเริ่ม" : d.phase === "drawing" ? "กำลังสุ่ม" : d.phase === "revealed" ? "ประกาศแล้ว" : "ยกเลิก"}</span>{d.notified && <div className="hint">แจ้ง LINE: {d.notified === "queued" ? "รออนุมัติ" : d.notified}</div>}</td>
                <td>{d.phase !== "canceled" && d.phase !== "revealed" && <button className="btn-sm btn-danger" onClick={() => cancel(d.id)}>ยกเลิก</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
