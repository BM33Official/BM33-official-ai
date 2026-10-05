"use client";
import { useState } from "react";
import { Pencil, EyeOff, Eye, Bell, Clock, CalendarDays, Bot, Send, UserPen, Pin, ChevronUp, ArrowUp, ArrowDown } from "lucide-react";
import { act } from "./api";
import { useRouter } from "next/navigation";
import type { Track } from "./AnnouncementBoard";
import AnnouncementEditor, { AnnDraft } from "./AnnouncementEditor";

const CAT_COLOR: Record<string, string> = { ทั่วไป: "#007aff", การเงิน: "#34c759", วิชาการ: "#af52de", กิจกรรม: "#ff9500", "ฟอร์ม/เอกสาร": "#30b0c7", ด่วน: "#ff3b30" };
const SRC: Record<string, { icon: typeof Bot; th: string }> = { group: { icon: Bot, th: "AI จับจากกลุ่ม" }, forward: { icon: Send, th: "ส่งผ่านบอท" }, manual: { icon: UserPen, th: "แอดมิน" } };

export default function AnnouncementRow({ a, meta, forms, committee, select, move, onStatus, track }: {
  a: AnnDraft & { id: string }; meta: { created: string; deadline: string; rel: string; source: string; reminders: string; event?: string; overdue?: boolean };
  forms: { id: string; name: string }[]; committee: { nickname: string; role: string }[];
  select?: { on: boolean; toggle: () => void }; // โหมดเลือกหลายอัน
  move?: { up?: () => void; down?: () => void }; // เรียงลำดับในชุด
  onStatus?: (status: string) => void;
  track?: Track | null; // ทุกคนต้องกรอก -> ใครกดติ๊กแล้ว
}) {
  const router = useRouter();
  const [todo, setTodo] = useState(!!track);
  const [todoBusy, setTodoBusy] = useState(false);
  const [who, setWho] = useState<"" | "pending" | "done" | "unreg">("");
  async function toggleTodo(on: boolean) {
    if (!on && !confirm("เลิกติดตามว่าใครกรอกแล้ว? (เอาออกจาก สิ่งที่ต้องกรอก ในแอป)")) return;
    setTodo(on); setTodoBusy(true);
    const r = await act("announce.todo", { id: a.id, on });
    setTodoBusy(false);
    if (!r.ok) setTodo(!on); else router.refresh();
  }
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [st, setSt] = useState(a.status);
  async function toggle(status: string) {
    setSt(status);
    onStatus?.(status);
    await act("announce.update", { id: a.id, patch: { status } });
  }
  async function remind() {
    const r = await act("announce.remind", { id: a.id });
    setMsg(r.ok ? `เพิ่มเข้า “เตือนรวม” #${r.code} แล้ว (${r.n} เรื่อง) → ไปกดส่งที่ รออนุมัติ` : `ไม่สำเร็จ: ${r.error}`);
  }
  const color = CAT_COLOR[a.category] ?? "#007aff";
  const S = SRC[meta.source] ?? SRC.manual;
  return (
    <div className={`card fade-in ann-row ${select?.on ? "picked" : ""}`} style={{ padding: 0, overflow: "hidden", opacity: st === "live" || select?.on ? 1 : 0.62 }}>
      <div style={{ display: "flex", gap: 0 }}>
        <div style={{ width: 6, background: color, flex: "none" }} />
        {select && (
          <label className="ann-pick" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={select.on} onChange={select.toggle} aria-label="เลือก" />
          </label>
        )}
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
              {move && (
                <span className="row" style={{ gap: 2 }}>
                  <button className="btn btn-sm btn-ghost" disabled={!move.up} onClick={move.up} aria-label="เลื่อนขึ้น"><ArrowUp size={14} /></button>
                  <button className="btn btn-sm btn-ghost" disabled={!move.down} onClick={move.down} aria-label="เลื่อนลง"><ArrowDown size={14} /></button>
                </span>
              )}
              <button className="btn btn-sm" onClick={() => setOpen((v) => !v)}>{open ? <ChevronUp size={15} /> : <Pencil size={14} />} {open ? "ปิด" : "แก้ไข"}</button>
              {st === "live" ? <button className="btn btn-sm btn-ghost" onClick={() => toggle("hidden")}><EyeOff size={15} /> ซ่อน</button> : <button className="btn btn-sm btn-primary" onClick={() => toggle("live")}><Eye size={15} /> ขึ้นแอป</button>}
              {st === "live" && <button className="btn btn-sm" onClick={remind}><Bell size={15} /> ส่ง LINE</button>}
            </div>
          </div>
          <div className="todo-track">
            <label className="row" style={{ gap: 8, cursor: "pointer", flexWrap: "nowrap" }}>
              <span className="switch sm"><input type="checkbox" checked={todo} disabled={todoBusy} onChange={(e) => toggleTodo(e.target.checked)} /><span /></span>
              <b style={{ fontSize: 13.5 }}>ทุกคนต้องกรอก</b>
              <span className="hint">{todo ? "ขึ้นใน “สิ่งที่ต้องกรอก” ของทุกคน · เพื่อนกดวงกลม = กรอกแล้ว" : "เปิดเพื่อให้ทุกคนติ๊กว่าทำแล้ว และดูได้ว่าใครยังไม่ทำ"}</span>
            </label>
            {todo && track && (
              <>
                <div className="tt-bar"><i style={{ width: `${(track.done.length / Math.max(1, track.total)) * 100}%` }} /></div>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <button className={`chip ${who === "done" ? "on" : ""}`} onClick={() => setWho(who === "done" ? "" : "done")}>✓ กดแล้ว {track.done.length}</button>
                  <button className={`chip ${who === "pending" ? "on" : ""}`} onClick={() => setWho(who === "pending" ? "" : "pending")}>ยังไม่กด {track.pending.length}</button>
                  <button className={`chip ${who === "unreg" ? "on" : ""}`} onClick={() => setWho(who === "unreg" ? "" : "unreg")}>ยังไม่ลงทะเบียน {track.unreg.length}</button>
                  {track.pending.length > 0 && <button className="btn btn-sm" onClick={async () => { const r = await act("form.remind", { id: track.formId }); setMsg(r.ok ? `เพิ่มเข้า “เตือนรวม” #${r.code} แล้ว (ส่งเฉพาะคนที่ยังไม่กด) → ไปกดส่งที่ รออนุมัติ` : `ไม่สำเร็จ: ${r.error}`); }}><Bell size={14} /> เตือนคนที่ยังไม่กด</button>}
                </div>
                {who && <div className="who-list">{(track[who] as string[]).map((n) => <span key={n}>{n}</span>)}{(track[who] as string[]).length === 0 && <span className="hint">ไม่มี</span>}</div>}
              </>
            )}
            {todo && !track && <div className="hint">กำลังสร้างรายการ… รีเฟรชเพื่อดูตัวเลข</div>}
          </div>
          {msg && <div className="msg msg-ok">{msg}</div>}
        </div>
      </div>
      {open && <div style={{ padding: "0 18px 18px" }}><AnnouncementEditor initial={{ ...a, status: st }} forms={forms} committee={committee} /></div>}
    </div>
  );
}
