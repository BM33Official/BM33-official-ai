"use client";
// เงินรุ่นรายเดือน: วงแหวน + ช่องละ 1 คน (แตะ = สลับจ่ายแล้ว/ยังไม่จ่าย) + ปุ่มเตือนคนที่ยังไม่จ่าย
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Save, Undo2 } from "lucide-react";
import { act } from "./api";
import { Ring } from "./kit";

type Cell = "paid" | "yearly" | "waived" | "partial" | "unpaid" | "overdue" | "upcoming";
type Row = { sid: string; nickname: string; cells: Record<string, Cell> };
type M = { month: string; label: string; amount: string; due_date: string };
const PAID: Cell[] = ["paid", "yearly", "waived", "partial"];

export default function FinanceBoard({ months, rows, initial }: { months: M[]; rows: Row[]; initial: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(initial);
  const [changes, setChanges] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const m = months.find((x) => x.month === month);

  const isPaid = (r: Row, mo: string) => {
    const k = changes.get(`${r.sid}|${mo}`);
    return k === undefined ? PAID.includes(r.cells[mo]) : k !== "";
  };
  const toggle = (r: Row) => {
    const key = `${r.sid}|${month}`;
    const orig = PAID.includes(r.cells[month]);
    const now = isPaid(r, month);
    setChanges((c) => { const n = new Map(c); if (!now === orig) n.delete(key); else n.set(key, now ? "" : "monthly"); return n; });
  };
  const stats = useMemo(() => {
    const paid = rows.filter((r) => isPaid(r, month)).length;
    return { paid, owe: rows.length - paid, baht: paid * (Number(m?.amount) || 0) };
  }, [rows, month, changes]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true); setMsg(null);
    const list = Array.from(changes.entries()).map(([k, kind]) => { const [student_id, mo] = k.split("|"); return { student_id, month: mo, kind }; });
    const r = await act("finance.pay", { changes: list });
    setBusy(false);
    if (r.ok) { setMsg({ ok: true, t: `บันทึก ${r.n} คนแล้ว — เพื่อนและฝ่ายวิชาการเห็นทันที` }); setChanges(new Map()); router.refresh(); }
    else setMsg({ ok: false, t: `ไม่สำเร็จ: ${r.error}` });
  }
  async function remind() {
    if (!confirm(`ส่งข้อความเตือนถึงคนที่ยังไม่จ่าย ${m?.label || month} ตอนนี้เลย?\n(แต่ละคนเห็นยอดของตัวเอง · ส่งทันที ไม่ต้องรออนุมัติ)`)) return;
    setBusy(true); setMsg(null);
    const r = await act("finance.remindUnpaid", { month });
    setBusy(false);
    if (!r.ok) setMsg({ ok: false, t: `ไม่สำเร็จ: ${r.error}` });
    else if (!r.count) setMsg({ ok: true, t: "ทุกคนที่ลงทะเบียนจ่ายครบแล้ว 🎉" });
    else setMsg({ ok: true, t: `ส่งแล้ว ${r.count} คน ✓${Number(r.unreg) ? ` · อีก ${r.unreg} คนยังไม่ลงทะเบียน (ส่งไม่ได้)` : ""}` });
  }

  if (!months.length) return <div className="card"><span className="hint">ตั้งยอดเดือนแรกก่อน (ด้านล่าง “ตั้งยอดแต่ละเดือน”)</span></div>;
  return (
    <div className="card" data-dirty={changes.size ? "1" : "0"}>
      <div className="seg" style={{ overflowX: "auto", flexWrap: "nowrap", maxWidth: "100%" }}>
        {months.map((x) => <button key={x.month} className={x.month === month ? "on" : ""} onClick={() => setMonth(x.month)}>{x.label || x.month}</button>)}
      </div>
      <div className="row" style={{ gap: 22, alignItems: "center" }}>
        <Ring value={stats.paid} max={rows.length || 1} size={128} stroke={13} tone={stats.owe === 0 ? "green" : "teal"} label={stats.paid} sub={`จาก ${rows.length} คน`} />
        <div className="stack" style={{ gap: 6, flex: 1, minWidth: 200 }}>
          <div><span className="stat" style={{ color: "var(--green-ink)" }}>{stats.baht.toLocaleString()}</span> <span className="muted">บาท รับแล้ว</span></div>
          <div><span className="stat" style={{ color: stats.owe ? "var(--red-ink)" : undefined }}>{stats.owe}</span> <span className="muted">คนยังไม่จ่าย · เดือนละ {m?.amount || "?"} บาท{m?.due_date ? ` · ครบกำหนด ${m.due_date}` : ""}</span></div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn-primary" disabled={busy || stats.owe === 0} onClick={remind}><Bell size={16} /> เตือนคนที่ยังไม่จ่าย</button>
          </div>
        </div>
      </div>
      <div className="dots" style={{ marginTop: 18 }}>
        {rows.map((r) => {
          const p = isPaid(r, month);
          const c = r.cells[month];
          const dirty = changes.has(`${r.sid}|${month}`);
          return <button key={r.sid} className={`d ${p ? (c === "yearly" && !dirty ? "blue" : "ok") : c === "overdue" ? "bad" : "none"} ${dirty ? "ring-red" : ""}`}
            title={`${r.nickname} · ${p ? (c === "yearly" ? "จ่ายรายปี" : "จ่ายแล้ว") : c === "overdue" ? "เลยกำหนด" : "ยังไม่จ่าย"}`} onClick={() => toggle(r)}>{Number(r.sid.slice(-3))}</button>;
        })}
      </div>
      <div className="row between" style={{ marginTop: 14 }}>
        <div className="legend"><span><i style={{ background: "#34c759" }} />จ่ายแล้ว</span><span><i style={{ background: "#007aff" }} />รายปี</span><span><i style={{ background: "#ff3b30" }} />เลยกำหนด</span><span><i style={{ background: "#e5e5ea" }} />ยังไม่จ่าย</span></div>
        {changes.size > 0 && (
          <div className="row">
            <button className="btn-sm btn-ghost" onClick={() => setChanges(new Map())}><Undo2 size={15} /> ยกเลิก</button>
            <button className="btn-green" disabled={busy} onClick={save}><Save size={16} /> บันทึก {changes.size} คน</button>
          </div>
        )}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>แตะเลขเพื่อสลับ “จ่ายแล้ว ↔ ยังไม่จ่าย” แล้วกดบันทึก · ส่วนใหญ่ไม่ต้องแตะเอง: เพื่อนส่งสลิป → AI ตรวจ → ขึ้นด้านบนให้กดยืนยัน</p>
      {msg && <div className={`msg ${msg.ok ? "msg-ok" : "msg-err"}`}>{msg.t}</div>}
    </div>
  );
}
