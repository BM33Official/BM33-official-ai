"use client";
// ส่งข้อความถึงเพื่อน (วิชาการ) — 3 แบบที่ต่างกันชัด ๆ · กดส่ง = ส่งทันที (ฝ่ายวิชาการมีสิทธิ์ส่งเอง)
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, UserX, Flame, Send, FlaskConical, Clock } from "lucide-react";
import { act } from "./api";
import { bkkDateTime } from "@/lib/bc/format";

export type ExamLite = { exam_id: string; name: string; date: string; doc_link: string; pending: number; doc_reminder_at: string; doc_reminder_status: string };
type Mode = "invite" | "chase" | "zone";
type Card = { color: string; head: string; title: string; text: string; lines: string[]; bubbles: { title: string; sub: string; buttons: { label: string; url: string }[] }[]; app: { label: string; url: string } };

const MODES: { key: Mode; icon: typeof FileText; title: string; when: string; desc: string; tone: string }[] = [
  { key: "invite", icon: FileText, title: "ชวนทุกคนไปกรอก", when: "ก่อนตรวจ", desc: "ส่งปุ่มลิงก์เอกสารของข้อสอบที่เลือก ให้ทุกคนที่ลงทะเบียน · ตั้งเวลาส่งได้", tone: "#4F46E5" },
  { key: "chase", icon: UserX, title: "ตามคนที่ยังไม่ได้กรอก", when: "หลังตรวจ", desc: "เฉพาะคนที่ยังไม่ได้กรอก · 1 ข้อความรวมทุกข้อสอบที่ค้าง + ปุ่ม “ไปกรอก” แยกทีละข้อสอบ · ไม่ส่งถึงคนที่กดยอมโดนแล้ว", tone: "#E11D48" },
  { key: "zone", icon: Flame, title: "แจ้งสถานะ Red Zone", when: "เมื่อไรก็ได้", desc: "คนที่ค้างตั้งแต่ 2 อย่าง (ใกล้ + Red Zone) ได้รู้ระดับของตัวเอง พร้อมรายการที่ค้างและปุ่มลิงก์", tone: "#EA580C" },
];
const DEFAULTS: Record<Mode, string> = {
  invite: `ฝากทุกคนไปกรอกข้อที่ตัวเองรับผิดชอบใน "{ข้อสอบ}" ด้วยน้า 📄\nกรอกครบแล้วข้ามได้เลย ขอบคุณมาก ๆ 🙏`,
  chase: `{ชื่อเล่น} จ๋า 📝 ยังไม่เห็นข้อที่รับผิดชอบใน {จำนวน} ข้อสอบนี้เลย กดปุ่มไปกรอกทีละอันได้เลยน้า\nถ้าจำไม่ได้จริง ๆ กด “จำไม่ได้ ยอมโดน” ในแอปได้ ระบบจะไม่ตามอีก`,
  zone: `{ชื่อเล่น} จ๋า 📕 ตอนนี้อยู่ระดับ “{ระดับ}” (ค้าง {ค้าง} อย่าง · ครบ 3 = Red Zone)\nเคลียร์ทีละอย่างได้เลย เดี๋ยวก็หลุดโซน สู้ ๆ 💪`,
};
const TOKENS: Record<Mode, string> = { invite: "{ข้อสอบ}", chase: "{ชื่อเล่น} {จำนวน} {ข้อสอบ}", zone: "{ชื่อเล่น} {ระดับ} {ค้าง}" };
const toISO = (local: string) => (local ? new Date(local).toISOString() : "");

export default function AcademicBroadcast({ exams, lockExam, version = "", zoneOn = true }: { exams: ExamLite[]; lockExam?: string; version?: string; zoneOn?: boolean }) {
  const router = useRouter();
  const compact = !!lockExam;
  const [mode, setMode] = useState<Mode>("chase");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(lockExam ? [lockExam] : exams.filter((e) => e.pending > 0).map((e) => e.exam_id)));
  const [invite, setInvite] = useState(exams.find((e) => e.doc_link)?.exam_id ?? exams[0]?.exam_id ?? "");
  const [text, setText] = useState(DEFAULTS.chase);
  const [link, setLink] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [pv, setPv] = useState<{ count: number; audience: string; card: Card | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const info = MODES.find((m) => m.key === mode)!;
  const examIds = mode === "invite" ? [invite] : mode === "chase" ? Array.from(picked) : [];
  const curInvite = exams.find((e) => e.exam_id === invite);

  function changeMode(m: Mode) { setMode(m); setText(DEFAULTS[m]); setMsg(null); }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      act("academic.preview", { mode, examIds, template: text, link })
        .then((r) => { if (r.ok) setPv({ count: r.count as number, audience: r.audience as string, card: r.card as Card | null }); })
        .finally(() => setLoading(false));
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [mode, examIds.join(","), text, link, version]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    if (mode === "chase" && !examIds.length) { setMsg({ t: "เลือกข้อสอบอย่างน้อย 1 อัน", ok: false }); return; }
    if (!testMode && !confirm(`ส่งถึง ${pv?.count ?? 0} คนตอนนี้เลย?\n(${info.title} · ส่งทันที ไม่ต้องรออนุมัติ)`)) return;
    setBusy(true); setMsg(null);
    const r = await act("academic.broadcast", { mode, examIds, template: text, link, testMode });
    setBusy(false);
    if (r.ok) { setMsg({ t: r.testMode ? `ส่งตัวอย่างเข้า LINE แอดมินแล้ว (ตอนส่งจริงจะถึง ${r.count} คน)` : `ส่งแล้ว ${r.count} คน ✓`, ok: true }); if (!r.testMode) router.refresh(); }
    else setMsg({ t: `ส่งไม่ได้: ${r.error === "no_recipients" ? "ไม่มีใครต้องได้รับ" : r.error}`, ok: false });
  }
  async function schedule(at: string) {
    setBusy(true); setMsg(null);
    const r = await act("academic.scheduleDoc", { examId: invite, at: at ? toISO(at) : "", template: text });
    setBusy(false);
    setMsg(r.ok ? { t: at ? "ตั้งเวลาแล้ว ✓ ถึงเวลาระบบส่งให้ทุกคนเอง" : "ยกเลิกเวลาส่งแล้ว", ok: true } : { t: "ตั้งเวลาไม่ได้ (ข้อสอบต้องมีลิงก์เอกสาร)", ok: false });
    if (r.ok) router.refresh();
  }

  return (
    <div className={`card ab ${compact ? "ab-compact" : ""}`}>
      {!compact && (
        <div className="ab-modes">
          {MODES.filter((m) => zoneOn || m.key !== "zone").map((m) => (
            <button key={m.key} className={`ab-mode ${mode === m.key ? "on" : ""}`} style={{ ["--t" as string]: m.tone }} onClick={() => changeMode(m.key)}>
              <span className="ab-ic"><m.icon size={18} /></span>
              <span className="ab-mt"><b>{m.title}</b><small>{m.when}</small></span>
              <span className="ab-md">{m.desc}</span>
            </button>
          ))}
        </div>
      )}
      {compact && <div className="row between"><b>ส่งเตือนคนที่ยังไม่ได้กรอกข้อสอบนี้</b><span className="badge b-red">{pv?.count ?? "—"} คน</span></div>}

      <div className="split" style={{ marginTop: 16 }}>
        <div>
          {mode === "invite" && (
            <div className="field">
              <label>ข้อสอบไหน?</label>
              <select value={invite} onChange={(e) => setInvite(e.target.value)}>
                {exams.map((e) => <option key={e.exam_id} value={e.exam_id}>{e.name}{e.doc_link ? "" : " (ยังไม่มีลิงก์เอกสาร)"}</option>)}
              </select>
            </div>
          )}
          {mode === "chase" && !compact && (
            <div className="field">
              <label>ตามข้อสอบไหนบ้าง? (แต่ละคนเห็นเฉพาะอันที่ตัวเองค้าง)</label>
              <div className="chips">
                {exams.map((e) => (
                  <label key={e.exam_id} className={`chip ${picked.has(e.exam_id) ? "on" : ""}`}>
                    <input type="checkbox" checked={picked.has(e.exam_id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(e.exam_id)) n.delete(e.exam_id); else n.add(e.exam_id); return n; })} />
                    {e.name} · {e.pending} คน{e.doc_link ? "" : " · ไม่มีลิงก์"}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="field">
            <label>ข้อความ (แก้ได้)</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: compact ? 80 : 104 }} />
            <div className="row between"><span className="hint" style={{ margin: 0 }}>ตัวแปร: <b>{TOKENS[mode]}</b></span><button className="btn-sm btn-ghost" onClick={() => setText(DEFAULTS[mode])}>คืนค่าเริ่มต้น</button></div>
          </div>
          {!compact && (
            <div className="field">
              <label>ปุ่มลิงก์เพิ่มเติม (ไม่บังคับ)</label>
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (ลิงก์ของแต่ละข้อสอบใส่ให้อัตโนมัติแล้ว)" />
            </div>
          )}
          <div className="stat" style={{ fontSize: 30 }}>{pv?.count ?? "—"}<small> คนจะได้รับ · คนละ 1 ข้อความ</small></div>
          <p className="hint" style={{ marginTop: 2 }}>{pv?.audience}</p>
          <label className="row" style={{ gap: 8, fontWeight: 600, margin: "8px 0 12px" }}>
            <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
            <FlaskConical size={15} /> ส่งตัวอย่างเข้า LINE แอดมินก่อน (ยังไม่ถึงเพื่อน)
          </label>
          {msg && <div className={`msg ${msg.ok ? "msg-ok" : "msg-err"}`}>{msg.t}</div>}
          <button className={testMode ? "btn-primary" : "btn-green btn-lg"} onClick={send} disabled={busy || !pv?.count}>
            <Send size={17} /> {busy ? "กำลังส่ง…" : testMode ? "ส่งตัวอย่างให้แอดมิน" : `ส่งถึง ${pv?.count ?? 0} คนเลย`}
          </button>
          {mode === "invite" && !compact && curInvite?.doc_link && (
            <div className="ab-sched">
              <Clock size={15} />
              {curInvite.doc_reminder_status === "pending" && curInvite.doc_reminder_at ? (
                <><span>ตั้งเวลาไว้ {bkkDateTime(curInvite.doc_reminder_at)} น.</span><button className="btn-sm btn-ghost" onClick={() => schedule("")} disabled={busy}>ยกเลิก</button></>
              ) : (
                <><span>หรือตั้งเวลา</span><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ maxWidth: 220 }} /><button className="btn-sm" onClick={() => schedule(when)} disabled={busy || !when}>ตั้งเวลา</button></>
              )}
            </div>
          )}
        </div>

        <div className="phone line">
          <div className="hint" style={{ color: "#fff", fontWeight: 700, margin: 0 }}>{loading ? "กำลังโหลดตัวอย่าง…" : pv?.card ? "ตัวอย่างที่เพื่อนจะเห็นใน LINE (เลื่อนซ้าย-ขวาได้)" : "ยังไม่มีใครต้องได้รับ"}</div>
          {pv?.card && (
            <div className="lc-car">
              <div className="lc-card sum">
                <div className="lc-h" style={{ background: pv.card.color }}><small>{pv.card.head}</small><b>{pv.card.title}</b></div>
                <div className="lc-body"><div style={{ whiteSpace: "pre-wrap" }}>{pv.card.text}</div>{pv.card.lines.map((l, i) => <small key={i} style={{ color: "#334155", fontWeight: 600 }}>{l}</small>)}</div>
                <span className="lc-btn" style={{ background: pv.card.color }}>{pv.card.app.label}</span>
              </div>
              {pv.card.bubbles.map((b, i) => (
                <div key={i} className="lc-card">
                  <div className="lc-h" style={{ background: pv.card!.color }}><small>📄 ข้อสอบ</small></div>
                  <div className="lc-body"><b>{b.title}</b>{b.sub && <small style={{ color: "#64748b" }}>{b.sub}</small>}</div>
                  {b.buttons.map((x, j) => <span key={j} className={`lc-btn ${j ? "sec" : ""}`} style={j ? undefined : { background: pv.card!.color }}>{x.label}</span>)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
