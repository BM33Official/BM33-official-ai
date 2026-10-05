"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData } from "./useApp";
import type { TabKey } from "./Chrome";
import { initialOf } from "./Chrome";
import { haptic } from "./useApp";
import { IChevronR, IClock, IWallet, IShield, ISpark, ICheck } from "./icons";
import { bkkParts, bkkDayKey, countdownParts, relativeTh, agoTh, dayDiff, thDateTime, thTime, TH_DAYS, TH_MONTHS } from "@/lib/time";

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

// วันที่สำคัญของประกาศ = เดดไลน์ (ถ้ามี) ไม่งั้นวันงาน
const keyDate = (a: Ann) => a.deadline_at || a.event_at || "";
const SOON_DAYS = 7;

// รายการประกาศ: แถวเดี่ยว หรือ "ชุด" ที่กรรมการจัดไว้ (แตะเพื่อกาง)
type Entry = { kind: "one"; a: Ann } | { kind: "set"; name: string; list: Ann[] };
function entriesOf(list: Ann[]): Entry[] {
  const out: Entry[] = [];
  const seen = new Map<string, Entry & { kind: "set" }>();
  for (const a of list) {
    if (!a.group) { out.push({ kind: "one", a }); continue; }
    const hit = seen.get(a.group);
    if (hit) hit.list.push(a);
    else { const e = { kind: "set" as const, name: a.group, list: [a] }; seen.set(a.group, e); out.push(e); }
  }
  for (const e of seen.values()) e.list.sort((x, y) => (x.order || 9999) - (y.order || 9999) || (keyDate(x) || "9").localeCompare(keyDate(y) || "9"));
  return out;
}
const firstDate = (e: Entry) => (e.kind === "one" ? keyDate(e.a) : e.list.map(keyDate).filter(Boolean).sort()[0] ?? "");

function AnnFeed({ list, sort, now, openAnn }: { list: Ann[]; sort: "due" | "new"; now: number; openAnn: (id: string) => void }) {
  const [more, setMore] = useState(false);
  const sections = useMemo(() => {
    if (sort === "new") {
      const all = entriesOf([...list].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      return [{ title: "", items: all }];
    }
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    const dated = entriesOf(rest.filter((a) => keyDate(a))).sort((a, b) => firstDate(a).localeCompare(firstDate(b)));
    const soon = dated.filter((e) => dayDiff(firstDate(e), now) <= SOON_DAYS);
    const later = dated.filter((e) => dayDiff(firstDate(e), now) > SOON_DAYS);
    const plain = entriesOf(rest.filter((a) => !keyDate(a)).sort((a, b) => b.created_at.localeCompare(a.created_at)));
    return [
      { title: "ปักหมุด", items: entriesOf(pinned) },
      { title: "ใกล้ถึง · ภายใน 7 วัน", items: soon },
      { title: "อีกนาน", items: later },
      { title: "ข่าวทั่วไป", items: plain },
    ].filter((x) => x.items.length);
  }, [list, sort, now]);
  const total = sections.reduce((n, x) => n + x.items.length, 0);
  let budget = more ? Infinity : 7;
  if (list.length === 0) return <div className="p-empty">ยังไม่มีประกาศตอนนี้</div>;
  return (
    <>
      {sections.map((sec) => {
        if (budget <= 0) return null;
        const items = sec.items.slice(0, budget);
        budget -= items.length;
        return (
          <div key={sec.title || "all"}>
            {sec.title && <div className="grp">{sec.title}</div>}
            {items.map((e) => (e.kind === "one"
              ? <AnnRow key={e.a.id} a={e.a} now={now} onOpen={() => openAnn(e.a.id)} />
              : <SetRow key={`set:${e.name}`} name={e.name} list={e.list} now={now} openAnn={openAnn} />))}
          </div>
        );
      })}
      {total > 7 && <button className="p-link" onClick={() => { haptic(); setMore((v) => !v); }}>{more ? "ย่อ ▴" : `ดูทั้งหมด ${list.length} เรื่อง ▾`}</button>}
    </>
  );
}

// ── สรุปวันนี้: หัวการ์ดตามช่วงเวลา + ตัวเลขสรุป + ไทม์ไลน์สีตามความด่วน (แตะเพื่อเปิดประกาศ) ──
type DailyT = NonNullable<AppData["board"]["daily"]>;
const SKY = (h: number) => (h >= 5 && h < 11 ? { icon: "☀️", label: "เช้านี้", c1: "#f59e0b", c2: "#ec4899" } : h >= 11 && h < 17 ? { icon: "🌤️", label: "บ่ายนี้", c1: "#38bdf8", c2: "#6366f1" } : h >= 17 && h < 21 ? { icon: "🌇", label: "เย็นนี้", c1: "#f97316", c2: "#8b5cf6" } : { icon: "🌙", label: "คืนนี้", c1: "#6366f1", c2: "#0ea5e9" });
function DailyCard({ daily, now, canOpen, openAnn }: { daily: DailyT; now: number; canOpen: (id: string) => boolean; openAnn: (id: string) => void }) {
  const sky = SKY(bkkParts(now).hh);
  const items = daily.items;
  const urgent = items.filter((x) => x.tone === "urgent" || (x.at && new Date(x.at).getTime() > now && dayDiff(x.at, now) <= 1)).length;
  const today = items.filter((x) => x.at && dayDiff(x.at, now) === 0).length;
  const later = items.filter((x) => x.at && dayDiff(x.at, now) > 1).length;
  const toneOf = (x: DailyT["items"][number]) => (x.tone === "urgent" || (x.at && new Date(x.at).getTime() > now && dayDiff(x.at, now) <= 1) ? "hot" : x.tone === "good" ? "good" : "calm");
  const when = (iso?: string) => {
    if (!iso) return "";
    const d = dayDiff(iso, now);
    if (new Date(iso).getTime() < now) return "ผ่านไปแล้ว";
    return d === 0 ? `วันนี้ ${thTime(iso)} น.` : d === 1 ? `พรุ่งนี้ ${thTime(iso)} น.` : `อีก ${d} วัน`;
  };
  return (
    <section className="daily-card" data-tour="daily">
      <div className="dc-hero" style={{ ["--c1" as string]: sky.c1, ["--c2" as string]: sky.c2 }}>
        <span className="dc-icon">{sky.icon}</span>
        <div className="dc-hh">
          <small>สรุป{sky.label} · อัปเดต {thTime(daily.updated_at || new Date(now).toISOString())} น.</small>
          <b>{daily.headline || "สิ่งที่ควรรู้วันนี้"}</b>
        </div>
      </div>
      <div className="dc-stats">
        <span className={urgent ? "hot" : ""}><b>{urgent}</b>ด่วน</span>
        <span><b>{today}</b>วันนี้</span>
        <span><b>{later}</b>ข้างหน้า</span>
      </div>
      <ol className="dc-line">
        {items.map((it, i) => {
          const open = !!it.ref && canOpen(it.ref);
          return (
            <li key={i} className={`dc-it ${toneOf(it)}`} style={{ animationDelay: `${i * 70}ms` }}>
              <button className="press" disabled={!open} onClick={() => { if (open) { haptic(); openAnn(it.ref!); } }}>
                <span className="dc-dot">{it.emoji || "•"}</span>
                <span className="dc-b"><span className="dc-t">{it.text}</span>{it.at && <span className="dc-when">{when(it.at)}</span>}</span>
                {open && <IChevronR width={14} height={14} />}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SetRow({ name, list, now, openAnn }: { name: string; list: Ann[]; now: number; openAnn: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const next = list.map(keyDate).filter((d) => d && new Date(d).getTime() > now).sort()[0] ?? "";
  return (
    <div className={`setrow ${open ? "open" : ""}`}>
      <button className="arow press set-head" onClick={() => { haptic(); setOpen((v) => !v); }}>
        <span className="a-ic set-ic">{list.length}</span>
        <span className="a-b">
          <span className="a-t clamp2">{name}</span>
          <span className="a-m">{next ? <DeadlineChip iso={next} now={now} prefix="ถัดไป " /> : null}<span>{list.length} เรื่องในชุดนี้</span></span>
        </span>
        <span className="set-chev">{open ? "▴" : "▾"}</span>
      </button>
      {open && <div className="set-body">{list.map((a) => <AnnRow key={a.id} a={a} now={now} onOpen={() => openAnn(a.id)} />)}</div>}
    </div>
  );
}

export default function Home({
  data, active, picture, openAnn, go, claimForm, focus, onFocused, openHistory, openTour,
}: {
  data: AppData; active: boolean; picture: string;
  openAnn: (id: string) => void; go: (t: TabKey, section?: string) => void; claimForm: (id: string, undo?: boolean) => Promise<void>;
  focus?: string; onFocused?: () => void; openHistory: () => void; openTour: () => void;
}) {
  const todoRef = useRef<HTMLElement>(null);
  const annRef = useRef<HTMLElement>(null);
  // ปุ่ม "ประกาศ" ในเมนู LINE -> เลื่อนมาที่สิ่งที่ต้องกรอก/ประกาศเลย
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => { (todoRef.current ?? annRef.current)?.scrollIntoView({ behavior: "smooth", block: "start" }); onFocused?.(); }, 450);
    return () => clearTimeout(t);
  }, [focus, onFocused]);
  const now = useNow(1000, active);
  const { board, mine } = data;
  const p = bkkParts(now);
  const today = bkkDayKey(now);
  const [more, setMore] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const nextExam = board.exams.find((e) => new Date(e.at).getTime() > now - 3 * 3600_000);
  const todays = board.schedule.filter((s) => s.date === today).sort((a, b) => a.start.localeCompare(b.start));
  const tomorrowKey = bkkDayKey(now + 86_400_000);
  const tomorrows = board.schedule.filter((s) => s.date === tomorrowKey).sort((a, b) => a.start.localeCompare(b.start));
  const classes = todays.length ? todays : tomorrows;
  const fees = mine.fees;
  const zone = mine.zone;

  const [annSort, setAnnSort] = useState<"due" | "new">("due");
  const [showPast, setShowPast] = useState(false);
  // สิ่งที่ต้องกรอก
  const stateOf = (id: string) => mine.forms.find((f) => f.id === id)?.state ?? "none";
  const undoOf = (id: string) => !!mine.forms.find((f) => f.id === id)?.undo;
  const forms = [...board.forms].sort((a, b) => (a.deadline_at || "9").localeCompare(b.deadline_at || "9"));
  const todo = forms.filter((f) => stateOf(f.id) !== "done" && !f.closed);
  const ended = forms.filter((f) => stateOf(f.id) !== "done" && f.closed); // ปิดรับแล้ว (โชว์อีก 1 วันแล้วหายเอง)
  const done = forms.filter((f) => stateOf(f.id) === "done");

  const owe = fees.months.length > 0 && fees.outstanding > 0;
  const zoneBad = zone.level === "red" || zone.level === "close";

  return (
    <div className="col dash">
      <header className="dash-head">
        <div>
          <div className="when">{`วัน${TH_DAYS[p.dow]}ที่ ${p.d} ${TH_MONTHS[p.m]}`}</div>
          <h1>{greeting(now)} {mine.me.nickname}</h1>
        </div>
        <button className="help-pill press" data-tour="help" onClick={() => { haptic(); openTour(); }}>วิธีใช้</button>
        <button className="avatar press" onClick={() => go("me")} aria-label="ของฉัน">
          {picture ? <img src={picture} alt="" /> : initialOf(mine.me.nickname)}
        </button>
      </header>

      {/* นับถอยหลังสอบ — เห็นเลขวิ่งชัด แต่ไม่กินที่ */}
      {nextExam && (
        <button className="cd press" data-tour="exam" onClick={() => go("schedule")}>
          <div className="cd-l">
            <span className="cd-lbl">สอบถัดไป</span>
            <span className="cd-name">{nextExam.name}</span>
            <span className="cd-when">{thDateTime(nextExam.at)}</span>
          </div>
          <Countdown iso={nextExam.at} now={now} />
        </button>
      )}

      {/* สถานะส่วนตัวที่ห้ามพลาด */}
      <div className="alerts">
        <button className={`alert press ${owe ? (fees.overdue ? "bad" : "warn") : "green"}`} data-tour="fees" onClick={() => go("me", "fees")}>
          <span className="al-ic"><IWallet width={18} height={18} /></span>
          <span className="al-t"><small>เงินรุ่น</small><b>{owe ? `ค้าง ${fees.outstanding.toLocaleString()} ฿` : fees.months.length === 0 ? "ไม่มียอดค้าง" : "จ่ายครบแล้ว"}</b>{!owe && <em>{fees.months.length === 0 ? "ยังไม่มีการเรียกเก็บ" : "ขอบคุณที่ตรงเวลา"}</em>}{owe && <em>แตะเพื่อจ่าย/ส่งสลิป</em>}</span>
        </button>
        {zone.enabled ? (
          <button className={`alert press ${zone.level === "red" ? "bad" : zone.level === "close" ? "warn" : "ok"}`} data-tour="zone" onClick={() => go("me", "zone")}>
            <span className="al-ic"><IShield width={18} height={18} /></span>
            <span className="al-t"><small>Red Zone · ค้าง {zone.strikes}/3</small><b>{zone.title}</b>{zone.strikes > 0 && <em>แตะเพื่อดูว่าค้างอะไร</em>}</span>
          </button>
        ) : (
          <button className="alert press green" data-tour="zone" onClick={openHistory}>
            <span className="al-ic"><IShield width={18} height={18} /></span>
            <span className="al-t"><small>สถานะของฉัน</small><b>Green Zone</b><em>แตะเพื่อดูประวัติ</em></span>
          </button>
        )}
      </div>

      {board.notice && <div className="notice"><span>📣</span><span className="selectable">{board.notice}</span></div>}

      {/* วันนี้เรียน — แถวเดียวเลื่อนได้ */}
      <section className="panel" data-tour="classes">
        <div className="ph"><h2>{todays.length ? "วันนี้เรียน" : tomorrows.length ? "พรุ่งนี้เรียน" : "วันนี้"}</h2><button className="ph-more" onClick={() => go("schedule")}>ตาราง ›</button></div>
        {classes.length ? (
          <div className="cls-row">
            {classes.map((s) => {
              const st = new Date(`${s.date}T${s.start || "00:00"}:00+07:00`).getTime();
              const en = new Date(`${s.date}T${s.end || s.start || "23:59"}:00+07:00`).getTime();
              const live = now >= st && now <= en;
              return (
                <div key={s.id} className={`cls ${live ? "now" : ""} ${now > en ? "past" : ""}`}>
                  <span className="cls-t">{s.start}{s.end ? `–${s.end}` : ""}{live && <i>กำลังเรียน</i>}</span>
                  <b className="clamp2">{s.subject}</b>
                  {(s.building || s.room) && <span className="cls-w">{WHERE(s.building, s.room)}</span>}
                </div>
              );
            })}
          </div>
        ) : <div className="p-empty">{board.schedule.length ? "ไม่มีเรียนวันนี้และพรุ่งนี้ 🌤️" : "ยังไม่มีตารางเรียนในระบบ"}</div>}
      </section>

      {/* สิ่งที่ต้องกรอก */}
      {forms.length > 0 && (
        <section className="panel" ref={todoRef} data-tour="todo">
          <div className="ph">
            <h2>สิ่งที่ต้องกรอก {todo.length > 0 && <span className="cnt red">{todo.length}</span>}</h2>
            <span className="progress-mini"><i style={{ width: `${(done.length / Math.max(1, forms.length - ended.length)) * 100}%` }} /></span>
            <span className="ph-note">{done.length}/{forms.length - ended.length}</span>
          </div>
          {todo.length === 0 && <div className="p-empty ok">🎉 กรอกครบทุกอย่างแล้ว</div>}
          {todo.map((f) => <TodoRow key={f.id} f={f} state={stateOf(f.id)} undo={undoOf(f.id)} now={now} onClaim={() => claimForm(f.id)} onUnclaim={() => claimForm(f.id, true)} preview={!!data.preview} />)}
          {ended.map((f) => <TodoRow key={f.id} f={f} state={stateOf(f.id)} undo={false} now={now} onClaim={async () => {}} onUnclaim={async () => {}} preview />)}
          {done.length > 0 && <button className="p-link" onClick={() => setShowDone((v) => !v)}>✓ กรอกแล้ว {done.length} {showDone ? "▴" : "▾"}</button>}
          {showDone && done.map((f) => <TodoRow key={f.id} f={f} state="done" undo={undoOf(f.id)} now={now} onClaim={async () => {}} onUnclaim={() => claimForm(f.id, true)} preview={!!data.preview} />)}
        </section>
      )}

      {/* ประกาศ — ใกล้ถึงก่อน / อีกนาน / ทั่วไป (หรือเรียงล่าสุด) · ชุดที่กรรมการจัดไว้ = ก้อนเดียว · ที่ผ่านไปแล้วซ่อนไว้ */}
      <section className="panel" ref={annRef} data-tour="ann">
        <div className="ph">
          <h2>ประกาศ</h2>
          <span className="sort-pills">
            <button className={annSort === "due" ? "on" : ""} onClick={() => { haptic(); setAnnSort("due"); }}>ใกล้ถึง</button>
            <button className={annSort === "new" ? "on" : ""} onClick={() => { haptic(); setAnnSort("new"); }}>ล่าสุด</button>
          </span>
        </div>
        <AnnFeed list={board.announcements} sort={annSort} now={now} openAnn={openAnn} />
        {(board.past?.length ?? 0) > 0 && (
          <>
            <button className="past-link" onClick={() => { haptic(); setShowPast((v) => !v); }}>ที่ผ่านมาแล้ว {board.past!.length} {showPast ? "▴" : "›"}</button>
            {showPast && <div className="past-list">{board.past!.map((a) => <AnnRow key={a.id} a={a} now={now} onOpen={() => openAnn(a.id)} past />)}</div>}
          </>
        )}
      </section>

      {board.daily && board.daily.items.length > 0 && (
        <DailyCard daily={board.daily} now={now} canOpen={(id) => board.announcements.some((a) => a.id === id)} openAnn={openAnn} />
      )}

      <button className="fortune-row press" onClick={() => go("fortune")}>
        <MiniWheel size={40} />
        <div style={{ flex: 1, textAlign: "left" }}>
          <div className="b" style={{ fontSize: 14.5 }}>เซียมซีประจำวัน</div>
          <div className="muted" style={{ fontSize: 12.5 }}>{mine.fortune.last_day === today ? `วันนี้เขย่าแล้ว · สะสม ${countOf(mine.fortune.collected)}/200` : "ใบแรกของวันการันตี Gold ขึ้นไป ✨"}</div>
        </div>
        <IChevronR width={18} height={18} />
      </button>
    </div>
  );
}

function AnnRow({ a, now, onOpen, past }: { a: Ann; now: number; onOpen: () => void; past?: boolean }) {
  const c = catOf(a.category);
  const dl = a.deadline_at || a.event_at;
  const tone = a.deadline_at ? deadlineTone(a.deadline_at, now) : "info";
  return (
    <button className={`arow press ${tone === "urgent" && !past ? "hot" : ""} ${past ? "past" : ""}`} onClick={onOpen}>
      <span className="a-ic" style={{ background: `linear-gradient(150deg, ${c.c1}, ${c.c2})` }}>{c.em}</span>
      <span className="a-b">
        <span className="a-t clamp2">{a.title}</span>
        <span className="a-m">
          {past ? <span className="chip">{dl ? `ผ่านไปแล้ว · ${thDateTime(dl, false)}` : "ที่ผ่านมา"}</span> : dl ? <DeadlineChip iso={dl} now={now} prefix={a.deadline_at ? "ปิด " : ""} /> : null}
          <span>{a.author || "กรรมการรุ่น"} · {agoTh(a.created_at, now)}</span>
        </span>
      </span>
      <IChevronR width={15} height={15} />
    </button>
  );
}

function TodoRow({ f, state, undo, now, onClaim, onUnclaim, preview }: { f: AppData["board"]["forms"][number]; state: string; undo: boolean; now: number; onClaim: () => Promise<void>; onUnclaim: () => Promise<void>; preview: boolean }) {
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const isDone = state === "done";
  const ticked = isDone || state === "claimed";
  // ติ๊กแล้วแตะอีกที = ถามก่อนยกเลิก (เฉพาะที่กดเอง) — กันกดพลาด แต่ไม่ล็อกตาย
  const canTap = !preview && !busy && (!ticked || undo);
  return (
    <div className={`trow ${isDone || f.closed ? "done" : ""}`}>
      <button className={`check ${isDone ? "on" : state === "claimed" ? "half" : ""}`} disabled={!canTap} aria-label={ticked ? "ยกเลิกกรอกแล้ว" : "ฉันกรอกแล้ว"}
        onClick={async () => {
          haptic();
          if (ticked) { setAsk((v) => !v); return; }
          setBusy(true); await onClaim(); setBusy(false);
        }}>
        {ticked ? <ICheck width={14} height={14} /> : null}
      </button>
      <span className="a-b">
        <span className="a-t clamp2">{f.name}</span>
        {ask ? (
          <span className="a-m undo-ask">
            <span>ยังไม่ได้กรอกใช่ไหม?</span>
            <button className="chip urgent press" disabled={busy} onClick={async () => { haptic(); setBusy(true); await onUnclaim(); setBusy(false); setAsk(false); }}>ยกเลิกติ๊ก</button>
            <button className="chip press" onClick={() => setAsk(false)}>ไม่</button>
          </span>
        ) : (
          <span className="a-m">
            {f.closed && !isDone ? <span className="chip">ปิดรับแล้ว</span> : state === "claimed" ? <span className="chip violet">รอกรรมการยืนยัน</span> : !isDone && f.deadline_at ? <DeadlineChip iso={f.deadline_at} now={now} prefix="ปิด " /> : null}
            {!ticked && !f.closed && <span>ทำแล้วแตะวงกลม</span>}
            {ticked && undo && <span>แตะวงกลมเพื่อยกเลิก</span>}
          </span>
        )}
      </span>
      {f.link && !(f.closed && !ticked) && <a className={`go-btn ${ticked ? "ghost" : ""}`} href={f.link} target="_blank" rel="noopener noreferrer">{ticked ? "เปิด" : "กรอก"}</a>}
    </div>
  );
}

function Countdown({ iso, now }: { iso: string; now: number }) {
  const c = countdownParts(iso, now);
  const cell = (v: number, l: string) => <span className="cd-cell"><b>{String(v).padStart(2, "0")}</b><small>{l}</small></span>;
  return <span className="cd-digits">{cell(c.d, "วัน")}{cell(c.h, "ชม.")}{cell(c.m, "นาที")}{cell(c.s, "วิ")}</span>;
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
