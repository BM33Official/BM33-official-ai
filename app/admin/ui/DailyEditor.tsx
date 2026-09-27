"use client";
// แก้ "สรุปวันนี้" — ซ้าย: แก้ข้อความ · ขวา: หน้าจอแอปจริง (อัปเดตทันทีที่พิมพ์)
import { useState } from "react";
import { ArrowUp, ArrowDown, X, Plus, Eye, EyeOff, Save } from "lucide-react";
import { act } from "./api";
import { isoToLocalInput, localInputToIso } from "./dt";

type Item = { emoji: string; text: string; at?: string; ref?: string; tone?: string };
const TONES = [{ v: "normal", th: "ปกติ" }, { v: "urgent", th: "ด่วน" }, { v: "good", th: "ข่าวดี" }];

export default function DailyEditor({ id, headline, items, status, date }: { id: string; headline: string; items: Item[]; status: string; date: string }) {
  const [h, setH] = useState(headline);
  const [list, setList] = useState<Item[]>(items);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const upd = (i: number, p: Partial<Item>) => setList((l) => l.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => setList((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });

  async function save(st?: string) {
    setBusy(true); setMsg(null);
    const r = await act("daily.update", { id, headline: h, items: list.filter((x) => x.text.trim()), status: st ?? status });
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: "บันทึกแล้ว — แอปอัปเดตใน ~15 วินาที" } : { ok: false, t: `ไม่สำเร็จ: ${r.error}` });
    if (st && r.ok) setTimeout(() => window.location.reload(), 600);
  }

  return (
    <div className="split-side">
      <div className="card">
        <div className="field"><label>ประโยคเปิด</label><input value={h} onChange={(e) => setH(e.target.value)} maxLength={120} /></div>
        <div className="stack" style={{ gap: 10 }}>
          {list.map((it, i) => (
            <div key={i} className="card flat" style={{ padding: 12 }}>
              <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}>
                <input aria-label="อีโมจิ" style={{ width: 52, textAlign: "center", fontSize: 20 }} value={it.emoji} onChange={(e) => upd(i, { emoji: e.target.value })} />
                <input style={{ flex: 1 }} value={it.text} onChange={(e) => upd(i, { text: e.target.value })} placeholder="เช่น ส่งฟอร์มเลือกวิชาภายใน พฤ. 2 ต.ค. 23:59 น." />
                <button className="btn-sm btn-ghost" aria-label="ขึ้น" onClick={() => move(i, -1)}><ArrowUp size={16} /></button>
                <button className="btn-sm btn-ghost" aria-label="ลง" onClick={() => move(i, 1)}><ArrowDown size={16} /></button>
                <button className="btn-sm btn-ghost" aria-label="ลบ" onClick={() => setList((l) => l.filter((_, k) => k !== i))}><X size={16} /></button>
              </div>
              <div className="row" style={{ marginTop: 8, gap: 8 }}>
                <input type="datetime-local" style={{ maxWidth: 220 }} value={isoToLocalInput(it.at ?? "")} onChange={(e) => upd(i, { at: localInputToIso(e.target.value) || undefined })} />
                <div className="seg">{TONES.map((t) => <button key={t.v} className={(it.tone ?? "normal") === t.v ? "on" : ""} onClick={() => upd(i, { tone: t.v })}>{t.th}</button>)}</div>
                <span className="hint">{it.at ? "แอปนับถอยหลังให้" : ""}</span>
              </div>
            </div>
          ))}
        </div>
        <button className="btn-sm" style={{ marginTop: 12 }} onClick={() => setList((l) => [...l, { emoji: "📌", text: "", tone: "normal" }])}><Plus size={15} /> เพิ่มรายการ</button>
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn-primary" onClick={() => save()} disabled={busy}><Save size={16} /> บันทึก</button>
          {status === "live"
            ? <button className="btn-ghost" onClick={() => save("hidden")} disabled={busy}><EyeOff size={16} /> ซ่อนจากแอป</button>
            : <button className="btn-green" onClick={() => save("live")} disabled={busy}><Eye size={16} /> แสดงบนแอป</button>}
        </div>
        {msg && <div className={`msg ${msg.ok ? "msg-ok" : "msg-err"}`}>{msg.t}</div>}
      </div>
      <div style={{ position: "sticky", top: 20 }}>
        <div className="label" style={{ marginBottom: 8 }}>หน้าจอแอป · {date} · <span className={status === "live" ? "" : "muted"}>{status === "live" ? "กำลังแสดง" : "ซ่อนอยู่"}</span></div>
        <div className="phone" style={{ background: "linear-gradient(160deg,#1e3a8a,#2563eb)", opacity: status === "live" ? 1 : 0.55 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 17 }}>{h || "…"}</div>
          {list.filter((x) => x.text.trim()).map((x, k) => (
            <div key={k} className="bubble" style={{ borderRadius: 14, maxWidth: "100%", borderLeft: x.tone === "urgent" ? "4px solid #ff3b30" : x.tone === "good" ? "4px solid #34c759" : undefined }}>{x.emoji} {x.text}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
