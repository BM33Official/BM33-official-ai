"use client";
// ประกาศ = เขียนครั้งเดียว เลือกได้ว่าไปที่ไหน: ขึ้นแอป (เสมอ) · ส่ง LINE (ผ่านอนุมัติ) · นับเป็นสิ่งที่ต้องกรอก
// ขวามือ = หน้าตาจริงบนมือถือเพื่อน ๆ (อัปเดตสดขณะพิมพ์)
import { useState } from "react";
import { Sparkles, Smartphone, MessageCircle, ClipboardCheck, Plus, X, Pin, ArrowLeft, Clock, MapPin, CalendarDays } from "lucide-react";
import { act } from "./api";
import { isoToLocalInput, localInputToIso } from "./dt";

const CATS = ["ทั่วไป", "การเงิน", "วิชาการ", "กิจกรรม", "ฟอร์ม/เอกสาร", "ด่วน"];
const CAT_COLOR: Record<string, string> = { ทั่วไป: "#007aff", การเงิน: "#34c759", วิชาการ: "#af52de", กิจกรรม: "#ff9500", "ฟอร์ม/เอกสาร": "#30b0c7", ด่วน: "#ff3b30" };
type Link = { label: string; url: string };
export type AnnDraft = {
  id?: string; title: string; summary: string; body: string; author: string; author_role: string; category: string;
  deadline_at: string; event_at: string; location: string; links: Link[]; pinned: boolean; status: string; form_id: string;
};
const EMPTY: AnnDraft = { title: "", summary: "", body: "", author: "", author_role: "", category: "ทั่วไป", deadline_at: "", event_at: "", location: "", links: [], pinned: false, status: "live", form_id: "" };
const FORM_URL = /(forms\.gle\/|docs\.google\.com\/forms\/|forms\.office\.com)/i;

function fmt(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AnnouncementEditor({ initial, forms, committee, onDone }: {
  initial?: AnnDraft; forms: { id: string; name: string }[]; committee: { nickname: string; role: string }[]; onDone?: () => void;
}) {
  const [d, setD] = useState<AnnDraft>(initial ?? EMPTY);
  const [stage, setStage] = useState<"paste" | "edit">(initial ? "edit" : "paste");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sendLine, setSendLine] = useState(false);
  const [todo, setTodo] = useState(false);
  const set = (p: Partial<AnnDraft>) => setD((x) => ({ ...x, ...p }));
  const hasForm = d.links.some((l) => FORM_URL.test(l.url));

  async function parse() {
    if (!d.body.trim()) { setMsg("วางข้อความก่อนน้า"); return; }
    setBusy(true); setMsg("");
    const r = await act("announce.parse", { text: d.body, author: d.author });
    setBusy(false);
    if (!r.ok) { setMsg(`อ่านไม่สำเร็จ: ${r.error}`); return; }
    const p = r.parsed as { title: string; summary: string; category: string; deadline: string; event_time: string; location: string; links: Link[]; is_announcement: boolean; required_for?: string };
    set({ title: p.title, summary: p.summary, category: CATS.includes(p.category) ? p.category : "ทั่วไป", deadline_at: p.deadline, event_at: p.event_time, location: p.location ?? "", links: p.links ?? [] });
    setTodo(p.required_for === "all" || p.required_for === "some");
    setStage("edit");
    if (!p.is_announcement) setMsg("AI คิดว่าข้อความนี้อาจไม่ใช่ประกาศ ลองตรวจอีกครั้งนะ");
  }

  async function save(status: string) {
    if (!d.title.trim()) { setMsg("ใส่หัวข้อก่อนน้า"); return; }
    setBusy(true); setMsg("");
    const payload = {
      title: d.title, summary: d.summary, body: d.body, author: d.author, author_role: d.author_role, category: d.category,
      deadline_at: d.deadline_at, event_at: d.event_at, location: d.location, links: JSON.stringify(d.links.filter((l) => l.url)),
      pinned: d.pinned ? "1" : "", status, form_id: d.form_id,
    };
    const r = d.id ? await act("announce.update", { id: d.id, patch: payload }) : await act("announce.create", { data: payload, todo: todo && hasForm, sendLine: status === "live" && sendLine });
    setBusy(false);
    if (!r.ok) { setMsg(`บันทึกไม่ได้: ${r.error}`); return; }
    setMsg(status === "live" ? `ขึ้นแอปแล้ว ✓${r.code ? ` · เพิ่มเข้า “เตือนรวม” #${r.code} (รออนุมัติ)` : ""}` : "บันทึกแล้ว");
    if (onDone) setTimeout(onDone, 600); else setTimeout(() => window.location.reload(), 900);
  }

  const color = CAT_COLOR[d.category] ?? "#007aff";
  const preview = (
    <div style={{ position: "sticky", top: 20 }}>
      <div className="label" style={{ display: "flex", alignItems: "center", gap: 6 }}><Smartphone size={14} /> เพื่อน ๆ จะเห็นแบบนี้</div>
      <div className="phone" style={{ background: "linear-gradient(160deg,#0b1f4d,#1d4ed8)", padding: 16 }}>
        <div style={{ background: "rgba(255,255,255,.95)", borderRadius: 18, padding: 14, display: "grid", gap: 8 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="badge" style={{ background: color + "22", color }}>{d.category}</span>
            {d.pinned && <span className="badge b-muted"><Pin size={11} /> ปักหมุด</span>}
          </div>
          <b style={{ fontSize: 17, lineHeight: 1.3 }}>{d.title || "หัวข้อประกาศ"}</b>
          <span style={{ fontSize: 14, color: "#3a3a3c", lineHeight: 1.5 }}>{d.summary || "สรุปสั้น ๆ ว่าต้องทำอะไร ภายในเมื่อไร"}</span>
          {d.deadline_at && <span className="row" style={{ gap: 6, fontSize: 13, fontWeight: 700, color: "#c4281f" }}><Clock size={14} /> ปิด {fmt(d.deadline_at)}</span>}
          {d.event_at && <span className="row" style={{ gap: 6, fontSize: 13, fontWeight: 700, color: "#8a2fb5" }}><CalendarDays size={14} /> {fmt(d.event_at)}</span>}
          {d.location && <span className="row" style={{ gap: 6, fontSize: 13, color: "#6e6e73" }}><MapPin size={14} /> {d.location}</span>}
          {d.links.filter((l) => l.url).slice(0, 3).map((l, i) => <span key={i} style={{ textAlign: "center", padding: 9, borderRadius: 12, fontWeight: 800, fontSize: 14, background: i ? "#f2f2f7" : color, color: i ? color : "#fff" }}>{l.label || "เปิดลิงก์"}</span>)}
          {d.author && <span style={{ fontSize: 12, color: "#8e8e93" }}>โดย {d.author}{d.author_role ? ` · ${d.author_role}` : ""}</span>}
        </div>
      </div>
      {sendLine && !d.id && (
        <>
          <div className="label" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}><MessageCircle size={14} /> อยู่ใน “เตือนรวม” (รออนุมัติก่อนส่ง)</div>
          <div className="phone line"><div className="bubble">{d.deadline_at ? "⏰" : "📢"} {d.title}{d.deadline_at ? `\n${fmt(d.deadline_at)}` : ""}{"\n\n"}+ เรื่องอื่นที่เพื่อนคนนั้นยังไม่ทำ รวมเป็นข้อความเดียว</div></div>
        </>
      )}
    </div>
  );

  if (stage === "paste") {
    return (
      <div className="card">
        <div className="card-h"><h3><span className="ic c-blue"><Sparkles strokeWidth={2.4} /></span> ประกาศใหม่</h3></div>
        <textarea style={{ minHeight: 180, fontSize: 16 }} value={d.body} onChange={(e) => set({ body: e.target.value })} placeholder="วางข้อความประกาศจากกลุ่มได้เลย — AI จะตั้งหัวข้อ สรุป หาเดดไลน์ และทำลิงก์เป็นปุ่มให้" />
        <div className="row" style={{ marginTop: 12 }}>
          <select style={{ maxWidth: 260 }} value={`${d.author}|${d.author_role}`} onChange={(e) => { const [a, r] = e.target.value.split("|"); set({ author: a, author_role: r }); }}>
            <option value="|">ผู้ประกาศ…</option>
            {committee.map((c) => <option key={c.nickname + c.role} value={`${c.nickname}|${c.role}`}>{c.nickname} · {c.role}</option>)}
          </select>
          <button className="btn btn-primary" onClick={parse} disabled={busy}><Sparkles size={16} /> {busy ? "AI กำลังอ่าน…" : "ให้ AI จัดให้"}</button>
          <button className="btn btn-ghost" onClick={() => setStage("edit")} disabled={busy}>เขียนเอง</button>
        </div>
        {msg && <div className="msg msg-err">{msg}</div>}
      </div>
    );
  }

  return (
    <div className="split-side">
      <div className="card">
        {!d.id && <button className="btn btn-ghost btn-sm" onClick={() => setStage("paste")} style={{ marginBottom: 8 }}><ArrowLeft size={15} /> กลับ</button>}
        <div className="field"><span>หัวข้อ</span><input style={{ fontSize: 18, fontWeight: 700 }} value={d.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} /></div>
        <div className="field"><span>หมวด</span>
          <div className="chips">{CATS.map((c) => <button key={c} type="button" className={`chip ${d.category === c ? "on" : ""}`} style={d.category === c ? { background: CAT_COLOR[c] } : undefined} onClick={() => set({ category: c })}>{c}</button>)}</div>
        </div>
        <div className="field"><span>สรุปสั้น</span><textarea style={{ minHeight: 70 }} value={d.summary} onChange={(e) => set({ summary: e.target.value })} /></div>
        <div className="grid g2">
          <div className="field"><span>⏰ เดดไลน์</span><input type="datetime-local" value={isoToLocalInput(d.deadline_at)} onChange={(e) => set({ deadline_at: localInputToIso(e.target.value) })} /></div>
          <div className="field"><span>📅 วันงาน / นัด</span><input type="datetime-local" value={isoToLocalInput(d.event_at)} onChange={(e) => set({ event_at: localInputToIso(e.target.value) })} /></div>
        </div>
        <div className="field"><span>📍 สถานที่</span><input value={d.location} onChange={(e) => set({ location: e.target.value })} /></div>
        <div className="field"><span>ปุ่มลิงก์</span>
          {d.links.map((l, i) => (
            <div key={i} className="row" style={{ flexWrap: "nowrap" }}>
              <input style={{ maxWidth: 170 }} value={l.label} maxLength={20} onChange={(e) => set({ links: d.links.map((x, k) => k === i ? { ...x, label: e.target.value } : x) })} placeholder="ข้อความบนปุ่ม" />
              <input value={l.url} onChange={(e) => set({ links: d.links.map((x, k) => k === i ? { ...x, url: e.target.value } : x) })} placeholder="https://…" />
              <button className="btn btn-ghost btn-sm" onClick={() => set({ links: d.links.filter((_, k) => k !== i) })} aria-label="ลบ"><X size={16} /></button>
            </div>
          ))}
          <button className="btn btn-sm" style={{ justifySelf: "start" }} onClick={() => set({ links: [...d.links, { label: "เปิดลิงก์", url: "" }] })}><Plus size={15} /> เพิ่มปุ่ม</button>
        </div>
        <div className="grid g2">
          <div className="field"><span>ผู้ประกาศ</span>
            <select value={`${d.author}|${d.author_role}`} onChange={(e) => { const [a, r] = e.target.value.split("|"); set({ author: a, author_role: r }); }}>
              <option value={`${d.author}|${d.author_role}`}>{d.author ? `${d.author} · ${d.author_role}` : "— เลือก —"}</option>
              {committee.map((c) => <option key={c.nickname + c.role} value={`${c.nickname}|${c.role}`}>{c.nickname} · {c.role}</option>)}
            </select>
          </div>
          <div className="field"><span>ผูกกับสิ่งที่ต้องกรอก</span>
            <select value={d.form_id} onChange={(e) => set({ form_id: e.target.value })}>
              <option value="">— ไม่ผูก —</option>
              {forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        </div>
        <details className="more"><summary>ข้อความต้นฉบับ (เพื่อน ๆ อ่านเต็มในแอป)</summary>
          <textarea style={{ minHeight: 140, marginTop: 8 }} value={d.body} onChange={(e) => set({ body: e.target.value })} />
        </details>

        <div className="list" style={{ marginTop: 18, boxShadow: "none", background: "var(--fill)" }}>
          <div className="li"><span className="ic c-blue"><Smartphone strokeWidth={2.4} /></span><div className="li-b"><b>ขึ้นแอป BM33</b><small>ทุกคนเห็นในหน้าแรก</small></div><label className="switch"><input type="checkbox" checked readOnly /><span /></label></div>
          {!d.id && <div className="li"><span className="ic c-line"><MessageCircle strokeWidth={2.4} /></span><div className="li-b"><b>ส่งข้อความ LINE ด้วย</b><small>{d.form_id || (todo && hasForm) ? "เฉพาะคนที่ยังไม่กรอก" : "ทุกคน"} · รวมใน “เตือนรวม” ข้อความเดียว รอคุณกดส่ง</small></div><label className="switch"><input type="checkbox" checked={sendLine} onChange={(e) => setSendLine(e.target.checked)} /><span /></label></div>}
          {!d.id && hasForm && <div className="li"><span className="ic c-green"><ClipboardCheck strokeWidth={2.4} /></span><div className="li-b"><b>นับเป็น “สิ่งที่ต้องกรอก”</b><small>ทุกคนต้องกรอก · ติดตามว่าใครยังไม่กรอก</small></div><label className="switch"><input type="checkbox" checked={todo} onChange={(e) => setTodo(e.target.checked)} /><span /></label></div>}
          <div className="li"><span className="ic c-orange"><Pin strokeWidth={2.4} /></span><div className="li-b"><b>ปักหมุดไว้บนสุด</b></div><label className="switch"><input type="checkbox" checked={d.pinned} onChange={(e) => set({ pinned: e.target.checked })} /><span /></label></div>
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn btn-primary btn-lg" onClick={() => save("live")} disabled={busy}>{d.id ? "บันทึก" : "เผยแพร่"}</button>
          <button className="btn" onClick={() => save("draft")} disabled={busy}>เก็บเป็นร่าง</button>
          {d.id && d.status !== "hidden" && <button className="btn btn-danger" onClick={() => save("hidden")} disabled={busy}>ซ่อน</button>}
        </div>
        {msg && <div className={`msg ${msg.includes("ไม่") ? "msg-err" : "msg-ok"}`}>{msg}</div>}
      </div>
      {preview}
    </div>
  );
}
