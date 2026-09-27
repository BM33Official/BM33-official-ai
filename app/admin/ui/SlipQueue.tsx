"use client";
// สลิปรอตรวจ — AI อ่านสลิปแล้วเทียบยอด/ผู้รับ/สลิปซ้ำให้ ฝ่ายการเงินแค่ดูแล้วกด ✓ หรือ ✕
import { useState } from "react";
import { Check, X, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { act } from "./api";

export type SlipLite = { id: string; sid: string; name: string; month: string; monthLabel: string; amount: string; paid_at: string; receiver: string; verdict: string; note: string; image: string; when: string; source: string };
const V = {
  ok: { icon: ShieldCheck, cls: "b-green", th: "AI: ตรงทุกอย่าง" },
  check: { icon: ShieldAlert, cls: "b-orange", th: "AI: ควรดูอีกที" },
  bad: { icon: ShieldX, cls: "b-red", th: "AI: น่าสงสัย" },
} as const;

export default function SlipQueue({ slips, months }: { slips: SlipLite[]; months: { month: string; label: string }[] }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [month, setMonth] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  async function decide(s: SlipLite, approve: boolean) {
    setBusy(s.id);
    const r = await act("finance.slip.decide", { id: s.id, approve, month: month[s.id] || s.month });
    setBusy("");
    if (r.ok) setGone((g) => new Set(g).add(s.id)); else alert(`ไม่สำเร็จ: ${r.error ?? ""}`);
  }
  const list = slips.filter((s) => !gone.has(s.id));
  if (!list.length) return null;
  return (
    <div className="grid g-auto" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
      {list.map((s) => {
        const v = V[(s.verdict as keyof typeof V)] ?? V.check;
        return (
          <div key={s.id} className="card fade-in" style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 14 }}>
            {s.image ? <a href={s.image} target="_blank" rel="noreferrer"><img src={s.image} alt="สลิป" className="thumb" style={{ width: 96, height: 150, objectFit: "cover", borderRadius: 12 }} /></a> : <div className="thumb" style={{ width: 96, height: 150, borderRadius: 12, background: "var(--fill)" }} />}
            <div style={{ minWidth: 0 }}>
              <span className={`badge ${v.cls}`}><v.icon size={13} /> {v.th}</span>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{Number(s.amount).toLocaleString()} <small className="muted" style={{ fontSize: 14 }}>บาท</small></div>
              <b>{s.name}</b> <span className="hint">#{Number(s.sid.slice(-3))}</span>
              <div className="hint">{s.paid_at || "ไม่ทราบเวลา"} · ผู้รับ {s.receiver || "?"}</div>
              {s.verdict !== "ok" && <div className="hint" style={{ color: "var(--orange-ink)", fontWeight: 700 }}>{s.note}</div>}
              <select value={month[s.id] ?? s.month} onChange={(e) => setMonth((m) => ({ ...m, [s.id]: e.target.value }))} style={{ marginTop: 8, padding: "6px 10px" }}>
                {!s.month && <option value="">เลือกเดือน…</option>}
                {months.map((m) => <option key={m.month} value={m.month}>{m.label || m.month}</option>)}
              </select>
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <button className="btn-green" disabled={busy === s.id || !(month[s.id] || s.month)} onClick={() => decide(s, true)}><Check size={17} /> ยืนยัน</button>
                <button className="btn-ghost" disabled={busy === s.id} onClick={() => decide(s, false)}><X size={17} /> ไม่ผ่าน</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
