"use client";
import { useMemo, useState } from "react";
import type { AppData } from "./useApp";
import { haptic } from "./useApp";
import { Segmented, Linkify, initialOf } from "./Chrome";
import { DeadlineChip, deadlineTone, useNow } from "./Home";
import { ICheck, IClock, IPin, ILink, IDoc } from "./icons";
import { thDateTime, agoTh, countdownParts } from "@/lib/time";

type Ann = AppData["board"]["announcements"][number];

export default function News({
  data, active, openAnn, section, setSection, claimForm,
}: {
  data: AppData; active: boolean; openAnn: (id: string) => void;
  section: "ann" | "forms"; setSection: (s: "ann" | "forms") => void;
  claimForm: (id: string) => Promise<void>;
}) {
  const now = useNow(30_000, active);
  const { board, mine } = data;
  const [filter, setFilter] = useState<string>("ทั้งหมด");

  const cats = useMemo(() => ["ทั้งหมด", ...Array.from(new Set(board.announcements.map((a) => a.category)))], [board.announcements]);
  const list = board.announcements.filter((a) => filter === "ทั้งหมด" || a.category === filter);
  const urgent = list.filter((a) => a.deadline_at && ["urgent", "soon"].includes(deadlineTone(a.deadline_at, now)));
  const rest = list.filter((a) => !urgent.includes(a));
  const stateOf = (id: string) => mine.forms.find((f) => f.id === id)?.state ?? "none";
  const pendingForms = board.forms.filter((f) => stateOf(f.id) !== "done");

  return (
    <div className="col">
      <div className="largetitle">
        <div className="eyebrow">ข่าวสารของรุ่น</div>
        <h1>ประกาศ</h1>
      </div>
      <Segmented value={section} onChange={setSection} options={[
        { key: "ann", label: `ประกาศ${board.announcements.length ? ` · ${board.announcements.length}` : ""}` },
        { key: "forms", label: `งาน & ฟอร์ม${pendingForms.length ? ` · ${pendingForms.length}` : ""}` },
      ]} />

      {section === "ann" ? (
        <>
          {cats.length > 2 && (
            <div className="hscroll" style={{ paddingBottom: 2 }}>
              {cats.map((c) => (
                <button key={c} className={`chip ${filter === c ? "info" : ""}`} style={{ height: 32 }} onClick={() => { haptic(); setFilter(c); }}>{c}</button>
              ))}
            </div>
          )}
          {urgent.length > 0 && (
            <>
              <div className="sect"><h2>ใกล้เดดไลน์ ⏰</h2></div>
              <div className="list ann-list stagger" style={{ gap: 12 }}>
                {urgent.map((a) => <AnnCard key={a.id} a={a} now={now} onOpen={() => openAnn(a.id)} />)}
              </div>
            </>
          )}
          {rest.length > 0 && (
            <>
              {urgent.length > 0 && <div className="sect"><h2>ทั้งหมด</h2></div>}
              <div className="list ann-list stagger" style={{ gap: 12 }}>
                {rest.map((a) => <AnnCard key={a.id} a={a} now={now} onOpen={() => openAnn(a.id)} />)}
              </div>
            </>
          )}
          {list.length === 0 && <div className="glass empty"><div className="big">📭</div>ยังไม่มีประกาศตอนนี้<br /><span className="tiny">ประกาศจากกรรมการรุ่นจะขึ้นที่นี่อัตโนมัติ</span></div>}
        </>
      ) : (
        <div className="list stagger" style={{ gap: 12 }}>
          {board.forms.length === 0 && <div className="glass empty"><div className="big">🎉</div>ตอนนี้ไม่มีฟอร์มหรืองานที่ต้องทำ</div>}
          {[...board.forms].sort((a, b) => (stateOf(a.id) === "done" ? 1 : 0) - (stateOf(b.id) === "done" ? 1 : 0) || (a.deadline_at || "9").localeCompare(b.deadline_at || "9")).map((f) => (
            <FormRow key={f.id} f={f} state={stateOf(f.id)} now={now} onClaim={() => claimForm(f.id)} preview={!!data.preview} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnnCard({ a, now, onOpen }: { a: Ann; now: number; onOpen: () => void }) {
  const tone = a.deadline_at ? deadlineTone(a.deadline_at, now) : "info";
  return (
    <button className={`glass ann press ${tone === "urgent" ? "urgent" : ""}`} onClick={onOpen}>
      <div className="top">
        <span className="cat">{a.pinned ? "📌 " : ""}{a.category}</span>
        {a.deadline_at ? <DeadlineChip iso={a.deadline_at} now={now} /> : a.event_at ? <DeadlineChip iso={a.event_at} now={now} /> : <span className="tiny muted">{agoTh(a.created_at, now)}</span>}
      </div>
      <div className="ttl">{a.title}</div>
      {a.summary && <div className="sum clamp3">{a.summary}</div>}
      <div className="by">
        <span className="av">{initialOf(a.author || "B")}</span>
        <span>{a.author || "กรรมการรุ่น"}{a.author_role ? ` · ${a.author_role}` : ""}</span>
        {a.links.length > 0 && <span className="row" style={{ gap: 4, marginLeft: "auto" }}><ILink width={14} height={14} />{a.links.length}</span>}
      </div>
    </button>
  );
}

function FormRow({ f, state, now, onClaim, preview }: {
  f: AppData["board"]["forms"][number]; state: string; now: number; onClaim: () => Promise<void>; preview: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const done = state === "done";
  return (
    <div className={`glass form-row ${done ? "" : deadlineTone(f.deadline_at, now) === "urgent" ? "ann urgent" : ""}`} style={{ opacity: done ? 0.72 : 1 }}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="icon-bubble"><IDoc /></div>
          <div>
            <div className="b" style={{ fontSize: 16, lineHeight: 1.3 }}>{f.name}</div>
            {f.description && <div className="soft small" style={{ marginTop: 3 }}>{f.description}</div>}
          </div>
        </div>
        {done ? <span className="chip done"><ICheck width={13} height={13} />ทำแล้ว</span>
          : state === "claimed" ? <span className="chip violet">รอตรวจ</span>
          : <span className="chip soon">ยังไม่ทำ</span>}
      </div>
      {f.deadline_at && <div className="row" style={{ gap: 6 }}><DeadlineChip iso={f.deadline_at} now={now} /><span className="tiny muted">ปิด {thDateTime(f.deadline_at)}</span></div>}
      {!done && (
        <div className="actions">
          {f.link && <a className="btn sm" href={f.link} target="_blank" rel="noopener noreferrer"><ILink width={15} height={15} />เปิดฟอร์ม</a>}
          {state !== "claimed" && !preview && (
            <button className="btn sm ghost" disabled={busy} onClick={async () => { setBusy(true); await onClaim(); setBusy(false); }}>
              <ICheck width={15} height={15} />{busy ? "กำลังเช็ก…" : "ฉันทำแล้ว"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
