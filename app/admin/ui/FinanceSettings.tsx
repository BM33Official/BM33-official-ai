"use client";
import { useState } from "react";
import { act } from "./api";

export default function FinanceSettings({ cfg }: { cfg: Record<string, string> }) {
  const [v, setV] = useState({
    payment_info: cfg.payment_info ?? "", payment_link: cfg.payment_link ?? "",
    payment_account_name: cfg.payment_account_name ?? "", payment_account_no: cfg.payment_account_no ?? "",
    slip_auto_approve: cfg.slip_auto_approve === "1",
  });
  const [msg, setMsg] = useState("");
  async function save() {
    const rs = await Promise.all(Object.entries(v).map(([key, value]) => act("finance.setting", { key, value: typeof value === "boolean" ? (value ? "1" : "") : value })));
    setMsg(rs.every((r) => r.ok) ? "บันทึกแล้ว ✅" : "บันทึกไม่ได้บางช่อง");
  }
  return (
    <div className="card">
      <div className="grid g2">
        <div className="field"><label>ชื่อบัญชีผู้รับ (AI ใช้เช็กสลิป)</label><input value={v.payment_account_name} onChange={(e) => setV({ ...v, payment_account_name: e.target.value })} placeholder="เช่น นายสมชาย ใจดี" /></div>
        <div className="field"><label>เลขบัญชี / พร้อมเพย์</label><input value={v.payment_account_no} onChange={(e) => setV({ ...v, payment_account_no: e.target.value })} placeholder="เช่น 0812345678" /></div>
      </div>
      <div className="field"><label>วิธีจ่าย (ขึ้นในแอปให้คนที่ยังค้าง)</label><textarea value={v.payment_info} onChange={(e) => setV({ ...v, payment_info: e.target.value })} placeholder="เช่น โอนพร้อมเพย์ 08x-xxx-xxxx (ชื่อ …) แล้วส่งสลิปในแอป" /></div>
      <div className="field"><label>ลิงก์ QR / ฟอร์มแจ้งโอน (ถ้ามี)</label><input value={v.payment_link} onChange={(e) => setV({ ...v, payment_link: e.target.value })} placeholder="https://…" /></div>
      <label className="row" style={{ gap: 12, margin: "6px 0 14px", flexWrap: "nowrap", cursor: "pointer" }}>
        <span className="switch"><input type="checkbox" checked={v.slip_auto_approve} onChange={(e) => setV({ ...v, slip_auto_approve: e.target.checked })} /><span /></span>
        <span><b>ยืนยันสลิปอัตโนมัติ</b><div className="hint">สลิปที่ยอด ผู้รับ วันที่ ตรงทุกข้อ และไม่ซ้ำ → ลงว่าจ่ายแล้วทันทีโดยไม่ต้องรอ (ต้องใส่ชื่อบัญชีผู้รับก่อน · ที่ไม่ตรงยังรอคุณตรวจเหมือนเดิม)</div></span>
      </label>
      <button className="btn-primary" onClick={save}>บันทึก</button>
      {msg && <span className="badge b-green" style={{ marginLeft: 8 }}>{msg}</span>}
    </div>
  );
}
