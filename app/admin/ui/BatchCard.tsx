"use client";
// "เตือนรวม" — ติ๊กเรื่องที่จะเตือน → เพื่อนแต่ละคนได้ข้อความเดียว (เฉพาะเรื่องที่ตัวเองยังไม่ทำ) + การ์ดลิงก์
import { useMemo, useState } from "react";
import { Send, X, Users, MessageCircle, Plus, Layers, CalendarClock, Check } from "lucide-react";
import { act } from "./api";
import { isoToLocalInput, localInputToIso } from "./dt";
import { relativeTh, thDateTime } from "@/lib/time";

export type BatchEntry = { key: string; kind: "form" | "deadline" | "exam" | "news"; title: string; when: string; forAll: boolean; ids: string[]; links: string[]; at?: string; event?: string };
type Props = { id: string; code: string; entries: BatchEntry[]; extra: BatchEntry[]; all: string[]; nick: Record<string, string> };

const KIND = {
  form: { em: "📝", th: "ต้องกรอก", color: "#E11D48" },
  deadline: { em: "⏰", th: "เดดไลน์", color: "#D97706" },
  exam: { em: "📚", th: "สอบ", color: "#4F46E5" },
  news: { em: "📢", th: "ประกาศ", color: "#1D4ED8" },
} as const;

export default function BatchCard({ id, code, entries: initial, extra: initialExtra, all, nick }: Props) {
  const [entries, setEntries] = useState(initial);
  const [extra, setExtra] = useState(initialExtra);
  const [on, setOn] = useState<Set<string>>(() => new Set(initial.map((e) => e.key)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [gone, setGone] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  // แก้วันแล้ว: อัปเดตการ์ดนี้ทันที (ต้นทาง — ประกาศ/สิ่งที่ต้องกรอก/ตารางสอบ — ถูกแก้ที่ server แล้ว)
  function onDates(key: string, at: string, event: string) {
    setEntries((l) => l.map((e) => (e.key === key ? { ...e, at, event, when: at ? `${relativeTh(at)} · ${thDateTime(at)}` : "" } : e)));
    setEditing(null);
  }

  const picked = entries.filter((e) => on.has(e.key));
  // ใครได้อะไรบ้าง (คำนวณในเครื่อง — ตอนกดส่ง server คำนวณสดอีกรอบ)
  const perPerson = useMemo(() => {
    const m = new Map<string, BatchEntry[]>();
    for (const e of picked) for (const sid of e.forAll ? all : e.ids) m.set(sid, [...(m.get(sid) ?? []), e]);
    return m;
  }, [picked, all]);
  const people = perPerson.size;
  const sample = useMemo(() => {
    let best: [string, BatchEntry[]] | null = null;
    for (const [sid, list] of perPerson) if (!best || list.length > best[1].length) best = [sid, list];
    return best;
  }, [perPerson]);

  function toggle(k: string) {
    setOn((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  function add(e: BatchEntry) {
    setEntries((l) => [...l, e]);
    setExtra((l) => l.filter((x) => x.key !== e.key));
    setOn((s) => new Set(s).add(e.key));
    setAdding(false);
    act("outbox.batchAdd", { key: e.key }); // จำไว้ในรายการด้วย (เผื่อกดส่งจาก LINE ทีหลัง)
  }
  async function send() {
    if (!picked.length) return;
    if (!confirm(`ส่งเตือนรวม ${picked.length} เรื่อง ถึง ${people} คน (คนละ 1 ข้อความ) ตอนนี้เลย?`)) return;
    setBusy(true); setMsg("");
    const r = await act("outbox.approve", { id, keys: picked.map((e) => e.key) });
    setBusy(false);
    setMsg(r.ok ? `ส่งแล้ว ${r.count} คน ✓` : `ส่งไม่ได้: ${r.error}`);
    if (r.ok) setTimeout(() => setGone(true), 1200);
  }
  async function reject() {
    if (!confirm("ไม่ส่งรอบนี้? (พรุ่งนี้เช้าระบบจะเสนอเรื่องที่ยังค้างให้อีกครั้ง)")) return;
    setBusy(true);
    await act("outbox.reject", { id });
    setGone(true);
  }
  if (gone) return null;

  return (
    <div className="card fade-in split">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="row"><span className="badge b-blue"><Layers size={13} /> เตือนรวม</span><span className="badge b-muted">#{code}</span></div>
        <h3 style={{ fontSize: 20, margin: 0 }}>ติ๊กเรื่องที่จะเตือน แล้วกดส่งครั้งเดียว</h3>
        <div className="hint">แต่ละคนได้ <b>ข้อความเดียว</b> ที่มีเฉพาะเรื่องที่ตัวเองยังไม่ทำ · คนที่ทำครบแล้วไม่ได้รับ</div>

        <div className="batch-list">
          {entries.map((e) => (
            <div key={e.key} className="batch-wrap">
              <label className={`batch-it ${on.has(e.key) ? "on" : ""}`}>
                <input type="checkbox" checked={on.has(e.key)} onChange={() => toggle(e.key)} />
                <span className="batch-em" style={{ background: KIND[e.kind].color }}>{KIND[e.kind].em}</span>
                <span className="batch-b">
                  <b>{e.title}</b>
                  <small>{KIND[e.kind].th}{e.when ? ` · ${e.when}` : ""}{e.event && e.kind !== "exam" ? ` · งาน ${thDateTime(e.event)}` : ""} · {e.forAll ? `ทุกคน (${all.length})` : `ยังไม่ทำ ${e.ids.length} คน`}</small>
                </span>
                {id !== "demo" && (
                  <button type="button" className="btn btn-sm btn-ghost batch-date" title="แก้เดดไลน์ / วันงาน" onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setEditing(editing === e.key ? null : e.key); }}>
                    <CalendarClock size={15} /> แก้วัน
                  </button>
                )}
              </label>
              {editing === e.key && <DateEditor entry={e} onDone={onDates} />}
            </div>
          ))}
          {entries.length === 0 && <div className="hint">ยังไม่มีเรื่องในรายการ — เพิ่มจากด้านล่าง</div>}
        </div>

        {extra.length > 0 && (adding ? (
          <div className="batch-list add">
            {extra.map((e) => (
              <button key={e.key} className="batch-it" onClick={() => add(e)}>
                <Plus size={16} />
                <span className="batch-em" style={{ background: KIND[e.kind].color }}>{KIND[e.kind].em}</span>
                <span className="batch-b"><b>{e.title}</b><small>{KIND[e.kind].th}{e.when ? ` · ${e.when}` : ""}</small></span>
              </button>
            ))}
          </div>
        ) : <button className="btn btn-sm" onClick={() => setAdding(true)}><Plus size={15} /> เพิ่มเรื่องอื่น ({extra.length})</button>)}

        <div className="row hint" style={{ gap: 8 }}><Users size={16} /> ส่งถึง <b style={{ color: "var(--text)" }}>{people} คน</b> · {picked.length} เรื่อง · ใช้โควตา {people} ข้อความ</div>
        <div className="row hint" style={{ gap: 8 }}><MessageCircle size={16} /> หรือใน LINE พิมพ์ <b style={{ color: "var(--text)" }}>approve {code}</b> (ทุกเรื่อง) · <b style={{ color: "var(--text)" }}>approve {code} 1 3</b> (เฉพาะข้อ)</div>
        <div className="row" style={{ marginTop: "auto" }}>
          <button className="btn btn-green btn-lg" onClick={send} disabled={busy || !picked.length || !people}><Send size={18} /> ส่งรวม {people} คน</button>
          <button className="btn btn-danger" onClick={reject} disabled={busy}><X size={16} /> ไม่ส่งรอบนี้</button>
        </div>
        {msg && <div className="msg msg-ok">{msg}</div>}
      </div>

      <div className="phone line">
        <div className="hint" style={{ color: "#fff", fontWeight: 700 }}>{sample ? `ตัวอย่างที่ ${nick[sample[0]] || "เพื่อน"} จะได้รับ (${sample[1].length} เรื่อง)` : "ยังไม่มีใครต้องได้รับ"}</div>
        {sample && (
          <div className="lc-car">
            <div className="lc-card sum">
              <div className="lc-h" style={{ background: "#1D4ED8" }}><small>{nick[sample[0]] || "เพื่อน"} จ๋า ⏰</small><b>สิ่งที่ต้องทำ {sample[1].length} เรื่อง</b></div>
              <div className="lc-body">{sample[1].map((e) => <div key={e.key}><b>{KIND[e.kind].em} {e.title}</b>{e.when && <small style={{ color: KIND[e.kind].color }}>{e.when}</small>}</div>)}</div>
              <span className="lc-btn" style={{ background: "#1D4ED8" }}>เปิดแอป BM33</span>
            </div>
            {sample[1].map((e) => (
              <div key={e.key} className="lc-card">
                <div className="lc-h" style={{ background: KIND[e.kind].color }}><small>{KIND[e.kind].em} {KIND[e.kind].th}</small></div>
                <div className="lc-body"><b>{e.title}</b>{e.when && <small style={{ color: KIND[e.kind].color }}>{e.when}</small>}</div>
                {(e.links.length ? e.links : ["เปิดแอป"]).slice(0, 2).map((l, i) => <span key={i} className={`lc-btn ${i ? "sec" : ""}`} style={i ? undefined : { background: KIND[e.kind].color }}>{l}</span>)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// แก้เดดไลน์ / วันงาน ของเรื่องนี้ — บันทึกไปที่ประกาศจริง (แอปเห็นวันใหม่ทันที · ข้อความเตือนใช้วันใหม่ตอนกดส่ง)
function DateEditor({ entry, onDone }: { entry: BatchEntry; onDone: (key: string, at: string, event: string) => void }) {
  const exam = entry.kind === "exam";
  const hasAnn = entry.key.startsWith("ann:") || entry.key.startsWith("form:");
  const [dl, setDl] = useState(isoToLocalInput(exam ? "" : entry.at ?? ""));
  const [ev, setEv] = useState(isoToLocalInput(entry.event ?? ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    setBusy(true); setErr("");
    const payload: Record<string, unknown> = { key: entry.key };
    if (!exam) payload.deadline = localInputToIso(dl);
    if (exam || hasAnn) payload.event = localInputToIso(ev);
    const r = await act("outbox.setDate", payload);
    setBusy(false);
    if (!r.ok) { setErr(String(r.error ?? "บันทึกไม่ได้")); return; }
    onDone(entry.key, exam ? localInputToIso(ev) : localInputToIso(dl), localInputToIso(ev));
  }
  return (
    <div className="batch-edit">
      {!exam && (
        <label>เดดไลน์<input type="datetime-local" value={dl} onChange={(e) => setDl(e.target.value)} /></label>
      )}
      {(exam || hasAnn) && (
        <label>{exam ? "วันเวลาสอบ" : "วันงาน (ไม่บังคับ)"}<input type="datetime-local" value={ev} onChange={(e) => setEv(e.target.value)} /></label>
      )}
      <button className="btn btn-sm btn-primary" onClick={save} disabled={busy}><Check size={14} /> {busy ? "กำลังบันทึก…" : "บันทึก + อัปเดตประกาศ"}</button>
      {err && <span className="hint" style={{ color: "var(--red-ink)" }}>{err}</span>}
    </div>
  );
}
