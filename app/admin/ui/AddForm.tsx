"use client";
import { useState } from "react";
import { act } from "./api";
import { localInputToIso } from "./dt";

export default function AddForm() {
  const [link, setLink] = useState("");
  const [tabs, setTabs] = useState<string[]>([]);
  const [sheetId, setSheetId] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(true);
  const [form, setForm] = useState({
    name: "", type: "form", response_tab: "", id_column: "",
    done_condition: "", access: "auto" as "auto" | "manual",
    deadline: "", link: "", description: "",
  });

  async function inspect() {
    setBusy(true); setMsg("");
    const r = await act("form.inspect", { link });
    setBusy(false);
    if (!r.ok || r.error) { setMsg(String(r.error || "อ่านชีตไม่ได้")); return; }
    setSheetId(String(r.sheetId)); setTabs((r.tabs as string[]) || []);
    setForm((f) => ({ ...f, response_tab: (r.tabs as string[])?.[0] || "" }));
    setMsg("อ่านชีตได้ เลือกแท็บและคอลัมน์ที่เก็บรหัสนักศึกษา");
  }

  async function save() {
    if (!form.name) { setMsg("ใส่ชื่อฟอร์มก่อน"); return; }
    if (auto && (!form.response_tab || !form.id_column)) { setMsg("เลือกแท็บและคอลัมน์รหัส นศ. ให้ครบ"); return; }
    setBusy(true); setMsg("");
    const payload = {
      name: form.name, type: form.type, done_condition: form.done_condition,
      response_sheet_id: auto ? sheetId : "", response_tab: auto ? form.response_tab : "", id_column: auto ? form.id_column : "",
      access: auto ? "auto" : "manual", deadline_at: localInputToIso(form.deadline), link: form.link, description: form.description,
    };
    const r = await act("form.add", { form: payload });
    setBusy(false);
    if (r.ok) window.location.reload();
    else setMsg(String(r.error || "บันทึกไม่สำเร็จ"));
  }

  const common = (
    <div className="grid g2">
      <div className="field"><label>ชื่อฟอร์ม/งาน (เห็นในแอป)</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="เช่น ฟอร์มเลือกวิชาเลือก" /></div>
      <div className="field"><label>ลิงก์ให้สมาชิกกด (Google Form ฯลฯ)</label><input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://forms.gle/…" /></div>
      <div className="field"><label>เดดไลน์ (เวลาไทย)</label><input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
      <div className="field"><label>คำอธิบายสั้น</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="เช่น กรอกทุกคน ใช้เวลา 2 นาที" /></div>
    </div>
  );

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>เพิ่มฟอร์ม/งานใหม่</h2>
      <div className="chips" style={{ marginBottom: 14 }}>
        <label className={`chip ${auto ? "on" : ""}`}><input type="radio" checked={auto} onChange={() => setAuto(true)} />มีชีตคำตอบ — ตรวจให้อัตโนมัติ</label>
        <label className={`chip ${!auto ? "on" : ""}`}><input type="radio" checked={!auto} onChange={() => setAuto(false)} />ไม่มีชีต — สมาชิกกด “ทำแล้ว” เอง</label>
      </div>
      {common}
      {auto && (
        <>
          <div className="field">
            <label>ลิงก์ Google Sheet ของคำตอบ</label>
            <div className="row">
              <input style={{ flex: 1 }} placeholder="https://docs.google.com/spreadsheets/d/..." value={link} onChange={(e) => setLink(e.target.value)} />
              <button onClick={inspect} disabled={busy || !link}>ตรวจชีต</button>
            </div>
            <div className="hint">ต้องแชร์ชีตให้ service account เป็น Viewer/Editor ก่อน</div>
          </div>
          {tabs.length > 0 && (
            <div className="grid g2">
              <div className="field"><label>แท็บ response</label>
                <select value={form.response_tab} onChange={(e) => setForm({ ...form, response_tab: e.target.value })}>{tabs.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="field"><label>คอลัมน์ที่เก็บรหัสนักศึกษา (ชื่อหัวคอลัมน์)</label>
                <input value={form.id_column} onChange={(e) => setForm({ ...form, id_column: e.target.value })} placeholder="เช่น รหัสนักศึกษา" /></div>
              <div className="field"><label>เงื่อนไข &quot;ทำแล้ว&quot; (ไม่บังคับ)</label>
                <input value={form.done_condition} onChange={(e) => setForm({ ...form, done_condition: e.target.value })} placeholder="ว่าง = มีแถว | หัวคอลัมน์=ค่า" /></div>
              <div className="field"><label>ประเภท</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="form">ฟอร์มทั่วไป</option><option value="payment">การเงิน</option></select></div>
            </div>
          )}
        </>
      )}
      <button className="btn-primary" onClick={save} disabled={busy}>บันทึก & แสดงในแอป</button>
      {msg && <div className="msg msg-ok" style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
