"use client";
// ตรวจจำข้อสอบ 3 ขั้น: ① ใบแบ่งข้อ ② เอกสารที่ทุกคนพิมพ์ข้อสอบ ③ AI ติ๊กให้ → ฝ่ายวิชาการแค่ตรวจทานแล้วบันทึก
import { useMemo, useRef, useState } from "react";
import { Sparkles, Upload, FileText, Link2, Check, Save, AlertTriangle, RotateCcw } from "lucide-react";
import { act } from "./api";
import { Ring } from "./kit";

type Student = { sid: string; no: number; nickname: string };
type Exam = { id: string; name: string; assign: string; count: number };
type AssignMap = Record<string, number[]>;
type Result = { count: number; map: AssignMap; filled: number[]; unresolved: string[]; note: string; method: string; warnings: string[] };

function Drop({ files, setFiles, multiple, label }: { files: File[]; setFiles: (f: File[]) => void; multiple?: boolean; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <label className="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setFiles(multiple ? [...files, ...Array.from(e.dataTransfer.files)] : Array.from(e.dataTransfer.files).slice(0, 1)); }}>
        <Upload size={26} color="#007aff" />
        <b>{label}</b>
        <span className="hint">ลากไฟล์มาวาง หรือแตะเพื่อเลือก · Word, Excel, PDF, รูป</span>
        <input ref={ref} type="file" hidden multiple={multiple} accept=".docx,.xlsx,.xls,.csv,.pdf,.txt,image/*"
          onChange={(e) => { const f = Array.from(e.target.files ?? []); setFiles(multiple ? [...files, ...f] : f.slice(0, 1)); e.target.value = ""; }} />
      </label>
      {files.map((f, i) => <span key={i} className="filechip"><FileText size={14} /> {f.name} <button className="btn-ghost" style={{ padding: 0, minHeight: 0, background: "none" }} onClick={(e) => { e.preventDefault(); setFiles(files.filter((_, k) => k !== i)); }}>✕</button></span>)}
    </>
  );
}

export default function RecallWizard({ exam, students, initialIds }: { exam: Exam; students: Student[]; initialIds: string[] }) {
  const hasOld = exam.assign.length > 2;
  const [mode, setMode] = useState<"file" | "mod" | "keep">(hasOld ? "keep" : "file");
  const [aFiles, setAFiles] = useState<File[]>([]);
  const [aLink, setALink] = useState("");
  const [count, setCount] = useState(exam.count ? String(exam.count) : "");
  const [dFiles, setDFiles] = useState<File[]>([]);
  const [dLinks, setDLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [filled, setFilled] = useState<Set<number>>(new Set());
  const [over, setOver] = useState<Map<string, "ok" | "miss">>(new Map());
  const [saved, setSaved] = useState("");

  const ready = (mode === "keep" || (mode === "mod" ? Number(count) > 0 : aFiles.length > 0 || /^https?:\/\//.test(aLink.trim()))) && (dFiles.length > 0 || /https?:\/\//.test(dLinks));

  async function run() {
    setBusy(true); setErr(""); setRes(null); setSaved("");
    const fd = new FormData();
    fd.set("assignMode", mode); fd.set("count", count);
    if (mode === "keep") fd.set("assignJson", exam.assign);
    if (mode === "file") { fd.set("assignLink", aLink.trim()); aFiles.forEach((f) => fd.append("assignFile", f)); }
    fd.set("docLinks", dLinks); dFiles.forEach((f) => fd.append("docFiles", f));
    try {
      const r = await fetch("/admin/api/recall", { method: "POST", body: fd }).then((x) => x.json());
      if (!r.ok) { setErr(r.error || "ตรวจไม่สำเร็จ"); return; }
      setRes(r); setFilled(new Set(r.filled)); setOver(new Map());
      if (!count) setCount(String(r.count));
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  const total = res ? Math.max(res.count, ...res.filled, 0) : 0;
  const whoHas = useMemo(() => {
    const m = new Map<number, string[]>();
    if (res) for (const [sid, qs] of Object.entries(res.map)) for (const q of qs) m.set(q, [...(m.get(q) ?? []), sid]);
    return m;
  }, [res]);
  const rows = useMemo(() => students.map((s) => {
    const assigned = res?.map[s.sid] ?? [];
    const missing = assigned.filter((q) => !filled.has(q));
    const auto: "ok" | "miss" | "none" = !assigned.length ? "none" : missing.length ? "miss" : "ok";
    const o = over.get(s.sid);
    return { ...s, assigned, missing, auto, state: (o ?? auto) as "ok" | "miss" | "none", manual: !!o };
  }), [students, res, filled, over]);
  const miss = rows.filter((r) => r.state === "miss");
  const ok = rows.filter((r) => r.state === "ok");
  const none = rows.filter((r) => r.state === "none");
  const nick = new Map(students.map((s) => [s.sid, `#${s.no} ${s.nickname}`]));

  const toggleQ = (q: number) => setFilled((f) => { const n = new Set(f); if (n.has(q)) n.delete(q); else n.add(q); return n; });
  const toggleS = (r: (typeof rows)[number]) => setOver((m) => {
    const n = new Map(m);
    const next = r.state === "miss" ? "ok" : "miss";
    if (next === r.auto) n.delete(r.sid); else n.set(r.sid, next);
    return n;
  });

  async function save() {
    if (!res) return;
    setBusy(true);
    const r = await act("academic.saveCheck", { examId: exam.id, map: res.map, filled: Array.from(filled).sort((a, b) => a - b), ids: miss.map((x) => x.sid), count: total });
    setBusy(false);
    if (r.ok) { setSaved(`บันทึกแล้ว — ${miss.length} คนถูกนับว่ายังไม่ได้จำ · Red Zone อัปเดตแล้ว`); setTimeout(() => window.location.reload(), 1200); }
    else setErr(String(r.error ?? "บันทึกไม่สำเร็จ"));
  }

  return (
    <div className="card">
      {!res && (
        <>
          <div className="wiz-step">
            <span className={`n ${mode === "keep" || aFiles.length || aLink || (mode === "mod" && count) ? "done" : ""}`}>1</span>
            <div>
              <h3>ใครต้องจำข้อไหน</h3>
              <div className="seg">
                <button className={mode === "file" ? "on" : ""} onClick={() => setMode("file")}>อัปโหลดใบแบ่งข้อ</button>
                <button className={mode === "mod" ? "on" : ""} onClick={() => setMode("mod")}>ใช้เลขที่ = เลขข้อ</button>
                {hasOld && <button className={mode === "keep" ? "on" : ""} onClick={() => setMode("keep")}>ใช้ใบเดิมของข้อสอบนี้</button>}
              </div>
              {mode === "file" && (
                <>
                  <Drop files={aFiles} setFiles={setAFiles} label="ใบแบ่งข้อ (ชีต/รูป/ไฟล์)" />
                  <div className="row" style={{ marginTop: 10, flexWrap: "nowrap" }}><Link2 size={18} color="#8e8e93" /><input style={{ flex: 1 }} value={aLink} onChange={(e) => setALink(e.target.value)} placeholder="หรือวางลิงก์ Google Sheet / Doc" /></div>
                </>
              )}
              {mode === "mod" && (
                <div className="row"><span>ข้อสอบมีทั้งหมด</span><input type="number" min={1} style={{ width: 100 }} value={count} onChange={(e) => setCount(e.target.value)} /><span>ข้อ</span><span className="hint">เลขที่ 1 จำข้อ 1, เลขที่ 2 จำข้อ 2 … วนซ้ำ</span></div>
              )}
              {mode === "keep" && <span className="hint">ใช้การแบ่งข้อที่ตรวจไว้ครั้งก่อนของ “{exam.name}”</span>}
            </div>
          </div>
          <div className="wiz-step">
            <span className={`n ${dFiles.length || dLinks ? "done" : ""}`}>2</span>
            <div>
              <h3>เอกสารที่ทุกคนพิมพ์ข้อสอบลงไป</h3>
              <Drop files={dFiles} setFiles={setDFiles} multiple label="ไฟล์ข้อสอบที่รวบรวม (ใส่ได้หลายไฟล์)" />
              <div className="row" style={{ marginTop: 10, flexWrap: "nowrap" }}><Link2 size={18} color="#8e8e93" /><input style={{ flex: 1 }} value={dLinks} onChange={(e) => setDLinks(e.target.value)} placeholder="หรือวางลิงก์ Google Doc (หลายลิงก์คั่นด้วยเว้นวรรค)" /></div>
              <div className="hint" style={{ marginTop: 6 }}>ลิงก์ต้องเปิดแบบ “ทุกคนที่มีลิงก์ดูได้” หรือแชร์ให้ service account</div>
            </div>
          </div>
          <div className="wiz-step">
            <span className="n">3</span>
            <div>
              <h3>ให้ AI ตรวจ</h3>
              <button className="btn-primary" style={{ fontSize: 17, padding: "12px 22px" }} disabled={!ready || busy} onClick={run}><Sparkles size={18} /> {busy ? "AI กำลังอ่าน… (ราว 20–40 วินาที)" : "ตรวจเลย"}</button>
              <div className="hint" style={{ marginTop: 8 }}>ข้อที่ไม่มีใครพิมพ์ → ทุกคนที่รับข้อนั้นถูกนับว่า “ยังไม่ได้จำ” · ยังไม่บันทึกจนกว่าคุณจะกดยืนยัน</div>
            </div>
          </div>
        </>
      )}
      {err && <div className="msg msg-err"><AlertTriangle size={15} /> {err}</div>}

      {res && (
        <>
          <div className="row" style={{ gap: 26, alignItems: "center" }}>
            <Ring value={filled.size} max={total || 1} size={120} stroke={12} tone={filled.size === total ? "green" : "blue"} label={filled.size} sub={`จาก ${total} ข้อ`} />
            <div className="row" style={{ gap: 28 }}>
              <div><div className="bignum" style={{ color: "var(--green-ink)" }}>{ok.length}</div><div className="hint">จำครบ</div></div>
              <div><div className="bignum" style={{ color: "var(--red-ink)" }}>{miss.length}</div><div className="hint">ยังไม่ได้จำ</div></div>
              <div><div className="bignum muted">{none.length}</div><div className="hint">ไม่มีข้อในใบแบ่ง</div></div>
            </div>
            <button className="btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setRes(null)}><RotateCcw size={15} /> ตรวจใหม่</button>
          </div>
          {(res.note || res.unresolved.length > 0 || res.warnings.length > 0) && (
            <div className="card flat" style={{ marginTop: 14, padding: 12 }}>
              {res.note && <div className="hint"><Sparkles size={13} /> AI: {res.note}</div>}
              {res.unresolved.length > 0 && <div className="hint" style={{ color: "var(--orange-ink)" }}>หาไม่เจอในรายชื่อ: {res.unresolved.join(", ")}</div>}
              {res.warnings.map((w, i) => <div key={i} className="hint" style={{ color: "var(--orange-ink)" }}>{w}</div>)}
            </div>
          )}

          <h3 style={{ marginTop: 22 }}>แต่ละข้อ <span className="hint" style={{ fontWeight: 600 }}>เขียว = มีคนพิมพ์แล้ว · แดง = ยังว่าง · แตะเพื่อแก้</span></h3>
          <div className="qstrip">
            {Array.from({ length: total }, (_, i) => i + 1).map((q) => (
              <button key={q} className={`${filled.has(q) ? "" : "no"} ${filled.has(q) !== res.filled.includes(q) ? "dirty" : ""}`} onClick={() => toggleQ(q)}
                title={`ข้อ ${q} · ${(whoHas.get(q) ?? []).map((s) => nick.get(s)).join(", ") || "ไม่มีคนรับ"}`}>{q}</button>
            ))}
          </div>

          <h3 style={{ marginTop: 22 }}>แต่ละคน <span className="hint" style={{ fontWeight: 600 }}>แตะเพื่อสลับ จำแล้ว ↔ ยังไม่ได้จำ</span></h3>
          <div className="dots">
            {rows.map((r) => (
              <button key={r.sid} className={`d ${r.state === "ok" ? "ok" : r.state === "miss" ? "bad" : "none"} ${r.manual ? "ring-red" : ""}`}
                title={`${r.nickname} · ${r.assigned.length ? `ข้อ ${r.assigned.join(", ")}` : "ไม่มีข้อ"}${r.missing.length ? ` · ว่าง: ${r.missing.join(", ")}` : ""}`}
                onClick={() => toggleS(r)}>{r.no}</button>
            ))}
          </div>
          <div className="legend" style={{ marginTop: 10 }}><span><i style={{ background: "#34c759" }} />จำแล้ว</span><span><i style={{ background: "#ff3b30" }} />ยังไม่ได้จำ</span><span><i style={{ background: "#e5e5ea" }} />ไม่มีข้อ</span><span><i style={{ background: "#fff", boxShadow: "0 0 0 2px #ff3b30 inset" }} />แก้เอง</span></div>

          {miss.length > 0 && (
            <div className="list" style={{ marginTop: 16 }}>
              {miss.map((r) => {
                const shared = Array.from(new Set(r.missing.flatMap((q) => (whoHas.get(q) ?? []).filter((x) => x !== r.sid))));
                return (
                  <div key={r.sid} className="li">
                    <span className="ic c-red" style={{ fontWeight: 800, fontSize: 13 }}>{r.no}</span>
                    <div className="li-b"><b>{r.nickname}</b><small>{r.manual ? "ติ๊กเอง" : `ข้อ ${r.missing.join(", ")} ยังว่าง`}{shared.length ? ` · รับข้อเดียวกับ ${shared.map((s) => nick.get(s)).join(", ")}` : ""}</small></div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="sticky-bar">
            {saved ? <span className="msg msg-ok" style={{ margin: 0 }}><Check size={15} /> {saved}</span> : (
              <>
                <span className="hint" style={{ marginRight: "auto", alignSelf: "center" }}>{exam.name} · {miss.length} คนยังไม่ได้จำ</span>
                <button className="btn-green" disabled={busy} onClick={save}><Save size={17} /> ถูกต้อง บันทึก</button>
              </>
            )}
          </div>
        </>
      )}
      {!res && initialIds.length > 0 && <div className="hint" style={{ marginTop: 6 }}>ข้อสอบนี้บันทึกไว้แล้ว {initialIds.length} คนที่ยังไม่ได้จำ — ตรวจใหม่จะแทนที่ของเดิม</div>}
    </div>
  );
}
