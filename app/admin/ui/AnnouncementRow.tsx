"use client";
import { useState } from "react";
import { act } from "./api";
import AnnouncementEditor, { AnnDraft } from "./AnnouncementEditor";

export default function AnnouncementRow({ a, meta, forms, committee }: {
  a: AnnDraft & { id: string }; meta: { created: string; deadline: string; rel: string; source: string; reminders: string };
  forms: { id: string; name: string }[]; committee: { nickname: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  async function toggle(status: string) {
    await act("announce.update", { id: a.id, patch: { status } });
    window.location.reload();
  }
  async function remind() {
    if (!confirm("สร้างข้อความเตือนเข้ากล่องรอตรวจ (และทักคุณใน LINE)?")) return;
    const r = await act("announce.remind", { id: a.id });
    setMsg(r.ok ? `เข้ากล่องรอตรวจแล้ว #${r.code}` : `ไม่สำเร็จ: ${r.error}`);
  }
  const st = a.status;
  return (
    <div className="card" style={{ marginBottom: 10, padding: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className={`badge ${st === "live" ? "b-ok" : st === "draft" ? "b-warn" : "b-muted"}`}>{st === "live" ? "บนแอป" : st === "draft" ? "ร่าง" : "ซ่อน"}</span>
            <span className="badge b-blue">{a.category}</span>
            {a.pinned && <span className="badge b-muted">📌</span>}
            <span className="hint" style={{ margin: 0 }}>{meta.source} · {meta.created}{a.author ? ` · ${a.author}` : ""}</span>
          </div>
          <div style={{ fontWeight: 800, fontSize: 16, marginTop: 6 }}>{a.title}</div>
          <div className="hint" style={{ fontSize: 13.5 }}>{a.summary}</div>
          {meta.deadline && <div className="row" style={{ marginTop: 6, gap: 6 }}><span className="badge b-warn">⏰ {meta.deadline} · {meta.rel}</span>{meta.reminders && <span className="hint" style={{ margin: 0 }}>เตือนแล้ว: {meta.reminders}</span>}</div>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn-sm" onClick={() => setOpen((v) => !v)}>{open ? "ปิด" : "แก้ไข"}</button>
          {st === "live" ? <button className="btn-sm btn-ghost" onClick={() => toggle("hidden")}>ซ่อน</button> : <button className="btn-sm btn-primary" onClick={() => toggle("live")}>ขึ้นแอป</button>}
          {st === "live" && <button className="btn-sm" onClick={remind}>🔔 เตือนใน LINE</button>}
        </div>
      </div>
      {msg && <div className="msg msg-ok">{msg}</div>}
      {open && <div style={{ marginTop: 12 }}><AnnouncementEditor initial={a} forms={forms} committee={committee} /></div>}
    </div>
  );
}
