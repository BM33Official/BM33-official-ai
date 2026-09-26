"use client";
import { useState } from "react";
import { act } from "./api";

type Row = { id: string; name: string; date: string; start: string; end: string; building: string; room: string; block: string; note: string; status: string };

export default function UniExamTable({ rows: init }: { rows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(init);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const upd = (id: string, p: Partial<Row>) => { setRows((r) => r.map((x) => (x.id === id ? { ...x, ...p } : x))); setDirty((d) => new Set(d).add(id)); };
  async function save() {
    const changed = rows.filter((r) => dirty.has(r.id)).map((r) => (r.id.startsWith("new-") ? { ...r, id: "" } : r));
    const res = await act("exam.save", { rows: changed });
    setMsg(res.ok ? "บันทึกแล้ว ✅" : `ไม่สำเร็จ: ${res.error}`);
    if (res.ok) setTimeout(() => window.location.reload(), 600);
  }
  return (
    <div>
      <div className="card tablecard editable-table" style={{ padding: 4 }}>
        <table style={{ minWidth: 900 }}>
          <thead><tr><th>ชื่อการสอบ</th><th>วันที่</th><th>เริ่ม</th><th>จบ</th><th>ตึก</th><th>ห้อง</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>
            {rows.filter((r) => r.status !== "deleted").map((r) => (
              <tr key={r.id} style={dirty.has(r.id) ? { background: "#f3f5ff" } : undefined}>
                <td><input value={r.name} onChange={(e) => upd(r.id, { name: e.target.value })} style={{ minWidth: 200 }} /></td>
                <td><input type="date" value={r.date} onChange={(e) => upd(r.id, { date: e.target.value })} style={{ width: 140 }} /></td>
                <td><input type="time" value={r.start} onChange={(e) => upd(r.id, { start: e.target.value })} style={{ width: 96 }} /></td>
                <td><input type="time" value={r.end} onChange={(e) => upd(r.id, { end: e.target.value })} style={{ width: 96 }} /></td>
                <td><input value={r.building} onChange={(e) => upd(r.id, { building: e.target.value })} style={{ width: 120 }} /></td>
                <td><input value={r.room} onChange={(e) => upd(r.id, { room: e.target.value })} style={{ width: 90 }} /></td>
                <td><select value={r.status} onChange={(e) => upd(r.id, { status: e.target.value })}><option value="live">แสดง</option><option value="draft">ร่าง</option><option value="hidden">ซ่อน</option></select></td>
                <td><button className="btn-sm btn-ghost" onClick={() => upd(r.id, { status: "deleted" })}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn-sm" onClick={() => { const id = `new-${Date.now()}`; setRows((r) => [...r, { id, name: "", date: "", start: "08:00", end: "", building: "", room: "", block: "", note: "", status: "live" }]); setDirty((d) => new Set(d).add(id)); }}>+ เพิ่มการสอบ</button>
        {dirty.size > 0 && <button className="btn-primary btn-sm" onClick={save}>บันทึก {dirty.size} รายการ</button>}
        {msg && <span className="badge b-ok">{msg}</span>}
      </div>
    </div>
  );
}
