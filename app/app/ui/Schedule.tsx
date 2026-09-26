"use client";
import { useMemo, useRef, useState } from "react";
import type { AppData } from "./useApp";
import { haptic } from "./useApp";
import { useNow } from "./Home";
import { IChevronL, IChevronR, IPin, IClock } from "./icons";
import { bkkDayKey, bkkParts, thLongDate, thDateTime, dayDiff, TH_MONTHS, TH_DAYS_SHORT } from "@/lib/time";

const KIND_COLOR: Record<string, string> = {
  lecture: "#7cc4ff", lab: "#5eead4", exam: "#fb7185", activity: "#fcd34d", other: "#a5b4fc",
};
const KIND_TH: Record<string, string> = { lecture: "บรรยาย", lab: "แล็บ", exam: "สอบ", activity: "กิจกรรม", other: "อื่น ๆ" };

export default function Schedule({ data, active }: { data: AppData; active: boolean }) {
  const now = useNow(60_000, active);
  const { board } = data;
  const today = bkkDayKey(now);
  const [sel, setSel] = useState(today);
  const tp = bkkParts(now);
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: tp.y, m: tp.m });
  const touch = useRef<{ x: number; y: number } | null>(null);

  const byDay = useMemo(() => {
    const m = new Map<string, { classes: number; exam: boolean; event: boolean }>();
    for (const s of board.schedule) {
      const e = m.get(s.date) ?? { classes: 0, exam: false, event: false };
      if (s.kind === "exam") e.exam = true; else if (s.kind === "activity") e.event = true; else e.classes++;
      m.set(s.date, e);
    }
    for (const x of board.exams) {
      const e = m.get(x.date) ?? { classes: 0, exam: false, event: false };
      e.exam = true;
      m.set(x.date, e);
    }
    return m;
  }, [board.schedule, board.exams]);

  // ตารางวันของเดือน (เริ่มวันอาทิตย์)
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(ym.y, ym.m, 1));
    const startDow = first.getUTCDay();
    const out: { key: string; d: number; other: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const dt = new Date(Date.UTC(ym.y, ym.m, 1 - startDow + i));
      out.push({
        key: `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`,
        d: dt.getUTCDate(),
        other: dt.getUTCMonth() !== ym.m,
      });
    }
    // ตัดแถวสุดท้ายถ้าเป็นเดือนถัดไปล้วน
    return out.slice(35).every((c) => c.other) ? out.slice(0, 35) : out;
  }, [ym]);

  const shift = (k: number) => {
    haptic();
    setYm(({ y, m }) => { const d = new Date(Date.UTC(y, m + k, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  };

  const dayItems = board.schedule.filter((s) => s.date === sel);
  const dayExams = board.exams.filter((e) => e.date === sel);
  const upcomingExams = board.exams.filter((e) => new Date(e.at).getTime() > now - 3 * 3600_000);
  const week = board.schedule.filter((s) => { const d = dayDiff(s.date + "T12:00:00+07:00", now); return d >= 0 && d < 7; });

  return (
    <div className="col">
      <div className="largetitle">
        <div className="eyebrow">{board.semester || "ตารางเรียนของรุ่น"}</div>
        <h1>ตาราง</h1>
      </div>

      <div className="sched-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <section
            className="glass cal"
            onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
            onTouchEnd={(e) => {
              const t = touch.current; touch.current = null;
              if (!t) return;
              const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
              if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1);
            }}
          >
            <div className="mhead">
              <button className="nav press" onClick={() => shift(-1)} aria-label="เดือนก่อน"><IChevronL width={18} height={18} /></button>
              <b>{TH_MONTHS[ym.m]} {ym.y + 543}</b>
              <button className="nav press" onClick={() => shift(1)} aria-label="เดือนถัดไป"><IChevronR width={18} height={18} /></button>
            </div>
            <div className="grid">
              {TH_DAYS_SHORT.map((d) => <div key={d} className="dow">{d}</div>)}
              {cells.map((c) => {
                const info = byDay.get(c.key);
                return (
                  <button key={c.key} className={`day ${c.other ? "other" : ""} ${c.key === today ? "today" : ""} ${c.key === sel ? "sel" : ""}`}
                    onClick={() => { haptic(); setSel(c.key); if (c.other) setYm({ y: +c.key.slice(0, 4), m: +c.key.slice(5, 7) - 1 }); }}>
                    {c.d}
                    {info && (
                      <span className="dots">
                        {info.classes > 0 && <i />}
                        {info.exam && <i className="ex" />}
                        {info.event && <i className="ev" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="row" style={{ gap: 14, justifyContent: "center", marginTop: 10 }}>
              <span className="tiny muted row" style={{ gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: 9, background: "var(--sky)", display: "inline-block" }} />เรียน</span>
              <span className="tiny muted row" style={{ gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: 9, background: "var(--rose)", display: "inline-block" }} />สอบ</span>
              <span className="tiny muted row" style={{ gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: 9, background: "var(--gold)", display: "inline-block" }} />กิจกรรม</span>
            </div>
          </section>

          {upcomingExams.length > 0 && (
            <>
              <div className="sect"><h2>สอบที่กำลังจะมาถึง</h2></div>
              {upcomingExams.slice(0, 6).map((e) => {
                const d = Math.max(0, dayDiff(e.at, now));
                return (
                  <button key={e.id} className="glass exam-card press" onClick={() => { setSel(e.date); setYm({ y: +e.date.slice(0, 4), m: +e.date.slice(5, 7) - 1 }); }}>
                    <div className="days"><b>{d}</b><span>{d === 0 ? "วันนี้!" : "วัน"}</span></div>
                    <div style={{ textAlign: "left", minWidth: 0 }}>
                      <div className="b" style={{ fontSize: 16, lineHeight: 1.3 }}>{e.name}</div>
                      <div className="soft small" style={{ marginTop: 3 }}>{thDateTime(e.at)}{e.end ? `–${e.end}` : ""}</div>
                      {(e.building || e.room) && <div className="tiny muted" style={{ marginTop: 3 }}>📍 {[e.building, e.room].filter(Boolean).join(" · ")}</div>}
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="sect" style={{ paddingTop: 0 }}>
            <h2 style={{ fontSize: 17 }}>{sel === today ? "วันนี้ · " : ""}{thLongDate(sel + "T12:00:00+07:00")}</h2>
          </div>
          {dayExams.map((e) => (
            <div key={e.id} className="glass class-card tint-rose">
              <div><div className="t1">{e.start || "—"}</div><div className="t2">{e.end}</div></div>
              <div><div className="s">📝 {e.name}</div><div className="d">{[e.building, e.room].filter(Boolean).join(" · ") || "ไม่ระบุสถานที่"}</div>{e.note && <div className="d">{e.note}</div>}</div>
            </div>
          ))}
          {dayItems.map((s) => (
            <div key={s.id} className="glass class-card fade-in">
              <div style={{ display: "flex", gap: 10 }}>
                <div className="bar" style={{ background: KIND_COLOR[s.kind] ?? "#7cc4ff" }} />
                <div><div className="t1">{s.start}</div><div className="t2">{s.end}</div></div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="s">{s.subject}</div>
                {s.topic && <div className="d">{s.topic}</div>}
                <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {(s.building || s.room) && <span className="chip"><IPin width={12} height={12} />{[s.building, s.room].filter(Boolean).join(" · ")}</span>}
                  {s.lecturer && <span className="chip">อ.{s.lecturer}</span>}
                  {s.kind !== "lecture" && <span className="chip" style={{ borderColor: KIND_COLOR[s.kind] }}>{KIND_TH[s.kind] ?? s.kind}</span>}
                </div>
                {s.note && <div className="tiny muted" style={{ marginTop: 6 }}>{s.note}</div>}
              </div>
            </div>
          ))}
          {dayItems.length === 0 && dayExams.length === 0 && (
            <div className="glass empty"><div className="big">🌤️</div>{board.schedule.length ? "ไม่มีคาบเรียนวันนี้" : "ยังไม่มีตารางเรียนในระบบ — รอฝ่ายวิชาการอัปโหลดนะ"}</div>
          )}

          {week.length > 0 && sel === today && (
            <div className="glass card">
              <div className="row between"><b>7 วันข้างหน้า</b><span className="tiny muted"><IClock width={12} height={12} /> {week.length} คาบ</span></div>
              <div className="list" style={{ marginTop: 6 }}>
                {Array.from(new Set(week.map((w) => w.date))).slice(0, 7).map((d) => (
                  <button key={d} className="li" style={{ textAlign: "left" }} onClick={() => setSel(d)}>
                    <div style={{ width: 54 }} className="b small">{TH_DAYS_SHORT[bkkParts(d + "T12:00:00+07:00").dow]} {+d.slice(8)}</div>
                    <div className="grow soft small ellipsis">{week.filter((w) => w.date === d).map((w) => w.subject).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}</div>
                    <IChevronR width={16} height={16} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
