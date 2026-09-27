"use client";
import { useEffect, useMemo, useState } from "react";
import type { AppData } from "./useApp";
import type { TabKey } from "./Chrome";
import { initialOf } from "./Chrome";
import { haptic } from "./useApp";
import { IChevronR, IClock, IWallet, IShield, ISpark, ICheck, ILink } from "./icons";
import { bkkParts, bkkDayKey, countdownParts, relativeTh, agoTh, TH_DAYS, TH_MONTHS } from "@/lib/time";

export function useNow(ms = 1000, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, active]);
  return now;
}

export function greeting(now: number): string {
  const h = bkkParts(now).hh;
  if (h >= 5 && h < 11) return "อรุณสวัสดิ์";
  if (h >= 11 && h < 13) return "สวัสดีตอนเที่ยง";
  if (h >= 13 && h < 17) return "สวัสดีตอนบ่าย";
  if (h >= 17 && h < 21) return "สวัสดีตอนเย็น";
  return "ดึกแล้วนะ";
}

export function deadlineTone(iso: string, now: number): "urgent" | "soon" | "info" | "done" {
  if (!iso) return "info";
  const ms = new Date(iso).getTime() - now;
  if (ms < 0) return "done";
  if (ms < 2 * 86_400_000) return "urgent";
  if (ms < 5 * 86_400_000) return "soon";
  return "info";
}

export function DeadlineChip({ iso, now, prefix = "" }: { iso: string; now: number; prefix?: string }) {
  if (!iso) return null;
  const tone = deadlineTone(iso, now);
  const over = tone === "done";
  return (
    <span className={`chip ${over ? "" : tone}`}>
      {tone === "urgent" && <i className="pulse-dot" />}
      {!over && tone !== "urgent" && <IClock width={13} height={13} />}
      {prefix}{over ? "ปิดแล้ว" : relativeTh(iso, now)}
    </span>
  );
}

const WHERE = (b: string, r: string) => [b, r && (/\d/.test(r) ? `ห้อง ${r}` : r)].filter(Boolean).join(" · ");

// สี + อีโมจิของแต่ละหมวดประกาศ (ให้แยกด้วยตาได้ทันทีโดยไม่ต้องอ่าน)
export const CAT: Record<string, { em: string; c1: string; c2: string }> = {
  "ด่วน": { em: "🚨", c1: "#ff5f6d", c2: "#c81d4e" },
  "การเงิน": { em: "💸", c1: "#34d399", c2: "#059669" },
  "วิชาการ": { em: "📚", c1: "#818cf8", c2: "#4f46e5" },
  "กิจกรรม": { em: "🎉", c1: "#f472b6", c2: "#c026d3" },
  "ฟอร์ม/เอกสาร": { em: "📝", c1: "#fbbf24", c2: "#d97706" },
  "ทั่วไป": { em: "📣", c1: "#60a5fa", c2: "#2563eb" },
};
export const catOf = (c: string) => CAT[c] ?? CAT["ทั่วไป"];
type Ann = AppData["board"]["announcements"][number];

export default function Home({
  data, active, picture, openAnn, go, claimForm,
}: {
  data: AppData; active: boolean; picture: string;
  openAnn: (id: string) => void; go: (t: TabKey, section?: string) => void; claimForm: (id: string) => Promise<void>;
}) {
  const now = useNow(1000, active);
  const { board, mine } = data;
  const p = bkkParts(now);
  const today = bkkDayKey(now);
  const [cat, setCat] = useState("ทั้งหมด");
  const [more, setMore] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const nextExam = board.exams.find((e) => new Date(e.at).getTime() > now - 3 * 3600_000);
  const todays = board.schedule.filter((s) => s.date === today);
  const tomorrowKey = bkkDayKey(now + 86_400_000);
  const tomorrows = board.schedule.filter((s) => s.date === tomorrowKey);
  const fees = mine.fees;
  const zone = mine.zone;

  // ประกาศ: ปักหมุด/ใกล้เดดไลน์ขึ้นก่อน
  const score = (a: Ann) => (a.pinned ? 4 : 0) + (a.deadline_at && ["urgent", "soon"].includes(deadlineTone(a.deadline_at, now)) ? 2 : 0);
  const all = useMemo(() => [...board.announcements].sort((a, b) => score(b) - score(a) || b.created_at.localeCompare(a.created_at)), [board.announcements, Math.floor(now / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = ["ทั้งหมด", ...Array.from(new Set(board.announcements.map((a) => a.category)))];
  const list = all.filter((a) => cat === "ทั้งหมด" || a.category === cat);
  const [hero, ...rest] = list;
  const shown = more ? rest : rest.slice(0, 4);

  // สิ่งที่ต้องกรอก
  const stateOf = (id: string) => mine.forms.find((f) => f.id === id)?.state ?? "none";
  const forms = [...board.forms].sort((a, b) => (a.deadline_at || "9").localeCompare(b.deadline_at || "9"));
  const todo = forms.filter((f) => stateOf(f.id) !== "done");
  const done = forms.filter((f) => stateOf(f.id) === "done");

  return (
    <div className="col feed">
      <header className="hello">
        <div>
          <div className="when">{`วัน${TH_DAYS[p.dow]}ที่ ${p.d} ${TH_MONTHS[p.m]}`}</div>
          <h1>{greeting(now)} {mine.me.nickname}</h1>
        </div>
        <button className="avatar press" onClick={() => go("me")} aria-label="ของฉัน">
          {picture ? <img src={picture} alt="" /> : initialOf(mine.me.nickname)}
        </button>
      </header>

      {/* แถบสั้นบนสุด: สอบถัดไป + สถานะส่วนตัว (แตะไปหน้าที่เกี่ยวข้อง) */}
      <div className="pills">
        {nextExam && (
          <button className="pill exam press" onClick={() => go("schedule")}>
            <IClock width={15} height={15} />
            <span className="ellipsis">{nextExam.name}</span>
            <b><Countdown iso={nextExam.at} now={now} /></b>
          </button>
        )}
        {fees.months.length > 0 && (
          <button className={`pill press ${fees.overdue ? "bad" : fees.outstanding ? "warn" : "ok"}`} onClick={() => go("me", "fees")}>
            <IWallet width={15} height={15} />{fees.outstanding > 0 ? `ค้าง ${fees.outstanding.toLocaleString()}฿` : "เงินรุ่นครบ"}
          </button>
        )}
        <button className={`pill press ${zone.level === "red" ? "bad" : zone.level === "close" ? "warn" : "ok"}`} onClick={() => go("me", "zone")}>
          <IShield width={15} height={15} />{zone.title}
        </button>
      </div>

      {board.notice && <div className="notice"><span>📣</span><span className="selectable">{board.notice}</span></div>}

      {/* ── ประกาศ (สำคัญที่สุด) ── */}
      <div className="sect big"><h2>ประกาศ</h2><span className="muted small b">{board.announcements.length} เรื่อง</span></div>
      {cats.length > 2 && (
        <div className="hscroll chips-row">
          {cats.map((c) => (
            <button key={c} className={`fchip ${cat === c ? "on" : ""}`} onClick={() => { haptic(); setCat(c); setMore(false); }}>
              {c !== "ทั้งหมด" && <span>{catOf(c).em}</span>}{c}
            </button>
          ))}
        </div>
      )}
      {hero ? (
        <>
          <button className="hero press" onClick={() => openAnn(hero.id)} style={{ background: `linear-gradient(150deg, ${catOf(hero.category).c1}, ${catOf(hero.category).c2})` }}>
            <div className="hero-em" aria-hidden>{catOf(hero.category).em}</div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <span className="hero-cat">{hero.pinned ? "📌 " : ""}{hero.category}</span>
              {(hero.deadline_at || hero.event_at) && <DeadlineChip iso={hero.deadline_at || hero.event_at} now={now} prefix={hero.deadline_at ? "ปิด " : ""} />}
            </div>
            <div className="hero-ttl">{hero.title}</div>
            {hero.summary && <div className="hero-sum clamp3">{hero.summary}</div>}
            <div className="hero-by">{hero.author || "กรรมการรุ่น"}{hero.author_role ? ` · ${hero.author_role}` : ""} · {agoTh(hero.created_at, now)}</div>
          </button>
          <div className="feed-list">
            {shown.map((a) => <FeedRow key={a.id} a={a} now={now} onOpen={() => openAnn(a.id)} />)}
          </div>
          {rest.length > 4 && (
            <button className="linkbtn" onClick={() => { haptic(); setMore((v) => !v); }}>{more ? "ย่อ" : `ดูประกาศทั้งหมด (${list.length})`}</button>
          )}
        </>
      ) : <div className="empty"><div className="big">📭</div>ยังไม่มีประกาศตอนนี้</div>}

      {/* ── สิ่งที่ต้องกรอก ── */}
      {forms.length > 0 && (
        <>
          <div className="sect big">
            <h2>สิ่งที่ต้องกรอก</h2>
            <span className="progress-mini"><i style={{ width: `${(done.length / forms.length) * 100}%` }} /></span>
            <span className="muted small b">{done.length}/{forms.length}</span>
          </div>
          {todo.length === 0 && <div className="allclear">🎉 กรอกครบทุกอย่างแล้ว</div>}
          <div className="feed-list">
            {todo.map((f) => <TodoRow key={f.id} f={f} state={stateOf(f.id)} now={now} onClaim={() => claimForm(f.id)} preview={!!data.preview} />)}
          </div>
          {done.length > 0 && (
            <>
              <button className="linkbtn" onClick={() => setShowDone((v) => !v)}>✓ กรอกแล้ว {done.length} รายการ {showDone ? "▴" : "▾"}</button>
              {showDone && <div className="feed-list">{done.map((f) => <TodoRow key={f.id} f={f} state="done" now={now} onClaim={async () => {}} preview />)}</div>}
            </>
          )}
        </>
      )}

      {/* ── วันนี้ ── */}
      <div className="sect big"><h2>{todays.length ? "วันนี้เรียน" : tomorrows.length ? "พรุ่งนี้เรียน" : "วันนี้"}</h2><button className="more" onClick={() => go("schedule")}>ตารางทั้งหมด</button></div>
      {(todays.length ? todays : tomorrows).length ? (
        <div className="timeline">
          {(todays.length ? todays : tomorrows.slice(0, 5)).map((s) => {
            const st = new Date(`${s.date}T${s.start || "00:00"}:00+07:00`).getTime();
            const en = new Date(`${s.date}T${s.end || s.start || "23:59"}:00+07:00`).getTime();
            const live = now >= st && now <= en;
            return (
              <div key={s.id} className={`tl ${live ? "now" : ""}`} style={{ opacity: now > en ? 0.5 : 1 }}>
                <div className="time">{s.start}<small>{s.end}</small></div>
                <div className="body">
                  <div className="subj">{s.subject}{live && <span className="chip done" style={{ marginLeft: 8, height: 22 }}>กำลังเรียน</span>}</div>
                  {(s.topic || s.building || s.room) && <div className="soft small" style={{ marginTop: 2 }}>{[s.topic, WHERE(s.building, s.room)].filter(Boolean).join(" · ")}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : <div className="muted small" style={{ padding: "0 6px" }}>{board.schedule.length ? "ไม่มีเรียนวันนี้และพรุ่งนี้ พักผ่อนให้เต็มที่ 🌤️" : "ยังไม่มีตารางเรียนในระบบ"}</div>}

      {board.daily && board.daily.items.length > 0 && (
        <div className="daily-plain">
          <div className="headline"><ISpark width={15} height={15} /> {board.daily.headline}</div>
          {board.daily.items.map((it, i) => (
            <button key={i} className="item" onClick={() => { if (it.ref && board.announcements.some((a) => a.id === it.ref)) openAnn(it.ref); }}>
              <span className="em">{it.emoji}</span>
              <span className="txt">{it.text}{it.at && <> <DeadlineChip iso={it.at} now={now} /></>}</span>
            </button>
          ))}
        </div>
      )}

      <button className="fortune-row press" onClick={() => go("fortune")}>
        <MiniWheel size={46} />
        <div style={{ flex: 1, textAlign: "left" }}>
          <div className="b">เซียมซีประจำวัน</div>
          <div className="muted small">{mine.fortune.last_day === today ? `วันนี้เขย่าแล้ว · สะสม ${countOf(mine.fortune.collected)}/200` : "ใบแรกของวันการันตี “ไข่มุก” ขึ้นไป ✨"}</div>
        </div>
        <IChevronR width={18} height={18} />
      </button>
    </div>
  );
}

function FeedRow({ a, now, onOpen }: { a: Ann; now: number; onOpen: () => void }) {
  const c = catOf(a.category);
  const dl = a.deadline_at || a.event_at;
  return (
    <button className="frow press" onClick={onOpen}>
      <span className="fic" style={{ background: `linear-gradient(150deg, ${c.c1}, ${c.c2})` }}>{c.em}</span>
      <span className="fbody">
        <span className="ftitle clamp2">{a.pinned ? "📌 " : ""}{a.title}</span>
        {a.summary && <span className="fsum clamp2">{a.summary}</span>}
        <span className="fmeta">{dl ? <DeadlineChip iso={dl} now={now} prefix={a.deadline_at ? "ปิด " : ""} /> : null}<span>{a.author || "กรรมการรุ่น"} · {agoTh(a.created_at, now)}</span></span>
      </span>
    </button>
  );
}

function TodoRow({ f, state, now, onClaim, preview }: { f: AppData["board"]["forms"][number]; state: string; now: number; onClaim: () => Promise<void>; preview: boolean }) {
  const [busy, setBusy] = useState(false);
  const isDone = state === "done";
  return (
    <div className={`frow todo ${isDone ? "done" : ""}`}>
      <button className={`check ${isDone ? "on" : state === "claimed" ? "half" : ""}`} disabled={isDone || state === "claimed" || preview || busy} aria-label="ฉันกรอกแล้ว"
        onClick={async () => { haptic(); setBusy(true); await onClaim(); setBusy(false); }}>
        {isDone || state === "claimed" ? <ICheck width={16} height={16} /> : null}
      </button>
      <span className="fbody">
        <span className="ftitle">{f.name}</span>
        {f.description && !isDone && <span className="fsum clamp2">{f.description}</span>}
        <span className="fmeta">
          {state === "claimed" ? <span className="chip violet">รอกรรมการยืนยัน</span> : !isDone && f.deadline_at ? <DeadlineChip iso={f.deadline_at} now={now} prefix="ปิด " /> : null}
          {!isDone && state !== "claimed" && <span>กรอกแล้วแตะวงกลม</span>}
        </span>
      </span>
      {!isDone && f.link && <a className="btn sm" href={f.link} target="_blank" rel="noopener noreferrer"><ILink width={14} height={14} />กรอก</a>}
    </div>
  );
}

function Countdown({ iso, now }: { iso: string; now: number }) {
  const c = countdownParts(iso, now);
  if (c.d > 0) return <>{c.d} วัน {String(c.h).padStart(2, "0")}:{String(c.m).padStart(2, "0")}</>;
  return <>{String(c.h).padStart(2, "0")}:{String(c.m).padStart(2, "0")}:{String(c.s).padStart(2, "0")}</>;
}

function countOf(b64: string): number {
  if (!b64) return 0;
  try {
    const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    let n = 0;
    for (let i = 0; i < bin.length; i++) { let x = bin.charCodeAt(i); while (x) { n += x & 1; x >>= 1; } }
    return n;
  } catch { return 0; }
}

export function Digits({ iso, now }: { iso: string; now: number }) {
  const c = countdownParts(iso, now);
  return (
    <div className="digits">
      {[[c.d, "วัน"], [c.h, "ชั่วโมง"], [c.m, "นาที"], [c.s, "วินาที"]].map(([v, l]) => (
        <div key={l as string} className="digit"><b>{String(v).padStart(2, "0")}</b><span>{l}</span></div>
      ))}
    </div>
  );
}

export function MiniWheel({ size = 76 }: { size?: number }) {
  const segs = 12;
  return (
    <svg className="mini-wheel" width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id="mwg" cx="40%" cy="35%"><stop offset="0" stopColor="#fff3c4" /><stop offset=".55" stopColor="#f5b325" /><stop offset="1" stopColor="#8a5a07" /></radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#mwg)" />
      {Array.from({ length: segs }).map((_, i) => {
        const a = (i / segs) * Math.PI * 2;
        return <line key={i} x1={50} y1={50} x2={50 + Math.cos(a) * 44} y2={50 + Math.sin(a) * 44} stroke="rgba(90,55,0,.45)" strokeWidth="1.2" />;
      })}
      <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(255,250,220,.8)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="12" fill="#fff6d6" stroke="#b7790e" strokeWidth="2" />
    </svg>
  );
}
