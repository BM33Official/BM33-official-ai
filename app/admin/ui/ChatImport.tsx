"use client";
// อัปโหลดแชตกลุ่ม (LINE → ⋯ → Export chat history) ให้ AI รู้เรื่องล่าสุด
import { useState } from "react";
import { Upload } from "lucide-react";

async function gzip(text: string): Promise<Blob> {
  const cs = new CompressionStream("gzip");
  return new Response(new Blob([text]).stream().pipeThrough(cs)).blob();
}

export default function ChatImport() {
  const [source, setSource] = useState("กลุ่มหลัก");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function upload(f: File) {
    setBusy(true); setMsg(null);
    try {
      const body = await gzip(await f.text());
      if (body.size > 4_300_000) { setMsg({ ok: false, t: "ไฟล์ใหญ่เกินไป — export เฉพาะช่วงล่าสุดแทน" }); return; }
      const r = await fetch(`/admin/api/import-chat?source=${encodeURIComponent(source)}`, { method: "POST", body, headers: { "content-encoding-client": "gzip" } }).then((x) => x.json());
      setMsg(r.ok ? { ok: true, t: `เพิ่มใหม่ ${r.added.toLocaleString()} ข้อความ (รวม ${r.total.toLocaleString()} · ${r.from} → ${r.to})` } : { ok: false, t: r.error });
    } catch (e) { setMsg({ ok: false, t: String(e) }); } finally { setBusy(false); }
  }
  return (
    <div className="card">
      <div className="seg">{["กลุ่มหลัก", "OpenChat"].map((s) => <button key={s} className={source === s ? "on" : ""} onClick={() => setSource(s)}>{s}</button>)}</div>
      <label className="drop" style={{ opacity: busy ? 0.6 : 1 }}>
        <Upload size={26} color="#007aff" />
        <b>{busy ? "กำลังอ่านแชต…" : "อัปโหลดไฟล์แชต (.txt)"}</b>
        <span className="hint">LINE → ห้องแชต → ☰ → Export chat history · ข้อความซ้ำจะถูกข้ามเอง</span>
        <input type="file" hidden accept=".txt,text/plain" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      </label>
      {msg && <div className={`msg ${msg.ok ? "msg-ok" : "msg-err"}`}>{msg.t}</div>}
    </div>
  );
}
