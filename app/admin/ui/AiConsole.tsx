"use client";
import { useState } from "react";
import { act } from "./api";

type Out = { kind: string; reply: string; links: { label: string; url: string }[]; topic: string };
type FlexBtn = { action?: { label?: string; uri?: string } };
type Msg = { type: string; text?: string; altText?: string; contents?: { footer?: { contents?: FlexBtn[] }; body?: { contents?: (FlexBtn & { text?: string })[] } } };

const KIND: Record<string, [string, string]> = {
  answer: ["ตอบได้", "b-ok"], partial: ["ตอบได้บางส่วน + ส่งต่อประธาน", "b-warn"], cannot_answer: ["ส่งต่อประธาน", "b-danger"], smalltalk: ["คุยเล่น", "b-blue"],
};

const ROUTE: Record<string, [string, string]> = {
  rule: ["ตอบจากกฎ (ฟรี)", "b-green"], cache: ["จากแคช (ฟรี)", "b-green"], ai: ["AI", "b-blue"], "ai+search": ["AI + ค้นเพิ่ม", "b-purple"],
  budget: ["งบหมด", "b-red"], cap: ["เกินโควตาต่อวัน", "b-orange"],
};

export default function AiConsole({ roster }: { roster: { sid: string; label: string }[] }) {
  const [q, setQ] = useState("");
  const [as, setAs] = useState("admin");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ out: Out; messages: Msg[]; model: string; ms: number; tokens: number; cached: number; error?: string; route?: string; evidence?: number } | null>(null);
  const [hist, setHist] = useState<string[]>([]);
  const samples = ["เงินรุ่นเดือนนี้เท่าไหร่ จ่ายยังไง", "ตารางเรียนพรุ่งนี้มีอะไร เรียนตึกไหน", "ฟอร์ม wellness survey ลิงก์อยู่ไหน", "ไอจีของมาร์ธาคืออะไร", "ฉันจ่ายเงินรุ่นครบยัง", "สอบครั้งหน้าวันไหน", "ใครเป็นฝ่ายวิชาการ", "เสื้อ MED VAJIRA ราคาเท่าไหร่"];

  async function ask(text = q) {
    if (!text.trim()) return;
    setBusy(true); setRes(null);
    const r = await act("ai.ask", { question: text, sid: as === "admin" || as === "anon" ? "" : as, asAdmin: as === "admin" });
    setBusy(false);
    if (!r.ok) { setRes({ out: { kind: "cannot_answer", reply: `ผิดพลาด: ${r.error}`, links: [], topic: "" }, messages: [], model: "", ms: 0, tokens: 0, cached: 0 }); return; }
    setRes(r as never);
    setHist((h) => [text, ...h.filter((x) => x !== text)].slice(0, 8));
  }

  return (
    <div className="card">
      <b>ลองถามบอท (ผลเหมือนที่เพื่อน ๆ จะได้ใน LINE)</b>
      <div className="grid g2" style={{ marginTop: 10 }}>
        <div className="field" style={{ margin: 0 }}><label>ถามในฐานะ</label>
          <select value={as} onChange={(e) => setAs(e.target.value)}>
            <option value="admin">แอดมิน (เห็นภาพรวมทั้งรุ่น)</option>
            <option value="anon">คนที่ยังไม่ยืนยันตัวตน</option>
            {roster.map((r) => <option key={r.sid} value={r.sid}>{r.label}</option>)}
          </select>
        </div>
        <div />
      </div>
      <div className="row" style={{ marginTop: 10, flexWrap: "nowrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(); }} placeholder="พิมพ์คำถาม…" />
        <button className="btn-primary" onClick={() => ask()} disabled={busy}>{busy ? "กำลังคิด…" : "ถาม"}</button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {[...hist, ...samples.filter((s) => !hist.includes(s))].slice(0, 10).map((s) => <button key={s} className="btn-sm btn-ghost" onClick={() => { setQ(s); ask(s); }}>{s}</button>)}
      </div>
      {res && (
        <div style={{ marginTop: 14 }}>
          <div className="row">
            <span className={`badge ${KIND[res.out.kind]?.[1] ?? "b-muted"}`}>{KIND[res.out.kind]?.[0] ?? res.out.kind}</span>
            {res.out.topic && <span className="badge b-muted">หมวด {res.out.topic}</span>}
            {res.route && <span className={`badge ${ROUTE[res.route]?.[1] ?? "b-muted"}`}>{ROUTE[res.route]?.[0] ?? res.route}</span>}
            <span className="hint" style={{ margin: 0 }}>{res.model || "ไม่เรียก AI"} · {(res.ms / 1000).toFixed(1)} วิ{res.tokens ? ` · ${res.tokens.toLocaleString()} tokens` : ""}{res.evidence ? ` · ค้นเจอ ${res.evidence} ชิ้น` : ""}</span>
          </div>
          {res.error && <div className="msg msg-err">{res.error}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10, maxWidth: 420 }}>
            {res.messages.map((m, i) => m.type === "text"
              ? <div key={i} className="preview-line">{m.text}</div>
              : <div key={i} className="preview" style={{ maxWidth: 420 }}>
                  <div className="pb" style={{ fontWeight: 700 }}>{m.altText}</div>
                  <div className="pf" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[...(m.contents?.footer?.contents ?? []), ...(m.contents?.body?.contents ?? [])].filter((c) => c.action?.uri).map((c, k) => (
                      <a key={k} className="pbtn" style={{ background: k === 0 ? "#1D4ED8" : "#64748b" }} href={c.action!.uri} target="_blank" rel="noreferrer">{c.action!.label}</a>
                    ))}
                  </div>
                </div>)}
          </div>
        </div>
      )}
    </div>
  );
}
