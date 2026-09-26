"use client";
import { useMemo, useState } from "react";
import { act } from "./api";

type Cell = "paid" | "yearly" | "waived" | "partial" | "unpaid" | "overdue" | "upcoming";
type Row = { sid: string; nickname: string; name: string; cells: Record<string, Cell> };
const KIND_OF: Record<Cell, string> = { paid: "monthly", yearly: "yearly", waived: "waived", partial: "partial", unpaid: "", overdue: "", upcoming: "" };
const MARK: Record<Cell, string> = { paid: "✓", yearly: "ป", waived: "–", partial: "½", unpaid: "", overdue: "!", upcoming: "" };
const NEXT: Record<string, string> = { "": "monthly", monthly: "waived", waived: "", yearly: "", partial: "monthly" };
const CELL_OF: Record<string, Cell> = { monthly: "paid", yearly: "yearly", waived: "waived", partial: "partial" };

export default function PayGrid({ months, rows: init }: { months: { month: string; label: string; amount: string }[]; rows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(init);
  const [changes, setChanges] = useState<Map<string, string>>(new Map());
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "owe">("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const kindNow = (r: Row, m: string) => changes.get(`${r.sid}|${m}`) ?? KIND_OF[r.cells[m] ?? "unpaid"];
  const cellNow = (r: Row, m: string): Cell => {
    const k = changes.get(`${r.sid}|${m}`);
    if (k === undefined) return r.cells[m] ?? "unpaid";
    return k ? CELL_OF[k] : (init.find((x) => x.sid === r.sid)?.cells[m] === "overdue" ? "overdue" : "unpaid");
  };
  const toggle = (r: Row, m: string) => {
    const next = NEXT[kindNow(r, m)] ?? "";
    const key = `${r.sid}|${m}`;
    const orig = KIND_OF[init.find((x) => x.sid === r.sid)?.cells[m] ?? "unpaid"];
    setChanges((c) => { const n = new Map(c); if (next === orig) n.delete(key); else n.set(key, next); return n; });
  };
  const yearly = (r: Row) => {
    setChanges((c) => { const n = new Map(c); months.forEach((m) => n.set(`${r.sid}|${m.month}`, "yearly")); return n; });
  };
  async function save() {
    setBusy(true); setMsg("");
    const list = Array.from(changes.entries()).map(([k, kind]) => { const [student_id, month] = k.split("|"); return { student_id, month, kind }; });
    const r = await act("finance.pay", { changes: list });
    setBusy(false);
    if (r.ok) { setMsg(`บันทึก ${r.n} ช่องแล้ว ✅ สมาชิกเห็นในแอปทันที`); setTimeout(() => window.location.reload(), 800); }
    else setMsg(`ไม่สำเร็จ: ${r.error}`);
  }

  const shown = rows.filter((r) => (!q || (r.nickname + r.name + r.sid).toLowerCase().includes(q.toLowerCase())) && (only === "all" || months.some((m) => ["unpaid", "overdue"].includes(cellNow(r, m.month)))));
  const stats = useMemo(() => months.map((m) => {
    const paid = rows.filter((r) => ["paid", "yearly", "waived", "partial"].includes(cellNow(r, m.month))).length;
    return { m: m.month, paid, owe: rows.length - paid };
  }), [rows, changes, months]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <input style={{ maxWidth: 240 }} placeholder="ค้นหาชื่อ/รหัส…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="chips">
            <label className={`chip ${only === "all" ? "on" : ""}`}><input type="radio" checked={only === "all"} onChange={() => setOnly("all")} />ทุกคน</label>
            <label className={`chip ${only === "owe" ? "on" : ""}`}><input type="radio" checked={only === "owe"} onChange={() => setOnly("owe")} />เฉพาะคนค้าง</label>
          </div>
        </div>
        <div className="row">
          {changes.size > 0 && <button className="btn-sm btn-ghost" onClick={() => setChanges(new Map())}>ยกเลิก</button>}
          <button className="btn-primary" disabled={busy || changes.size === 0} onClick={save}>บันทึก {changes.size ? `(${changes.size})` : ""}</button>
        </div>
      </div>
      <p className="hint">แตะช่องเพื่อสลับ: ว่าง → ✓ จ่ายแล้ว → – ยกเว้น → ว่าง · ปุ่ม “รายปี” = ลงจ่ายรายปีทุกเดือน (ป) · ช่องแดง = เลยกำหนด</p>
      {msg && <div className="msg msg-ok">{msg}</div>}
      <div className="tablecard" style={{ maxHeight: "70vh", overflow: "auto", padding: 0 }}>
        <table className="paygrid" style={{ minWidth: 200 + months.length * 52 }}>
          <thead>
            <tr><th>นักศึกษา</th>{months.map((m) => <th key={m.month}>{m.label || m.month}<div className="hint" style={{ margin: 0 }}>{m.amount}฿</div></th>)}<th></th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.sid}>
                <td><b>{r.nickname}</b> <span className="hint" style={{ margin: 0 }}>#{Number(r.sid.slice(-3))}</span></td>
                {months.map((m) => {
                  const c = cellNow(r, m.month);
                  return <td key={m.month}><button className={`paycell ${c} ${changes.has(`${r.sid}|${m.month}`) ? "dirty" : ""}`} onClick={() => toggle(r, m.month)} title={c}>{MARK[c]}</button></td>;
                })}
                <td><button className="btn-sm btn-ghost" onClick={() => yearly(r)}>รายปี</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td className="hint">จ่ายแล้ว / ค้าง</td>{stats.map((s) => <td key={s.m} className="hint"><b style={{ color: "var(--ok)" }}>{s.paid}</b>/<b style={{ color: "var(--danger)" }}>{s.owe}</b></td>)}<td /></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
