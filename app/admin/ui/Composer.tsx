"use client";
import { useState } from "react";
import { act } from "./api";

type FormOpt = { form_id: string; name: string };

type Initial = Partial<{
  id: string; title: string; body_text: string; message_type: "text" | "flex" | "image";
  header_color: string; button_label: string; button_action: "" | "uri" | "postback";
  button_value: string; segment_form_id: string; segment_condition: string; test_mode: string;
  image_url: string;
}>;

export default function Composer({ forms, initial }: { forms: FormOpt[]; initial?: Initial }) {
  const [editId] = useState(initial?.id ?? "");
  const [f, setF] = useState({
    title: initial?.title ?? "", body_text: initial?.body_text ?? "",
    message_type: (initial?.message_type ?? "flex") as "text" | "flex" | "image",
    header_color: initial?.header_color ?? "#06C755", button_label: initial?.button_label ?? "",
    button_action: (initial?.button_action ?? "") as "" | "uri" | "postback",
    button_value: initial?.button_value ?? "", segment_form_id: initial?.segment_form_id ?? "",
    segment_condition: initial?.segment_condition ?? "undone",
    image_url: initial?.image_url ?? "",
  });
  const [mode, setMode] = useState<"now" | "schedule" | "recurring">("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const [rec, setRec] = useState({ cadenceDays: 3, cap: 3 });
  const [testMode, setTestMode] = useState(initial ? initial.test_mode === "1" : true);
  const [est, setEst] = useState<{ count: number; remaining: number | null } | null>(null);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });

  async function estimate() {
    setBusy(true);
    const r = await act("broadcast.estimate", { data: { segment_form_id: f.segment_form_id, segment_condition: f.segment_condition } });
    setBusy(false);
    if (r.ok) setEst({ count: Number(r.count), remaining: (r.quota as { remaining: number | null })?.remaining ?? null });
  }

  async function saveDraft() {
    setBusy(true); setMsg(null);
    const r = editId
      ? await act("broadcast.update", { id: editId, patch: payload() })
      : await act("broadcast.create", { data: payload() });
    setBusy(false);
    setMsg(r.ok ? { t: "บันทึกร่างแล้ว", ok: true } : { t: String(r.error), ok: false });
    if (r.ok) setTimeout(() => (window.location.href = "/admin/broadcasts"), 700);
  }

  function payload() {
    const recurring = mode === "recurring"
      ? JSON.stringify({ cadenceDays: rec.cadenceDays, cap: rec.cap, untilDone: true, autoSend: false })
      : "";
    const schedule_at = mode === "schedule" || mode === "recurring"
      ? (scheduleAt ? new Date(scheduleAt).toISOString() : new Date().toISOString()) : "";
    return { ...f, test_mode: testMode ? "1" : "0", schedule_at, recurring };
  }

  async function approveSend() {
    if (!f.body_text && !f.title) { setMsg({ t: "ใส่ข้อความก่อนนะ", ok: false }); return; }
    setBusy(true); setMsg(null);
    let id = editId;
    if (id) {
      const u = await act("broadcast.update", { id, patch: payload() });
      if (!u.ok) { setBusy(false); setMsg({ t: String(u.error), ok: false }); return; }
    } else {
      const c = await act("broadcast.create", { data: payload() });
      if (!c.ok) { setBusy(false); setMsg({ t: String(c.error), ok: false }); return; }
      id = String(c.id);
    }
    const r = await act("broadcast.approveSend", { id });
    setBusy(false);
    if (r.scheduled) setMsg({ t: "ตั้งเวลา/ตั้งเตือนซ้ำเรียบร้อย รอระบบส่งตามเวลา", ok: true });
    else if (r.ok) setMsg({ t: `ส่งแล้ว ${r.count} คน${r.testMode ? " (โหมดทดสอบ — ส่งหาแอดมินเท่านั้น)" : ""}`, ok: true });
    else if (r.blocked) setMsg({ t: `ส่งไม่ได้ (${r.blocked})`, ok: false });
    else setMsg({ t: `ส่งไม่ได้: ${r.error || "no_recipients"}`, ok: false });
    if (r.ok || r.scheduled) setTimeout(() => window.location.reload(), 1200);
  }

  return (
    <div className="grid g2">
      {/* ── ฟอร์มเขียน ── */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{editId ? "✏️ แก้ไขร่าง" : "เขียนบรอดแคสต์"} {editId && <a href="/admin/broadcasts" style={{ fontSize: 13 }}>+ ร่างใหม่</a>}</h2>

        <div className="field"><label>ส่งถึงใคร</label>
          <div className="row">
            <select style={{ flex: 1 }} value={f.segment_form_id} onChange={(e) => set({ segment_form_id: e.target.value })}>
              <option value="">ทุกคนที่ยืนยันตัวตนแล้ว</option>
              {forms.map((x) => <option key={x.form_id} value={x.form_id}>ตามฟอร์ม: {x.name}</option>)}
            </select>
            {f.segment_form_id && (
              <select value={f.segment_condition} onChange={(e) => set({ segment_condition: e.target.value })}>
                <option value="undone">คนที่ยังไม่ทำ</option>
                <option value="done">คนที่ทำแล้ว</option>
                <option value="all">ทุกคน</option>
              </select>
            )}
            <button className="btn-sm" onClick={estimate} disabled={busy}>ประเมิน</button>
          </div>
          {est && <div className="hint">จะส่งถึง <b>{est.count}</b> คน · โควตาเหลือ {est.remaining === null ? "∞" : est.remaining}</div>}
        </div>

        <div className="field"><label>รูปแบบ</label>
          <div className="row">
            <select value={f.message_type} onChange={(e) => set({ message_type: e.target.value as "text" | "flex" | "image" })}>
              <option value="flex">การ์ด (มีสี/ปุ่ม)</option>
              <option value="text">ข้อความธรรมดา</option>
              <option value="image">รูปภาพ 🖼️</option>
            </select>
            {f.message_type === "flex" && (
              <label className="row" style={{ gap: 6 }}>สีหัวการ์ด
                <input type="color" style={{ width: 44, padding: 2 }} value={f.header_color} onChange={(e) => set({ header_color: e.target.value })} />
              </label>
            )}
          </div>
        </div>

        {f.message_type === "image" && (
          <div className="field"><label>ลิงก์รูปภาพ (https)</label>
            <input value={f.image_url} onChange={(e) => set({ image_url: e.target.value })} placeholder="https://... (JPEG/PNG · เปิดดูได้แบบสาธารณะ)" />
            <div className="hint">ต้องเป็นลิงก์ https ที่เปิดดูรูปได้ตรง ๆ เช่น imgur, Cloudinary หรือ Google Drive แบบ uc?export=view&id=… · ใส่ข้อความด้านล่างเป็นแคปชันต่อจากรูปได้</div></div>
        )}

        {f.message_type === "flex" && (
          <div className="field"><label>หัวข้อ (หัวการ์ด)</label>
            <input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="เช่น 📢 เก็บเงินรุ่นเดือนนี้" /></div>
        )}
        <div className="field"><label>{f.message_type === "image" ? "ข้อความประกอบรูป (แคปชัน — ไม่บังคับ)" : "ข้อความ"}</label>
          <textarea value={f.body_text} onChange={(e) => set({ body_text: e.target.value })} placeholder={f.message_type === "image" ? "ข้อความที่จะส่งต่อจากรูป (เว้นว่างได้)" : "พิมพ์ข้อความ… ใช้ {name} เพื่อแทนชื่อผู้รับได้"} />
          <div className="hint">ใส่ {"{name}"} เพื่อแทนชื่อผู้รับ (จะส่งแบบรายคน)</div></div>

        {f.message_type === "flex" && (
          <div className="grid g2">
            <div className="field"><label>ปุ่ม (ไม่บังคับ)</label>
              <select value={f.button_action} onChange={(e) => set({ button_action: e.target.value as "" | "uri" | "postback" })}>
                <option value="">ไม่มีปุ่ม</option>
                <option value="uri">ลิงก์ (เปิดเว็บ/ฟอร์ม)</option>
                <option value="postback">ปุ่ม &quot;ทำแล้ว&quot; (ให้ AI ตรวจ)</option>
              </select></div>
            {f.button_action && (
              <div className="field"><label>ข้อความบนปุ่ม</label>
                <input value={f.button_label} onChange={(e) => set({ button_label: e.target.value })} placeholder={f.button_action === "uri" ? "กรอกฟอร์ม" : "จ่ายแล้ว/ทำแล้ว"} /></div>
            )}
            {f.button_action === "uri" && (
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>ลิงก์ปลายทาง</label>
                <input value={f.button_value} onChange={(e) => set({ button_value: e.target.value })} placeholder="https://..." /></div>
            )}
            {f.button_action === "postback" && (
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>ผูกกับฟอร์ม</label>
                <select value={f.button_value.replace("verify:", "")} onChange={(e) => set({ button_value: e.target.value ? `verify:${e.target.value}` : "" })}>
                  <option value="">— เลือกฟอร์มที่ปุ่มนี้ยืนยัน —</option>
                  {forms.map((x) => <option key={x.form_id} value={x.form_id}>{x.name}</option>)}
                </select></div>
            )}
          </div>
        )}

        <div className="field"><label>เวลาส่ง</label>
          <div className="row">
            <label className="row" style={{ gap: 5 }}><input type="radio" style={{ width: "auto" }} checked={mode === "now"} onChange={() => setMode("now")} /> ส่งเดี๋ยวนี้</label>
            <label className="row" style={{ gap: 5 }}><input type="radio" style={{ width: "auto" }} checked={mode === "schedule"} onChange={() => setMode("schedule")} /> ตั้งเวลา</label>
            <label className="row" style={{ gap: 5 }}><input type="radio" style={{ width: "auto" }} checked={mode === "recurring"} onChange={() => setMode("recurring")} /> เตือนซ้ำ</label>
          </div>
          {(mode === "schedule" || mode === "recurring") && (
            <input type="datetime-local" style={{ marginTop: 8 }} value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          )}
          {mode === "recurring" && (
            <div className="row" style={{ marginTop: 8 }}>
              <label className="row" style={{ gap: 5 }}>ทุก <input type="number" min={1} style={{ width: 64 }} value={rec.cadenceDays} onChange={(e) => setRec({ ...rec, cadenceDays: +e.target.value })} /> วัน</label>
              <label className="row" style={{ gap: 5 }}>สูงสุด <input type="number" min={1} style={{ width: 64 }} value={rec.cap} onChange={(e) => setRec({ ...rec, cap: +e.target.value })} /> ครั้ง</label>
              <span className="hint">เตือนเฉพาะคนที่ยังไม่ทำ จนกว่าจะทำ (แต่ละรอบเข้าคิวรออนุมัติ)</span>
            </div>
          )}
        </div>

        <div className="field">
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
            โหมดทดสอบ (ส่งหาแอดมินเท่านั้น — ไม่กินโควตาจริง)
          </label>
        </div>

        {msg && <div className={`msg ${msg.ok ? "msg-ok" : "msg-err"}`}>{msg.t}</div>}
        <div className="row">
          <button className="btn-primary" onClick={approveSend} disabled={busy}>
            {mode === "now" ? "อนุมัติ & ส่ง" : "อนุมัติ & ตั้งคิว"}
          </button>
          <button onClick={saveDraft} disabled={busy}>บันทึกร่าง</button>
        </div>
        {!testMode && <div className="hint" style={{ color: "var(--danger)" }}>⚠️ ปิดโหมดทดสอบแล้ว — จะส่งหาสมาชิกจริงและกินโควตา</div>}
      </div>

      {/* ── พรีวิว ── */}
      <div>
        <h2 style={{ marginTop: 0 }}>ตัวอย่าง</h2>
        {f.message_type === "flex" ? (
          <div className="preview">
            <div className="ph" style={{ background: f.header_color }}>{f.title || "หัวข้อ"}</div>
            <div className="pb">{f.body_text || "ข้อความ…"}</div>
            {f.button_action && f.button_label && (
              <div className="pf"><div className="pbtn" style={{ background: f.header_color }}>{f.button_label}</div></div>
            )}
          </div>
        ) : f.message_type === "image" ? (
          <div className="preview" style={{ maxWidth: 300 }}>
            {f.image_url
              ? /* eslint-disable-next-line @next/next/no-img-element */
                <img src={f.image_url} alt="preview" style={{ display: "block", width: "100%", height: "auto" }} onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.25"; }} />
              : <div className="pb" style={{ textAlign: "center", color: "var(--muted)" }}>วางลิงก์รูปเพื่อดูตัวอย่าง 🖼️</div>}
            {f.body_text && <div className="pb">{f.body_text}</div>}
          </div>
        ) : (
          <div className="msg" style={{ background: "#e8f7ee", maxWidth: 300 }}>{f.body_text || "ข้อความ…"}</div>
        )}
        <p className="hint" style={{ marginTop: 12 }}>พรีวิวนี้ใกล้เคียงกับที่จะแสดงใน LINE</p>
      </div>
    </div>
  );
}
