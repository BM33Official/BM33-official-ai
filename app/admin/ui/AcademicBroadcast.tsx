"use client";
import { useEffect, useRef, useState } from "react";
import { act } from "./api";
import { bkkDateTime } from "@/lib/bc/format";

type ExamLite = { exam_id: string; name: string; doc_link: string; doc_title: string; doc_reminder_at: string; doc_reminder_status: string };
type Mode = "unmemorized" | "redzone" | "rest" | "doc";

const MODES: { key: Mode; label: string; desc: string; tokens: string }[] = [
  { key: "unmemorized", label: "ยังไม่ได้จำ (ทุกคน)", desc: "ทุกคนที่ยังมีข้อสอบไม่ได้จำ อย่างน้อย 1 ครั้ง", tokens: "{ชื่อเล่น} {จำนวน} {ข้อสอบ}" },
  { key: "redzone", label: "เฉพาะ Red Zone", desc: "6 คนที่จำได้น้อยที่สุดของรุ่น", tokens: "{ชื่อเล่น} {จำนวน} {ข้อสอบ} {จำนวนโซน}" },
  { key: "rest", label: "ใกล้ Red Zone", desc: "คนที่ยังไม่ได้จำ แต่ยังไม่ถึง Red Zone", tokens: "{ชื่อเล่น} {จำนวน} {ข้อสอบ} {ระยะห่าง}" },
  { key: "doc", label: "เตือนกรอกเอกสาร", desc: "ส่งลิงก์เอกสารแบ่งข้อ ให้ทุกคนไปกรอก (ตั้งเวลาส่งได้)", tokens: "{ชื่อเอกสาร}" },
];

// ค่าเริ่มต้นของช่องแก้ไข (ตรงกับ DEFAULT_TEMPLATES ฝั่งเซิร์ฟเวอร์)
const DEFAULTS: Record<Mode, string> = {
  unmemorized: `{ชื่อเล่น} จ๋า 📝\n\nมีข้อสอบที่ยังไม่ได้จำอยู่ {จำนวน} ครั้ง:\n{ข้อสอบ}\n\nหาเวลาทยอยจำนะ สู้ ๆ 😊`,
  redzone: `{ชื่อเล่น} จ๋า 📕\n\nตอนนี้เธออยู่ใน red zone แล้วน้า (จำข้อสอบได้น้อยสุด {จำนวนโซน} อันดับของรุ่น) รวม {จำนวน} ครั้ง\nข้อสอบที่ยังไม่ได้จำ: {ข้อสอบ}\n\nค่อย ๆ ทยอยจำนะ เดี๋ยวก็หลุดโซนแล้ว สู้ ๆ 💪`,
  rest: `{ชื่อเล่น} จ๋า 📖\n\nยังมีข้อสอบที่ยังไม่ได้จำอยู่ {จำนวน} ครั้ง ({ข้อสอบ})\nอีกแค่ {ระยะห่าง} ครั้งจะเข้า red zone แล้วน้า\n\nเร่งจำอีกนิดนะ เป็นกำลังใจให้ 🔥`,
  doc: `ฝากกรอกเอกสารแบ่งข้อรับผิดชอบด้วยน้า 📄\n\n"{ชื่อเอกสาร}"\n\nใครกรอกครบแล้วข้ามได้เลยน้า ขอบคุณมาก ๆ 🙏`,
};

const toISO = (local: string) => (local ? new Date(local).toISOString() : "");

export default function AcademicBroadcast({ exams }: { exams: ExamLite[] }) {
  const [mode, setMode] = useState<Mode>("unmemorized");
  const [examId, setExamId] = useState(exams.find((e) => e.doc_link)?.exam_id ?? "");
  const [text, setText] = useState(DEFAULTS.unmemorized);
  const [link, setLink] = useState("");
  const [testMode, setTestMode] = useState(true);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [pv, setPv] = useState<{ count: number; sample: string; audience: string } | null>(null);
  const [loadingPv, setLoadingPv] = useState(false);

  const docExams = exams.filter((e) => e.doc_link);
  const curExam = docExams.find((e) => e.exam_id === examId);
  const modeInfo = MODES.find((m) => m.key === mode)!;

  function changeMode(m: Mode) { setMode(m); setText(DEFAULTS[m]); setMsg(null); }

  // โหลดตัวอย่าง + จำนวนผู้รับ (debounce กันยิงถี่ตอนพิมพ์)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setLoadingPv(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      act("academic.preview", { mode, examId: mode === "doc" ? examId : "", template: text, link })
        .then((r) => { if (r.ok) setPv({ count: r.count as number, sample: r.sample as string, audience: r.audience as string }); })
        .finally(() => setLoadingPv(false));
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [mode, examId, text, link]);

  const payload = () => ({ mode, examId: mode === "doc" ? examId : "", template: text, link });

  async function send() {
    if (mode === "doc" && !examId) { setMsg({ t: "เลือกข้อสอบที่มีลิงก์เอกสารก่อนน้า", ok: false }); return; }
    if (!testMode && !confirm(`ส่งประกาศจริงถึง "${pv?.audience || modeInfo.label}" (${pv?.count ?? 0} คน) เดี๋ยวนี้?`)) return;
    setBusy(true); setMsg(null);
    const r = await act("academic.broadcast", { ...payload(), testMode });
    setBusy(false);
    if (r.ok) setMsg({ t: `ส่งแล้ว ${r.count} คน${r.testMode ? " · โหมดทดสอบ (ส่งตัวอย่างให้แอดมินเท่านั้น)" : " · ส่งจริงเรียบร้อย ✅"}`, ok: true });
    else {
      const reason = r.error === "no_doc_link" ? "ข้อสอบนี้ยังไม่มีลิงก์เอกสาร" : r.error === "no_recipients" ? "ไม่มีผู้รับในกลุ่มนี้" : r.error;
      setMsg({ t: `ส่งไม่ได้: ${reason}`, ok: false });
    }
  }
  async function schedule() {
    if (!examId) { setMsg({ t: "เลือกข้อสอบก่อนน้า", ok: false }); return; }
    if (!when) { setMsg({ t: "เลือกวัน–เวลาที่จะให้ส่งก่อนน้า", ok: false }); return; }
    setBusy(true); setMsg(null);
    const combined = link.trim() ? `${text}\n\n${link.trim()}` : text;
    const r = await act("academic.scheduleDoc", { examId, at: toISO(when), template: combined });
    setBusy(false);
    if (r.ok) { setMsg({ t: `ตั้งเวลาส่งเรียบร้อย ✅ ระบบจะส่งให้ทุกคนอัตโนมัติเมื่อถึงเวลา`, ok: true }); setTimeout(() => window.location.reload(), 900); }
    else setMsg({ t: "ตั้งเวลาไม่ได้ (ข้อสอบนี้ต้องมีลิงก์เอกสารก่อน)", ok: false });
  }
  async function cancelSchedule() {
    if (!examId) return;
    setBusy(true);
    const r = await act("academic.scheduleDoc", { examId, at: "" });
    setBusy(false);
    if (r.ok) { setMsg({ t: "ยกเลิกกำหนดเวลาแล้ว", ok: true }); setTimeout(() => window.location.reload(), 700); }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>ประกาศเฉพาะกลุ่ม (วิชาการ)</h2>
      <p className="hint" style={{ marginTop: -6 }}>เลือกกลุ่มผู้รับ → แก้ข้อความได้ → ดูตัวอย่าง + จำนวนคน → กดส่ง</p>

      <div className="field">
        <label>1. จะส่งถึงใคร?</label>
        <div className="chips">
          {MODES.map((m) => (
            <label key={m.key} className={`chip ${mode === m.key ? "on" : ""}`}>
              <input type="radio" name="acadmode" checked={mode === m.key} onChange={() => changeMode(m.key)} />
              {m.label}
            </label>
          ))}
        </div>
        <p className="hint">{modeInfo.desc}</p>
      </div>

      {mode === "doc" && (
        <div className="field">
          <label>เอกสารของข้อสอบไหน?</label>
          {docExams.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>ยังไม่มีข้อสอบที่ใส่ลิงก์เอกสาร — ใส่ลิงก์ตอนสร้างข้อสอบก่อนน้า</p>
          ) : (
            <select value={examId} onChange={(e) => setExamId(e.target.value)}>
              {docExams.map((e) => <option key={e.exam_id} value={e.exam_id}>{e.doc_title || e.name}</option>)}
            </select>
          )}
          {curExam?.doc_reminder_status === "pending" && curExam.doc_reminder_at && (
            <div className="msg msg-ok" style={{ marginTop: 10 }}>
              ⏰ ตั้งเวลาส่งอัตโนมัติไว้: {bkkDateTime(curExam.doc_reminder_at)} น.
              <button className="btn-sm btn-ghost" style={{ marginLeft: 8 }} onClick={cancelSchedule} disabled={busy}>ยกเลิก</button>
            </div>
          )}
        </div>
      )}

      <div className="field">
        <label>2. ข้อความ (แก้ได้)</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 130 }} />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <p className="hint" style={{ margin: "4px 0 0" }}>ตัวแปรที่ใช้ได้: <b>{modeInfo.tokens}</b> · ระบบจะแทนค่าจริงให้แต่ละคนอัตโนมัติ</p>
          <button className="btn-sm btn-ghost" onClick={() => setText(DEFAULTS[mode])}>คืนค่าเริ่มต้น</button>
        </div>
      </div>

      <div className="field">
        <label>แนบลิงก์ท้ายข้อความ (ไม่บังคับ)</label>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="วางลิงก์ที่อยากให้ต่อท้ายทุกข้อความ เช่น เอกสาร/ฟอร์ม" />
      </div>

      <div className="field">
        <label>3. ตัวอย่างที่ผู้รับจะเห็น {loadingPv && <span className="hint" style={{ fontWeight: 400 }}>· กำลังโหลด…</span>}</label>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div className="preview" style={{ flex: "1 1 240px", maxWidth: 320 }}>
            <div className="pb" style={{ fontSize: 13.5, color: "#171a2b" }}>
              {pv?.sample || (loadingPv ? "…" : "— ยังไม่มีตัวอย่าง —")}
            </div>
          </div>
          <div style={{ flex: "1 1 170px" }}>
            <div className="stat" style={{ fontSize: 30 }}>{pv?.count ?? "—"}<small> คนจะได้รับ</small></div>
            <p className="hint" style={{ marginTop: 4 }}>{pv?.audience || ""}</p>
          </div>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 10 }}>
        <label className="row" style={{ gap: 8, fontWeight: 700 }}>
          <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
          โหมดทดสอบ — ส่งตัวอย่างให้แอดมินเท่านั้น (ยังไม่ส่งถึงเพื่อนจริง)
        </label>
      </div>

      {msg && <div className={`msg ${msg.ok ? "msg-ok" : "msg-err"}`}>{msg.t}</div>}

      <div className="row">
        <button className={testMode ? "btn-primary" : "btn-green"} onClick={send} disabled={busy || (pv?.count ?? 0) === 0}>
          {busy ? "กำลังส่ง…" : testMode ? `🧪 ส่งทดสอบให้แอดมิน` : `📢 ส่งจริงถึง ${pv?.count ?? 0} คน เดี๋ยวนี้`}
        </button>
      </div>

      {mode === "doc" && examId && (
        <>
          <hr className="divider" />
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 7 }}>หรือ ตั้งเวลาส่งอัตโนมัติ (ส่งจริงถึงทุกคน)</label>
          <div className="row">
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ maxWidth: 240 }} />
            <button className="btn" onClick={schedule} disabled={busy || !when}>⏰ ตั้งเวลาส่ง</button>
          </div>
          <p className="hint">ระบบจะส่งข้อความ “เตือนกรอกเอกสาร” (ข้อความที่แก้ไว้ด้านบน) ให้สมาชิกทุกคนอัตโนมัติเมื่อถึงเวลา</p>
        </>
      )}
    </div>
  );
}
