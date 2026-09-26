"use client";
import { useState } from "react";
import { act } from "./api";

type M = { month: string; label: string; amount: string; due_date: string; note: string };

function nextMonth(list: M[]): string {
  const last = list.at(-1)?.month;
  const d = last ? new Date(Date.UTC(+last.slice(0, 4), +last.slice(5, 7), 1)) : new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function FeeMonths({ months }: { months: M[] }) {
  const [rows, setRows] = useState<M[]>(months);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const upd = (i: number, p: Partial<M>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  async function saveRow(m: M) {
    setBusy(true);
    const r = await act("finance.month.save", { month: m });
    setBusy(false);
    setMsg(r.ok ? `บันทึก ${m.month} แล้ว` : `ไม่สำเร็จ: ${r.error}`);
  }
  async function del(m: M) {
    if (!confirm(`ลบเดือน ${m.month}? (ข้อมูลการจ่ายของเดือนนี้จะไม่แสดง)`)) return;
    await act("finance.month.delete", { month: m.month });
    window.location.reload();
  }
  return (
    <div className="card tablecard editable-table">
      <table>
        <thead><tr><th>เดือน</th><th>ชื่อที่แสดง</th><th>ยอด (บาท)</th><th>ครบกำหนด</th><th>หมายเหตุ</th><th></th></tr></thead>
        <tbody>
          {rows.map((m, i) => (
            <tr key={i}>
              <td><input type="month" value={m.month} onChange={(e) => upd(i, { month: e.target.value })} style={{ width: 150 }} /></td>
              <td><input value={m.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="เช่น ต.ค. 69" style={{ width: 110 }} /></td>
              <td><input type="number" value={m.amount} onChange={(e) => upd(i, { amount: e.target.value })} style={{ width: 100 }} /></td>
              <td><input type="date" value={m.due_date} onChange={(e) => upd(i, { due_date: e.target.value })} style={{ width: 150 }} /></td>
              <td><input value={m.note} onChange={(e) => upd(i, { note: e.target.value })} /></td>
              <td className="row" style={{ flexWrap: "nowrap" }}>
                <button className="btn-sm btn-primary" disabled={busy || !m.month} onClick={() => saveRow(m)}>บันทึก</button>
                <button className="btn-sm btn-ghost" onClick={() => del(m)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ padding: 10 }}>
        <button className="btn-sm" onClick={() => setRows((r) => [...r, { month: nextMonth(r), label: "", amount: r.at(-1)?.amount ?? "", due_date: "", note: "" }])}>+ เพิ่มเดือน</button>
        {msg && <span className="badge b-ok">{msg}</span>}
      </div>
    </div>
  );
}
