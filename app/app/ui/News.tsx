"use client";
// รายละเอียดประกาศ (เปิดเป็น sheet จากหน้าหลัก) — ไม่มีแท็บประกาศแยกแล้ว
import type { AppData } from "./useApp";
import { Linkify, initialOf } from "./Chrome";
import { IClock, IPin, ILink } from "./icons";
import { thDateTime, countdownParts } from "@/lib/time";

type Ann = AppData["board"]["announcements"][number];

export function AnnouncementDetail({ a, now }: { a: Ann; now: number }) {
  const dl = a.deadline_at;
  const over = dl && new Date(dl).getTime() < now;
  const c = dl ? countdownParts(dl, now) : null;
  const ics = () => {
    const at = a.event_at || a.deadline_at;
    if (!at) return;
    const d = new Date(at);
    const fmt = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const end = new Date(d.getTime() + 60 * 60_000);
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BM33//TH", "BEGIN:VEVENT", `UID:${a.id}@bm33`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(d)}`, `DTEND:${fmt(end)}`, `SUMMARY:${a.title.replace(/\n/g, " ")}`, `DESCRIPTION:${a.summary.replace(/\n/g, " ")}`, "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:BM33", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
    const link = document.createElement("a");
    link.href = url; link.download = `bm33-${a.id}.ics`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  return (
    <div className="detail">
      <div className="row" style={{ gap: 6, marginTop: 4 }}><span className="cat">{a.category}</span>{a.pinned && <span className="cat">📌 ปักหมุด</span>}</div>
      <h2>{a.title}</h2>
      <div className="ann" style={{ padding: 0 }}>
        <div className="by">
          <span className="av">{initialOf(a.author || "B")}</span>
          <span>{a.author || "กรรมการรุ่น"}{a.author_role ? ` · ${a.author_role}` : ""} · {thDateTime(a.created_at)}</span>
        </div>
      </div>

      {dl && (
        <div className={`deadline-box ${over ? "over" : ""}`} style={{ marginTop: 16 }}>
          <div className="icon-bubble"><IClock /></div>
          <div style={{ flex: 1 }}>
            <div className="tiny muted b">{over ? "หมดเวลาแล้ว" : "เดดไลน์"}</div>
            <div className="b" style={{ fontSize: 16 }}>{thDateTime(dl)}</div>
          </div>
          {!over && c && <div style={{ textAlign: "right" }}><b style={{ fontSize: 22 }}>{c.d > 0 ? `${c.d} วัน` : `${c.h}:${String(c.m).padStart(2, "0")}`}</b><div className="tiny muted">{c.d > 0 ? `${c.h} ชม.` : "ชม.:นาที"}</div></div>}
        </div>
      )}
      {a.event_at && (
        <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
          <span className="chip info"><IClock width={13} height={13} />วันงาน {thDateTime(a.event_at)}</span>
          {a.location && <span className="chip"><IPin width={13} height={13} />{a.location}</span>}
        </div>
      )}
      {!a.event_at && a.location && <div className="row" style={{ marginTop: 10 }}><span className="chip"><IPin width={13} height={13} />{a.location}</span></div>}

      {a.summary && (
        <>
          <div className="tiny muted b" style={{ margin: "18px 0 6px" }}>สรุปสั้น</div>
          <div style={{ fontSize: 16, lineHeight: 1.6 }} className="selectable">{a.summary}</div>
        </>
      )}

      {a.links.length > 0 && (
        <div className="linkbtns" style={{ marginTop: 16 }}>
          {a.links.map((l, i) => (
            <a key={i} className={`btn block ${i ? "ghost" : ""}`} href={l.url} target="_blank" rel="noopener noreferrer"><ILink width={16} height={16} />{l.label}</a>
          ))}
        </div>
      )}

      <div className="tiny muted b" style={{ margin: "20px 0 6px" }}>ข้อความจาก {a.author || "กรรมการ"} ในกลุ่ม</div>
      <div className="quote body selectable"><Linkify text={a.body} /></div>

      {(a.event_at || a.deadline_at) && !over && (
        <button className="btn ghost block" style={{ marginTop: 14 }} onClick={ics}><IClock width={16} height={16} />เพิ่มลงปฏิทิน (เตือนล่วงหน้า 1 วัน)</button>
      )}
    </div>
  );
}
