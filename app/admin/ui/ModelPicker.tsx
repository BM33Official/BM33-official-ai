"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { act } from "./api";

export default function ModelPicker({ current }: { current: string }) {
  const [models, setModels] = useState<string[]>([]);
  const [active, setActive] = useState("");
  const [val, setVal] = useState(current);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    act("ai.models").then((r) => { if (r.ok) { setModels(r.models as string[]); setActive(String(r.active)); } });
  }, []);
  async function save() {
    const r = await act("settings.set", { key: "gemini_model", value: val });
    setMsg(r.ok ? "บันทึกแล้ว ✅" : `ไม่สำเร็จ: ${r.error}`);
  }
  async function refresh() {
    const r = await act("ai.refresh");
    setMsg(r.ok ? "อ่านชีตใหม่แล้ว ✅" : "ไม่สำเร็จ");
  }
  return (
    <div className="card">
      <div className="label">โมเดลที่ใช้ตอนนี้</div>
      <div style={{ fontSize: 20, fontWeight: 800, margin: "2px 0 14px" }}>{active || "…"}</div>
      <div className="field">
        <label>เลือกเอง</label>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <select value={val} onChange={(e) => setVal(e.target.value)}>
            <option value="">อัตโนมัติ (flash รุ่นใหม่สุดที่ใช้ได้)</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
            {val && !models.includes(val) && <option value={val}>{val}</option>}
          </select>
          <button className="btn-sm btn-primary" onClick={save}>บันทึก</button>
        </div>
      </div>
      <button className="btn-sm" onClick={refresh}><RefreshCw size={15} /> ให้ AI อ่านชีตใหม่เดี๋ยวนี้</button>
      {msg && <div className="hint" style={{ marginTop: 8 }}>{msg}</div>}
      <p className="hint" style={{ marginTop: 10 }}>ปกติ AI อ่านชีตใหม่เองทุก 15 นาที · ประกาศ ตาราง ฟอร์ม เงินรุ่น อัปเดตทันที</p>
    </div>
  );
}
