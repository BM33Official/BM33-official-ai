"use client";
// รายละเอียดประกาศ (เปิดเป็น sheet จากหน้าหลัก) — ไม่มีแท็บประกาศแยกแล้ว
import type { AppData } from "./useApp";
import { Linkify, initialOf } from "./Chrome";
import { haptic } from "./useApp";
import { IClock, IPin, ILink } from "./icons";
import { thDateTime, countdownParts } from "@/lib/time";

type Ann = AppData["board"]["announcements"][number];

export function AnnouncementDetail({ a, now }: { a: Ann; now: number }) {
  const dl = a.deadline_at;
  const over = dl && new Date(dl).getTime() < now;
  const c = dl ? countdownParts(dl, now) : null;
  // เพิ่มลงปฏิทิน — เบราว์เซอร์ใน LINE โหลดไฟล์ไม่ได้ จึงเปิดลิงก์นอก LINE (Safari/Chrome)
  const at = a.event_at || a.deadline_at;
  const openOut = (url: string) => {
    haptic();
    if (window.liff?.isInClient?.()) window.liff.openWindow({ url, external: true });
    else window.open(url, "_blank", "noopener");
  };
  const icsUrl = () => `${location.origin}/api/cal/${encodeURIComponent(a.id)}?s=${a.cal}`;
  const gcalUrl = () => {
    const d = new Date(at);
    const fmt = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const end = new Date(d.getTime() + (a.event_at ? 60 : 15) * 60_000);
    const details = [a.summary, ...a.links.map((l) => `${l.label}: ${l.url}`)].filter(Boolean).join("\n");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${a.event_at ? "" : "⏰ ปิด: "}${a.title}`)}&dates=${fmt(d)}/${fmt(end)}&details=${encodeURIComponent(details)}${a.location ? `&location=${encodeURIComponent(a.location)}` : ""}`;
  };
  const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
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

      {at && !over && (
        <div className="cal-add">
          <div className="tiny muted b">เพิ่มลงปฏิทิน · เตือนล่วงหน้า 1 วัน และ 2 ชม.</div>
          <div className={`cal-btns ${ios ? "" : "rev"}`}>
            {a.cal && <button className="btn block" onClick={() => openOut(icsUrl())}><IClock width={16} height={16} />{ios ? "ปฏิทิน iPhone" : "ปฏิทินในมือถือ"}</button>}
            <button className="btn ghost block" onClick={() => openOut(gcalUrl())}><IClock width={16} height={16} />Google Calendar</button>
          </div>
        </div>
      )}
    </div>
  );
}
