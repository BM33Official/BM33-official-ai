"use client";
import { useState } from "react";
import { act } from "./api";

export function ConfigField({ k, label, value, hint, textarea, placeholder }: { k: string; label: string; value: string; hint?: string; textarea?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value);
  const [msg, setMsg] = useState("");
  async function save() {
    const r = await act("settings.set", { key: k, value: v });
    setMsg(r.ok ? "บันทึกแล้ว ✅" : `ไม่สำเร็จ: ${r.error}`);
    setTimeout(() => setMsg(""), 2500);
  }
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
        {textarea ? <textarea value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} style={{ minHeight: 70 }} /> : <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />}
        <button className="btn-sm" onClick={save} disabled={v === value && !msg}>บันทึก</button>
      </div>
      {hint && <div className="hint">{hint}</div>}
      {msg && <span className="badge b-ok">{msg}</span>}
    </div>
  );
}

export function RolePassword({ role, label, enabled }: { role: "academic" | "finance"; label: string; enabled: boolean }) {
  const [pw, setPw] = useState("");
  const [shown, setShown] = useState("");
  const [msg, setMsg] = useState("");
  async function set(value: string) {
    const r = await act("settings.password", { role, password: value });
    if (r.ok) { setShown(value); setMsg(value ? "ตั้งรหัสแล้ว — ส่งรหัสนี้ให้ฝ่ายนั้น (จะไม่แสดงอีก)" : "ปิดการเข้าใช้ของฝ่ายนี้แล้ว"); setPw(""); }
    else setMsg(`ไม่สำเร็จ: ${r.error}`);
  }
  const gen = () => set(`bm33-${role.slice(0, 3)}-${Math.random().toString(36).slice(2, 8)}`);
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><b>{label}</b><span className={`badge ${enabled ? "b-ok" : "b-muted"}`}>{enabled ? "เปิดใช้อยู่" : "ยังไม่ตั้ง"}</span></div>
      <p className="hint">เข้าที่ /admin/login ด้วยรหัสนี้ → เห็นเฉพาะหน้า{role === "finance" ? "การเงิน" : "วิชาการ"}</p>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="ตั้งรหัสเอง (≥ 8 ตัว)" />
        <button className="btn-sm" disabled={pw.length < 8} onClick={() => set(pw)}>ตั้ง</button>
        <button className="btn-sm btn-primary" onClick={gen}>สุ่มรหัสใหม่</button>
        {enabled && <button className="btn-sm btn-ghost" onClick={() => confirm("ปิดการเข้าใช้ของฝ่ายนี้?") && set("")}>ปิด</button>}
      </div>
      {shown && <div className="msg msg-ok">รหัส: <b style={{ fontFamily: "monospace", fontSize: 16 }}>{shown}</b></div>}
      {msg && <div className="hint">{msg}</div>}
    </div>
  );
}

type C = { student_id: string; nickname: string; role: string; contact_url: string };
export function CommitteeEditor({ rows: init, roster }: { rows: C[]; roster: { sid: string; label: string; nickname: string }[] }) {
  const [rows, setRows] = useState<C[]>(init);
  const [msg, setMsg] = useState("");
  const upd = (i: number, p: Partial<C>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  async function save() {
    const r = await act("settings.committee", { rows });
    setMsg(r.ok ? `บันทึก ${r.n} คนแล้ว ✅` : `ไม่สำเร็จ: ${r.error}`);
  }
  return (
    <div className="card tablecard editable-table">
      <table>
        <thead><tr><th>นักศึกษา</th><th>ชื่อที่แสดง</th><th>ตำแหน่ง</th><th>ลิงก์ LINE (https://line.me/ti/p/~id)</th><th></th></tr></thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={i}>
              <td><select value={c.student_id} onChange={(e) => { const r = roster.find((x) => x.sid === e.target.value); upd(i, { student_id: e.target.value, nickname: c.nickname || r?.nickname || "" }); }} style={{ minWidth: 190 }}>
                <option value="">—</option>{roster.map((r) => <option key={r.sid} value={r.sid}>{r.label}</option>)}
              </select></td>
              <td><input value={c.nickname} onChange={(e) => upd(i, { nickname: e.target.value })} style={{ width: 110 }} /></td>
              <td><input value={c.role} onChange={(e) => upd(i, { role: e.target.value })} style={{ minWidth: 150 }} /></td>
              <td><input value={c.contact_url} onChange={(e) => upd(i, { contact_url: e.target.value })} style={{ minWidth: 260 }} /></td>
              <td><button className="btn-sm btn-ghost" onClick={() => setRows((r) => r.filter((_, k) => k !== i))}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ padding: 10 }}>
        <button className="btn-sm" onClick={() => setRows((r) => [...r, { student_id: "", nickname: "", role: "", contact_url: "" }])}>+ เพิ่ม</button>
        <button className="btn-sm btn-primary" onClick={save}>บันทึกรายชื่อ</button>
        {msg && <span className="badge b-ok">{msg}</span>}
      </div>
      <p className="hint" style={{ padding: "0 10px 8px" }}>ข้อความในกลุ่มจากคนในรายชื่อนี้ = ประกาศทางการ (ระบบดึงขึ้นแอปเอง) · ตำแหน่งที่มีคำว่า “ประธาน” จะเป็นปุ่มแรกในการ์ดติดต่อเมื่อบอทตอบไม่ได้</p>
    </div>
  );
}
