"use client";
import { useState } from "react";
import { act } from "./api";

export type Row = { id: string; date: string; start: string; end: string; subject: string; topic: string; lecturer: string; building: string; room: string; kind: string; status: string; block?: string; note?: string };
const KINDS: [string, string][] = [["lecture", "บรรยาย"], ["lab", "แล็บ"], ["exam", "สอบ"], ["activity", "กิจกรรม"], ["other", "อื่น ๆ"]];

export default function ScheduleTable({ rows: init, uploadId, allowAdd, block }: { rows: Row[]; uploadId?: string; allowAdd?: boolean; block?: string }) {
  const [rows, setRows] = useState<Row[]>(init);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const upd = (id: string, p: Partial<Row>) => { setRows((r) => r.map((x) => (x.id === id ? { ...x, ...p } : x))); setDirty((d) => new Set(d).add(id)); };

  async function save() {
    setBusy(true); setMsg("");
    const changed = rows.filter((r) => dirty.has(r.id)).map((r) => (r.id.startsWith("new-") ? { ...r, id: "" } : r));
    const res = await act("schedule.save", { rows: changed });
    setBusy(false);
    if (res.ok) { setMsg(`บันทึก ${res.n} แถวแล้ว`); setDirty(new Set()); setTimeout(() => window.location.reload(), 700); } else setMsg(`ไม่สำเร็จ: ${res.error}`);
  }
  async function publish() {
    if (dirty.size) await save();
    setBusy(true);
    const r = await act("schedule.publish", { uploadId });
    setBusy(false);
    if (r.ok) { setMsg(`เผยแพร่ ${r.n} คาบแล้ว ✅`); setTimeout(() => window.location.reload(), 700); } else setMsg(`ไม่สำเร็จ: ${r.error}`);
  }
  async function discard() {
    if (!confirm("ทิ้งผลการอ่านไฟล์นี้ทั้งหมด?")) return;
    await act("schedule.discard", { uploadId });
    window.location.reload();
  }
  const add = () => {
    const id = `new-${Date.now()}`;
    setRows((r) => [...r, { id, date: "", start: "", end: "", subject: "", topic: "", lecturer: "", building: "", room: "", kind: "lecture", status: uploadId ? "draft" : "live", block: block ?? "" }]);
    setDirty((d) => new Set(d).add(id));
  };

  return (
    <div>
      <div className="card tablecard editable-table" style={{ padding: 4 }}>
        <table style={{ minWidth: 980 }}>
          <thead><tr><th>วันที่</th><th>เริ่ม</th><th>จบ</th><th>วิชา</th><th>หัวข้อ</th><th>อาจารย์</th><th>ตึก</th><th>ห้อง</th><th>ประเภท</th><th></th></tr></thead>
          <tbody>
            {rows.filter((r) => r.status !== "deleted").map((r) => (
              <tr key={r.id} style={dirty.has(r.id) ? { background: "#f3f5ff" } : undefined}>
                <td><input type="date" value={r.date} onChange={(e) => upd(r.id, { date: e.target.value })} style={{ width: 140 }} /></td>
                <td><input type="time" value={r.start} onChange={(e) => upd(r.id, { start: e.target.value })} style={{ width: 96 }} /></td>
                <td><input type="time" value={r.end} onChange={(e) => upd(r.id, { end: e.target.value })} style={{ width: 96 }} /></td>
                <td><input value={r.subject} onChange={(e) => upd(r.id, { subject: e.target.value })} style={{ minWidth: 150 }} /></td>
                <td><input value={r.topic} onChange={(e) => upd(r.id, { topic: e.target.value })} style={{ minWidth: 150 }} /></td>
                <td><input value={r.lecturer} onChange={(e) => upd(r.id, { lecturer: e.target.value })} style={{ width: 120 }} /></td>
                <td><input value={r.building} onChange={(e) => upd(r.id, { building: e.target.value })} style={{ width: 110 }} /></td>
                <td><input value={r.room} onChange={(e) => upd(r.id, { room: e.target.value })} style={{ width: 80 }} /></td>
                <td><select value={r.kind} onChange={(e) => upd(r.id, { kind: e.target.value })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                <td><button className="btn-sm btn-ghost" title="ลบ" onClick={() => upd(r.id, { status: "deleted" })}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        {allowAdd && <button className="btn-sm" onClick={add}>+ เพิ่มคาบ</button>}
        {dirty.size > 0 && <button className="btn-primary btn-sm" onClick={save} disabled={busy}>บันทึก {dirty.size} แถว</button>}
        {uploadId && <button className="btn-green btn-sm" onClick={publish} disabled={busy}>✅ เผยแพร่ขึ้นแอป</button>}
        {uploadId && <button className="btn-danger btn-sm" onClick={discard} disabled={busy}>ทิ้ง</button>}
        {msg && <span className="badge b-ok">{msg}</span>}
      </div>
    </div>
  );
}
