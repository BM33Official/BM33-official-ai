"use client";
import { useEffect, useState } from "react";
import { act } from "./api";
import { bkkDateTime } from "@/lib/bc/format";

type ExamLite = { exam_id: string; name: string; doc_link: string; doc_title: string; doc_reminder_at: string; doc_reminder_status: string };
type Mode = "unmemorized" | "redzone" | "rest" | "doc";

const MODES: { key: Mode; label: string; desc: string }[] = [
  { key: "unmemorized", label: "ยังไม่ได้จำ (ทุกคน)", desc: "ทุกคนที่ยังมีข้อสอบไม่ได้จำ อย่างน้อย 1 ครั้ง" },
  { key: "redzone", label: "เฉพาะ Red Zone", desc: "6 คนที่จำได้น้อยที่สุดของรุ่น" },
  { key: "rest", label: "ใกล้ Red Zone", desc: "คนที่ยังไม่ได้จำ แต่ยังไม่ถึง Red Zone" },
  { key: "doc", label: "เตือนกรอกเอกสาร", desc: "ส่งลิงก์เอกสารแบ่งข้อ ให้ทุกคนไปกรอก (ตั้งเวลาส่งได้)" },
];

// datetime-local (เวลาไทยในเครื่อง) -> ISO
const toISO = (local: string) => (local ? new Date(local).toISOString() : "");

export default function AcademicBroadcast({ exams }: { exams: ExamLite[] }) {
  const [mode, setMode] = useState<Mode>("unmemorized");
  const [examId, setExamId] = useState(exams.find((e) => e.doc_link)?.exam_id ?? "");
  const [testMode, setTestMode] = useState(true);
  const [when, setWhen] = useState(""); // datetime-local สำหรับ doc mode
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [pv, setPv] = useState<{ count: number; sample: string; audience: string } | null>(null);
  const [loadingPv, setLoadingPv] = useState(false);

  const docExams = exams.filter((e) => e.doc_link);
  const curExam = docExams.find((e) => e.exam_id === examId);

  useEffect(() => {
    let alive = true;
    setLoadingPv(true); setPv(null); setMsg(null);
    act("academic.preview", { mode, examId: mode === "doc" ? examId : "" })
      .then((r) => { if (alive && r.ok) setPv({ count: r.count as number, sample: r.sample as string, audience: r.audience as string }); })
      .finally(() => { if (alive) setLoadingPv(false); });
    return () => { alive = false; };
  }, [mode, examId]);

  async function send() {
    const label = MODES.find((m) => m.key === mode)?.label ?? "";
    if (mode === "doc" && !examId) { setMsg({ t: "เลือกข้อสอบที่มีลิงก์เอกสารก่อนน้า", ok: false }); return; }
    if (!testMode && !confirm(`ส่งประกาศจริงถึง "${pv?.audience || label}" (${pv?.count ?? 0} คน) เดี๋ยวนี้?`)) return;
    setBusy(true); setMsg(null);
    const r = await act("academic.broadcast", { mode, testMode, examId: mode === "doc" ? examId : "" });
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
    const r = await act("academic.scheduleDoc", { examId, at: toISO(when) });
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
      <p className="hint" style={{ marginTop: -6 }}>เลือกกลุ่มผู้รับ → ดูตัวอย่าง + จำนวนคน → กดส่ง (ข้อความปรับให้แต่ละคนอัตโนมัติ)</p>

      <div className="field">
        <label>1. จะส่งถึงใคร?</label>
        <div className="chips">
          {MODES.map((m) => (
            <label key={m.key} className={`chip ${mode === m.key ? "on" : ""}`}>
              <input type="radio" name="acadmode" checked={mode === m.key} onChange={() => setMode(m.key)} />
              {m.label}
            </label>
          ))}
        </div>
        <p className="hint">{MODES.find((m) => m.key === mode)?.desc}</p>
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
        <label>2. ตัวอย่างที่ผู้รับจะเห็น {loadingPv && <span className="hint" style={{ fontWeight: 400 }}>· กำลังโหลด…</span>}</label>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div className="preview" style={{ flex: "1 1 240px", maxWidth: 320 }}>
            <div className="pb" style={{ fontSize: 13.5, color: "#171a2b" }}>
              {pv?.sample || (loadingPv ? "…" : "— ยังไม่มีตัวอย่าง —")}
            </div>
          </div>
          <div style={{ flex: "1 1 180px" }}>
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
        <button
          className={testMode ? "btn-primary" : "btn-green"}
          onClick={send}
          disabled={busy || (pv?.count ?? 0) === 0}
        >
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
          <p className="hint">ระบบจะส่งข้อความ “เตือนกรอกเอกสาร” ให้สมาชิกทุกคนอัตโนมัติเมื่อถึงเวลาที่ตั้งไว้</p>
        </>
      )}
    </div>
  );
}
