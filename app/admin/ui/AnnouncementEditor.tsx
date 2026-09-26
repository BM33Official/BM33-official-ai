"use client";
import { useState } from "react";
import { act } from "./api";
import { isoToLocalInput, localInputToIso } from "./dt";

const CATS = ["ทั่วไป", "การเงิน", "วิชาการ", "กิจกรรม", "ฟอร์ม/เอกสาร", "ด่วน"];
type Link = { label: string; url: string };
export type AnnDraft = {
  id?: string; title: string; summary: string; body: string; author: string; author_role: string; category: string;
  deadline_at: string; event_at: string; location: string; links: Link[]; pinned: boolean; status: string; form_id: string;
};
const EMPTY: AnnDraft = { title: "", summary: "", body: "", author: "", author_role: "", category: "ทั่วไป", deadline_at: "", event_at: "", location: "", links: [], pinned: false, status: "live", form_id: "" };

export default function AnnouncementEditor({ initial, forms, committee, onDone }: {
  initial?: AnnDraft; forms: { id: string; name: string }[]; committee: { nickname: string; role: string }[]; onDone?: () => void;
}) {
  const [d, setD] = useState<AnnDraft>(initial ?? EMPTY);
  const [stage, setStage] = useState<"paste" | "edit">(initial ? "edit" : "paste");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (p: Partial<AnnDraft>) => setD((x) => ({ ...x, ...p }));

  async function parse() {
    if (!d.body.trim()) { setMsg("วางข้อความประกาศก่อนน้า"); return; }
    setBusy(true); setMsg("AI กำลังอ่าน…");
    const r = await act("announce.parse", { text: d.body, author: d.author });
    setBusy(false);
    if (!r.ok) { setMsg(`อ่านไม่สำเร็จ: ${r.error}`); return; }
    const p = r.parsed as { title: string; summary: string; category: string; deadline: string; event_time: string; location: string; links: Link[]; is_announcement: boolean };
    set({ title: p.title, summary: p.summary, category: CATS.includes(p.category) ? p.category : "ทั่วไป", deadline_at: p.deadline, event_at: p.event_time, location: p.location ?? "", links: p.links ?? [] });
    setMsg(p.is_announcement ? "AI จัดให้แล้ว ✨ ตรวจ/แก้ด้านล่างก่อนเผยแพร่" : "AI คิดว่าข้อความนี้อาจไม่ใช่ประกาศ — ตรวจอีกครั้งนะ");
    setStage("edit");
  }

  async function save(status: string) {
    if (!d.title.trim()) { setMsg("ใส่หัวข้อก่อนน้า"); return; }
    setBusy(true); setMsg("");
    const payload = {
      title: d.title, summary: d.summary, body: d.body, author: d.author, author_role: d.author_role, category: d.category,
      deadline_at: d.deadline_at, event_at: d.event_at, location: d.location, links: JSON.stringify(d.links.filter((l) => l.url)),
      pinned: d.pinned ? "1" : "", status, form_id: d.form_id,
    };
    const r = d.id ? await act("announce.update", { id: d.id, patch: payload }) : await act("announce.create", { data: payload });
    setBusy(false);
    if (!r.ok) { setMsg(`บันทึกไม่ได้: ${r.error}`); return; }
    setMsg(status === "live" ? "ขึ้นแอปแล้ว ✅ (เพื่อน ๆ เห็นภายใน ~15 วิ)" : "บันทึกแล้ว");
    if (onDone) setTimeout(onDone, 500); else setTimeout(() => window.location.reload(), 700);
  }

  return (
    <div className="card">
      {stage === "paste" ? (
        <>
          <b>วางข้อความประกาศ (จากแชตกลุ่ม/ที่ประธานพิมพ์)</b>
          <p className="hint">AI จะตั้งหัวข้อ สรุป หาเดดไลน์ และทำลิงก์เป็นปุ่มให้ — ตรวจก่อนเผยแพร่ได้เสมอ</p>
          <textarea style={{ minHeight: 170 }} value={d.body} onChange={(e) => set({ body: e.target.value })} placeholder="วางข้อความที่นี่…" />
          <div className="grid g2" style={{ marginTop: 10 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>ผู้ประกาศ</label>
              <select value={`${d.author}|${d.author_role}`} onChange={(e) => { const [a, r] = e.target.value.split("|"); set({ author: a, author_role: r }); }}>
                <option value="|">— เลือก —</option>
                {committee.map((c) => <option key={c.nickname + c.role} value={`${c.nickname}|${c.role}`}>{c.nickname} · {c.role}</option>)}
              </select>
            </div>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <button className="btn-primary" onClick={parse} disabled={busy}>✨ ให้ AI จัดให้</button>
              <button onClick={() => setStage("edit")} disabled={busy}>กรอกเอง</button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid g2">
            <div className="field"><label>หัวข้อ</label><input value={d.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} /></div>
            <div className="field"><label>หมวด</label>
              <div className="chips">{CATS.map((c) => <label key={c} className={`chip ${d.category === c ? "on" : ""}`}><input type="radio" checked={d.category === c} onChange={() => set({ category: c })} />{c}</label>)}</div>
            </div>
          </div>
          <div className="field"><label>สรุปสั้น (เห็นบนการ์ดในแอป)</label><textarea style={{ minHeight: 70 }} value={d.summary} onChange={(e) => set({ summary: e.target.value })} /></div>
          <div className="grid g2">
            <div className="field"><label>เดดไลน์ (เวลาไทย) — ใส่แล้วระบบจะเตือนให้อัตโนมัติ</label><input type="datetime-local" value={isoToLocalInput(d.deadline_at)} onChange={(e) => set({ deadline_at: localInputToIso(e.target.value) })} /></div>
            <div className="field"><label>วันงาน / วันนัด (ถ้ามี)</label><input type="datetime-local" value={isoToLocalInput(d.event_at)} onChange={(e) => set({ event_at: localInputToIso(e.target.value) })} /></div>
          </div>
          <div className="grid g2">
            <div className="field"><label>สถานที่</label><input value={d.location} onChange={(e) => set({ location: e.target.value })} /></div>
            <div className="field"><label>ผูกกับฟอร์มที่ติดตาม (เตือนเฉพาะคนที่ยังไม่ทำ)</label>
              <select value={d.form_id} onChange={(e) => set({ form_id: e.target.value })}>
                <option value="">— ไม่ผูก (เตือนทุกคน) —</option>
                {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>ปุ่มลิงก์ ({d.links.length})</label>
            {d.links.map((l, i) => (
              <div key={i} className="row" style={{ marginBottom: 6, flexWrap: "nowrap" }}>
                <input style={{ maxWidth: 180 }} value={l.label} maxLength={20} onChange={(e) => set({ links: d.links.map((x, k) => k === i ? { ...x, label: e.target.value } : x) })} placeholder="ข้อความบนปุ่ม" />
                <input value={l.url} onChange={(e) => set({ links: d.links.map((x, k) => k === i ? { ...x, url: e.target.value } : x) })} placeholder="https://…" />
                <button className="btn-sm btn-ghost" onClick={() => set({ links: d.links.filter((_, k) => k !== i) })}>✕</button>
              </div>
            ))}
            <button className="btn-sm" onClick={() => set({ links: [...d.links, { label: "เปิดลิงก์", url: "" }] })}>+ เพิ่มปุ่ม</button>
          </div>
          <div className="grid g2">
            <div className="field"><label>ผู้ประกาศ</label>
              <select value={`${d.author}|${d.author_role}`} onChange={(e) => { const [a, r] = e.target.value.split("|"); set({ author: a, author_role: r }); }}>
                <option value={`${d.author}|${d.author_role}`}>{d.author ? `${d.author} · ${d.author_role}` : "— เลือก —"}</option>
                {committee.map((c) => <option key={c.nickname + c.role} value={`${c.nickname}|${c.role}`}>{c.nickname} · {c.role}</option>)}
              </select>
            </div>
            <label className="row" style={{ marginTop: 26 }}><input type="checkbox" checked={d.pinned} onChange={(e) => set({ pinned: e.target.checked })} /> ปักหมุดไว้บนสุด</label>
          </div>
          <details><summary className="hint" style={{ cursor: "pointer" }}>ข้อความต้นฉบับ (แสดงในแอปให้เพื่อนอ่านเต็ม)</summary>
            <textarea style={{ minHeight: 140, marginTop: 8 }} value={d.body} onChange={(e) => set({ body: e.target.value })} />
          </details>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn-primary" onClick={() => save("live")} disabled={busy}>{d.id ? "บันทึก & แสดงบนแอป" : "เผยแพร่ขึ้นแอป"}</button>
            <button onClick={() => save("draft")} disabled={busy}>บันทึกเป็นร่าง</button>
            {d.id && d.status !== "hidden" && <button className="btn-danger" onClick={() => save("hidden")} disabled={busy}>ซ่อนจากแอป</button>}
            {!d.id && <button className="btn-ghost" onClick={() => setStage("paste")}>← กลับ</button>}
          </div>
        </>
      )}
      {msg && <div className="msg msg-ok">{msg}</div>}
    </div>
  );
}
