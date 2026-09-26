"use client";
import { useState } from "react";
import { act } from "./api";

export default function FinanceSettings({ info, link, sheet }: { info: string; link: string; sheet: string }) {
  const [i, setI] = useState(info);
  const [l, setL] = useState(link);
  const [msg, setMsg] = useState("");
  async function save() {
    const a = await act("finance.setting", { key: "payment_info", value: i });
    const b = await act("finance.setting", { key: "payment_link", value: l });
    setMsg(a.ok && b.ok ? "บันทึกแล้ว ✅ ขึ้นในแอปแล้ว" : "บันทึกไม่ได้");
  }
  return (
    <div className="card">
      <b>วิธีจ่ายเงิน (แสดงในแอปให้คนที่ยังค้าง)</b>
      <div className="field" style={{ marginTop: 10 }}><label>ข้อความ (เลขบัญชี/พร้อมเพย์/ขั้นตอนแจ้งโอน)</label><textarea value={i} onChange={(e) => setI(e.target.value)} placeholder="เช่น โอนพร้อมเพย์ 08x-xxx-xxxx (ชื่อบัญชี …) แล้วส่งสลิปในฟอร์ม" /></div>
      <div className="field"><label>ลิงก์ฟอร์มแจ้งโอน / QR (ถ้ามี)</label><input value={l} onChange={(e) => setL(e.target.value)} placeholder="https://…" /></div>
      <button className="btn-primary" onClick={save}>บันทึก</button>
      {msg && <span className="badge b-ok" style={{ marginLeft: 8 }}>{msg}</span>}
      {sheet && <p className="hint" style={{ marginTop: 10 }}>ชีตของฝ่ายการเงินที่เชื่อมไว้: {sheet}</p>}
    </div>
  );
}
