"use client";
import { useState } from "react";
import { act } from "./api";
import { isoToLocalInput, localInputToIso } from "./dt";

type Item = { emoji: string; text: string; at?: string; ref?: string; tone?: string };

export default function DailyEditor({ id, headline, items, status, date }: { id: string; headline: string; items: Item[]; status: string; date: string }) {
  const [h, setH] = useState(headline);
  const [list, setList] = useState<Item[]>(items);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const upd = (i: number, p: Partial<Item>) => setList((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => setList((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });

  async function save(st?: string) {
    setBusy(true); setMsg("");
    const r = await act("daily.update", { id, headline: h, items: list.filter((x) => x.text.trim()), status: st ?? status });
    setBusy(false);
    setMsg(r.ok ? "บันทึกแล้ว ✅ แอปอัปเดตภายใน ~15 วิ" : `ไม่สำเร็จ: ${r.error}`);
    if (st) setTimeout(() => window.location.reload(), 600);
  }
  async function regen() {
    if (!confirm("ให้ AI ร่างสรุปวันนี้ใหม่ทั้งหมด? (ทับของที่แก้ไว้)")) return;
    setBusy(true); setMsg("AI กำลังร่าง…");
    const r = await act("daily.generate");
    setBusy(false);
    if (r.ok) window.location.reload(); else setMsg(`ไม่สำเร็จ: ${r.error}`);
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>กำลังแสดงบนแอป · {date}</b>
        <span className={`badge ${status === "live" ? "b-ok" : "b-muted"}`}>{status === "live" ? "แสดงอยู่" : "ซ่อน"}</span>
      </div>
      <div className="field" style={{ marginTop: 12 }}><label>ประโยคเปิด</label><input value={h} onChange={(e) => setH(e.target.value)} maxLength={120} /></div>
      <label style={{ fontSize: 13, fontWeight: 700 }}>รายการ (เรียงจากบนลงล่าง)</label>
      {list.map((it, i) => (
        <div key={i} className="row" style={{ marginTop: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
          <input style={{ width: 56, textAlign: "center" }} value={it.emoji} onChange={(e) => upd(i, { emoji: e.target.value })} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <input value={it.text} onChange={(e) => upd(i, { text: e.target.value })} placeholder="ข้อความ (เช่น ส่งฟอร์มเลือกวิชาภายใน พฤ. 2 ต.ค. 23:59 น.)" />
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input type="datetime-local" style={{ maxWidth: 230 }} value={isoToLocalInput(it.at ?? "")} onChange={(e) => upd(i, { at: localInputToIso(e.target.value) || undefined })} />
              <select style={{ maxWidth: 160 }} value={it.tone ?? "normal"} onChange={(e) => upd(i, { tone: e.target.value })}>
                <option value="normal">ปกติ</option><option value="urgent">ด่วน</option><option value="good">ข่าวดี</option>
              </select>
              <span className="hint" style={{ margin: 0 }}>{it.at ? "แอปจะนับถอยหลังให้สด" : "ไม่มีวันเวลา"}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <button className="btn-sm" onClick={() => move(i, -1)}>↑</button>
            <button className="btn-sm" onClick={() => move(i, 1)}>↓</button>
            <button className="btn-sm btn-ghost" onClick={() => setList((l) => l.filter((_, k) => k !== i))}>✕</button>
          </div>
        </div>
      ))}
      <button className="btn-sm" style={{ marginTop: 10 }} onClick={() => setList((l) => [...l, { emoji: "📌", text: "", tone: "normal" }])}>+ เพิ่มรายการ</button>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn-primary" onClick={() => save()} disabled={busy}>บันทึก</button>
        <button onClick={regen} disabled={busy}>✨ ให้ AI ร่างใหม่</button>
        {status === "live" ? <button className="btn-ghost" onClick={() => save("hidden")} disabled={busy}>ซ่อนจากแอป</button> : <button className="btn-green" onClick={() => save("live")} disabled={busy}>แสดงบนแอป</button>}
      </div>
      {msg && <div className="msg msg-ok">{msg}</div>}
    </div>
  );
}
