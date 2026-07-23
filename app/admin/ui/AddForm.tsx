"use client";
import { useState } from "react";
import { act } from "./api";

export default function AddForm() {
  const [link, setLink] = useState("");
  const [tabs, setTabs] = useState<string[]>([]);
  const [sheetId, setSheetId] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "", type: "form", response_tab: "", id_column: "",
    done_condition: "", access: "auto" as "auto" | "manual",
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
    if (!form.name || !form.response_tab || !form.id_column) { setMsg("กรอกชื่อ, แท็บ, และคอลัมน์รหัส นศ. ให้ครบ"); return; }
    setBusy(true); setMsg("");
    const r = await act("form.add", { form: { ...form, response_sheet_id: sheetId } });
    setBusy(false);
    if (r.ok) window.location.reload();
    else setMsg(String(r.error || "บันทึกไม่สำเร็จ"));
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>เพิ่มฟอร์มใหม่</h2>
      <div className="field">
        <label>ลิงก์ Google Sheet ของ response</label>
        <div className="row">
          <input style={{ flex: 1 }} placeholder="https://docs.google.com/spreadsheets/d/..." value={link} onChange={(e) => setLink(e.target.value)} />
          <button onClick={inspect} disabled={busy || !link}>ตรวจชีต</button>
        </div>
        <div className="hint">ต้องแชร์ชีตให้ service account เป็น Viewer/Editor ก่อน</div>
      </div>

      {tabs.length > 0 && (
        <>
          <div className="grid g2">
            <div className="field"><label>ชื่อฟอร์ม (โชว์ในระบบ)</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="เช่น ฟอร์มเก็บเงินรุ่น ก.ค." /></div>
            <div className="field"><label>ประเภท</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="form">ฟอร์มทั่วไป</option><option value="payment">การเงิน</option></select></div>
            <div className="field"><label>แท็บ response</label>
              <select value={form.response_tab} onChange={(e) => setForm({ ...form, response_tab: e.target.value })}>
                {tabs.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            <div className="field"><label>คอลัมน์ที่เก็บรหัสนักศึกษา (ชื่อหัวคอลัมน์)</label>
              <input value={form.id_column} onChange={(e) => setForm({ ...form, id_column: e.target.value })} placeholder="เช่น รหัสนักศึกษา" /></div>
            <div className="field"><label>เงื่อนไข &quot;ทำแล้ว&quot; (ไม่บังคับ)</label>
              <input value={form.done_condition} onChange={(e) => setForm({ ...form, done_condition: e.target.value })} placeholder="ว่าง = มีแถว | หัวคอลัมน์=ค่า" />
              <div className="hint">ว่าง = แค่มีแถวก็ถือว่าทำแล้ว · หรือ &quot;สถานะ=จ่ายแล้ว&quot;</div></div>
            <div className="field"><label>การตรวจสอบ</label>
              <select value={form.access} onChange={(e) => setForm({ ...form, access: e.target.value as "auto" | "manual" })}>
                <option value="auto">อัตโนมัติ (อ่านชีตได้)</option><option value="manual">แมนนวล (อ่านชีตไม่ได้)</option></select></div>
          </div>
          <button className="btn-primary" onClick={save} disabled={busy}>บันทึกฟอร์ม</button>
        </>
      )}
      {msg && <div className="msg msg-ok" style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
