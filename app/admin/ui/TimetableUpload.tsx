"use client";
import { useState } from "react";

const CHUNK = 3 * 1024 * 1024; // ต้องเป็นทวีคูณของ 256KB (ข้อกำหนด resumable upload)
const DIRECT_MAX = 3.8 * 1024 * 1024;

async function downscale(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const max = 2400;
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.88));
}

export default function TimetableUpload() {
  const [block, setBlock] = useState("");
  const [mode, setMode] = useState<"file" | "sheet" | "text">("file");
  const [link, setLink] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const post = async (body: BodyInit, json = false) => {
    const r = await fetch("/admin/api/upload", { method: "POST", body, headers: json ? { "content-type": "application/json" } : undefined });
    return r.json();
  };

  async function run(file?: File) {
    setBusy(true); setMsg({ ok: true, t: "กำลังอัปโหลด…" });
    try {
      type Res = { ok: boolean; error?: string; sessions?: number; exams?: number; warnings?: string[] };
      let r: Res | undefined;
      if (mode === "sheet") r = await post(JSON.stringify({ op: "sheet", link, block }), true);
      else if (mode === "text") r = await post(JSON.stringify({ op: "text", text, block }), true);
      else {
        if (!file) return;
        let blob: Blob = file;
        let mime = file.type || "application/pdf";
        if (mime.startsWith("image/")) { blob = await downscale(file); mime = "image/jpeg"; }
        if (/sheet|excel|xlsx|xls/.test(mime) || /\.xlsx?$/i.test(file.name)) {
          setMsg({ ok: false, t: "ไฟล์ Excel: บันทึกเป็น PDF หรืออัปขึ้น Google Sheet แล้ววางลิงก์แทนนะ" }); return;
        }
        if (blob.size <= DIRECT_MAX) {
          const fd = new FormData();
          fd.append("file", new File([blob], file.name, { type: mime }));
          fd.append("block", block);
          setMsg({ ok: true, t: "AI กำลังอ่านตาราง… (อาจใช้เวลา 20–50 วินาที)" });
          r = await post(fd);
        } else {
          const s = await post(JSON.stringify({ op: "start", name: file.name, mime, size: blob.size }), true);
          if (!s.ok) throw new Error(s.error);
          for (let off = 0; off < blob.size; off += CHUNK) {
            const part = blob.slice(off, off + CHUNK);
            const final = off + CHUNK >= blob.size;
            const fd = new FormData();
            fd.append("op", "chunk"); fd.append("token", s.token); fd.append("offset", String(off)); fd.append("final", final ? "1" : "0"); fd.append("chunk", part);
            setMsg({ ok: true, t: `กำลังอัปโหลด ${Math.min(100, Math.round(((off + part.size) / blob.size) * 100))}%` });
            const c = await post(fd);
            if (!c.ok) throw new Error(c.error);
            if (final) {
              setMsg({ ok: true, t: "AI กำลังอ่านตาราง… (อาจใช้เวลา 20–50 วินาที)" });
              r = await post(JSON.stringify({ op: "parse", fileUri: c.fileUri, mime: c.mime, name: file.name, block }), true);
            }
          }
        }
      }
      if (!r?.ok) throw new Error(r?.error || "ไม่สำเร็จ");
      setMsg({ ok: true, t: `อ่านได้ ${r.sessions} คาบ · ${r.exams} สอบ ✅ ตรวจในส่วน “รอตรวจ” ด้านล่างแล้วกดเผยแพร่${r.warnings?.length ? ` · ⚠️ ${r.warnings.join(" / ")}` : ""}` });
      setTimeout(() => window.location.reload(), 1600);
    } catch (e) {
      setMsg({ ok: false, t: `ไม่สำเร็จ: ${String((e as Error).message ?? e)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <b>อัปโหลดตารางของ block ใหม่</b>
      <p className="hint">รองรับ PDF · รูปถ่าย/สกรีนช็อต · CSV · ลิงก์ Google Sheet · หรือวางข้อความ — AI จะแยกเป็นคาบเรียนทีละคาบ (วัน เวลา วิชา อาจารย์ ตึก ห้อง) และหาวันสอบให้ด้วย</p>
      <div className="grid g2">
        <div className="field"><label>ชื่อ block (เช่น Block Immune)</label><input value={block} onChange={(e) => setBlock(e.target.value)} placeholder="ไม่ใส่ก็ได้ AI จะเดาจากไฟล์" /></div>
        <div className="field"><label>รูปแบบ</label>
          <div className="chips">
            {([["file", "ไฟล์"], ["sheet", "ลิงก์ Google Sheet"], ["text", "วางข้อความ"]] as const).map(([k, l]) => (
              <label key={k} className={`chip ${mode === k ? "on" : ""}`}><input type="radio" checked={mode === k} onChange={() => setMode(k)} />{l}</label>
            ))}
          </div>
        </div>
      </div>
      {mode === "file" && <input type="file" accept="application/pdf,image/*,.csv,text/csv,text/plain" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); }} />}
      {mode === "sheet" && <div className="row" style={{ flexWrap: "nowrap" }}><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" /><button className="btn-primary" disabled={busy || !link} onClick={() => run()}>อ่านตาราง</button></div>}
      {mode === "text" && <><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="วางตารางเรียน…" /><button className="btn-primary" style={{ marginTop: 8 }} disabled={busy || !text} onClick={() => run()}>อ่านตาราง</button></>}
      {msg && <div className={`msg ${msg.ok ? "msg-ok" : "msg-err"}`}>{msg.t}</div>}
    </div>
  );
}
