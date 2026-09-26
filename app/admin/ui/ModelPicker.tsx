"use client";
import { useEffect, useState } from "react";
import { act } from "./api";

export default function ModelPicker({ current }: { current: string }) {
  const [models, setModels] = useState<string[]>([]);
  const [active, setActive] = useState("");
  const [val, setVal] = useState(current);
  const [msg, setMsg] = useState("");
  const [stats, setStats] = useState<{ chars: number; sections: Record<string, number> } | null>(null);
  useEffect(() => {
    act("ai.models").then((r) => { if (r.ok) { setModels(r.models as string[]); setActive(String(r.active)); } });
    act("ai.pack").then((r) => { if (r.ok) setStats(r.stats as never); });
  }, []);
  async function save() {
    const r = await act("settings.set", { key: "gemini_model", value: val });
    setMsg(r.ok ? "บันทึกแล้ว ✅" : `ไม่สำเร็จ: ${r.error}`);
  }
  async function refresh() {
    await act("ai.refresh");
    const r = await act("ai.pack");
    if (r.ok) setStats(r.stats as never);
    setMsg("อ่านชีตใหม่แล้ว ✅");
  }
  return (
    <div className="card">
      <b>🧠 โมเดล & ฐานความรู้</b>
      <div className="kv" style={{ marginTop: 10 }}>
        <div>กำลังใช้</div><div><b>{active || "…"}</b></div>
        <div>ตั้งโมเดลเอง</div>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <select value={val} onChange={(e) => setVal(e.target.value)}>
            <option value="">อัตโนมัติ (flash รุ่นใหม่สุดที่ใช้ได้)</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
            {val && !models.includes(val) && <option value={val}>{val}</option>}
          </select>
          <button className="btn-sm btn-primary" onClick={save}>บันทึก</button>
        </div>
        <div>ความรู้ที่ AI อ่านทุกคำถาม</div>
        <div>{stats ? <>
          {stats.chars.toLocaleString()} ตัวอักษร (~{Math.round(stats.chars / 2.6).toLocaleString()} tokens)
          <div className="hint">บริบทล่าสุด {stats.sections.current ?? 0} · ดัชนี {stats.sections.historyIndex ?? 0} · ความรู้ {stats.sections.knowledge ?? 0} · ประกาศเก่า {stats.sections.announcements ?? 0} · ลิงก์ {stats.sections.links ?? 0} รายการ + ข้อมูลสดจากแอปทั้งหมด</div>
        </> : "กำลังนับ…"}</div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn-sm" onClick={refresh}>🔄 ให้ AI อ่านชีตใหม่เดี๋ยวนี้</button>
        {msg && <span className="badge b-ok">{msg}</span>}
      </div>
      <p className="hint">ปกติ AI อ่านชีตใหม่เองทุก 10 นาที · ข้อมูลในแอป (ประกาศ ตาราง ฟอร์ม เงินรุ่น) อัปเดตทันที</p>
    </div>
  );
}
