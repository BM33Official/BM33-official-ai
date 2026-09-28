"use client";
import { useState } from "react";
import { Pencil, EyeOff, Eye, Bell, Clock, CalendarDays, Bot, Send, UserPen, Pin, ChevronUp } from "lucide-react";
import { act } from "./api";
import AnnouncementEditor, { AnnDraft } from "./AnnouncementEditor";

const CAT_COLOR: Record<string, string> = { ทั่วไป: "#007aff", การเงิน: "#34c759", วิชาการ: "#af52de", กิจกรรม: "#ff9500", "ฟอร์ม/เอกสาร": "#30b0c7", ด่วน: "#ff3b30" };
const SRC: Record<string, { icon: typeof Bot; th: string }> = { group: { icon: Bot, th: "AI จับจากกลุ่ม" }, forward: { icon: Send, th: "ส่งผ่านบอท" }, manual: { icon: UserPen, th: "แอดมิน" } };

export default function AnnouncementRow({ a, meta, forms, committee }: {
  a: AnnDraft & { id: string }; meta: { created: string; deadline: string; rel: string; source: string; reminders: string; event?: string; overdue?: boolean };
  forms: { id: string; name: string }[]; committee: { nickname: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [st, setSt] = useState(a.status);
  async function toggle(status: string) {
    setSt(status);
    await act("announce.update", { id: a.id, patch: { status } });
  }
  async function remind() {
    const r = await act("announce.remind", { id: a.id });
    setMsg(r.ok ? `เพิ่มเข้า “เตือนรวม” #${r.code} แล้ว (${r.n} เรื่อง) → ไปกดส่งที่ รออนุมัติ` : `ไม่สำเร็จ: ${r.error}`);
  }
  const color = CAT_COLOR[a.category] ?? "#007aff";
  const S = SRC[meta.source] ?? SRC.manual;
  return (
    <div className="card fade-in" style={{ padding: 0, overflow: "hidden", opacity: st === "live" ? 1 : 0.62 }}>
      <div style={{ display: "flex", gap: 0 }}>
        <div style={{ width: 6, background: color, flex: "none" }} />
        <div style={{ padding: 18, flex: 1, minWidth: 0 }}>
          <div className="row between" style={{ alignItems: "flex-start" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="row" style={{ gap: 6 }}>
                <span className="badge" style={{ background: color + "1f", color }}>{a.category}</span>
                {st !== "live" && <span className="badge b-muted">{st === "draft" ? "ร่าง" : "ซ่อนอยู่"}</span>}
                {a.pinned && <span className="badge b-orange"><Pin size={11} /> ปักหมุด</span>}
                <span className="hint row" style={{ gap: 5 }}><S.icon size={13} /> {S.th} · {meta.created}{a.author ? ` · ${a.author}` : ""}</span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 17, marginTop: 8 }}>{a.title}</div>
              <div className="hint" style={{ fontSize: 14, marginTop: 2 }}>{a.summary}</div>
              <div className="row" style={{ marginTop: 10, gap: 6 }}>
                {meta.deadline && <span className={`badge ${meta.overdue ? "b-muted" : "b-orange"}`}><Clock size={12} /> {meta.deadline} · {meta.rel}</span>}
                {meta.event && <span className="badge b-purple"><CalendarDays size={12} /> {meta.event}</span>}
                {meta.reminders && <span className="badge b-green"><Bell size={12} /> เตือนแล้ว {meta.reminders}</span>}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-sm" onClick={() => setOpen((v) => !v)}>{open ? <ChevronUp size={15} /> : <Pencil size={14} />} {open ? "ปิด" : "แก้ไข"}</button>
              {st === "live" ? <button className="btn btn-sm btn-ghost" onClick={() => toggle("hidden")}><EyeOff size={15} /> ซ่อน</button> : <button className="btn btn-sm btn-primary" onClick={() => toggle("live")}><Eye size={15} /> ขึ้นแอป</button>}
              {st === "live" && <button className="btn btn-sm" onClick={remind}><Bell size={15} /> ส่ง LINE</button>}
            </div>
          </div>
          {msg && <div className="msg msg-ok">{msg}</div>}
        </div>
      </div>
      {open && <div style={{ padding: "0 18px 18px" }}><AnnouncementEditor initial={{ ...a, status: st }} forms={forms} committee={committee} /></div>}
    </div>
  );
}
