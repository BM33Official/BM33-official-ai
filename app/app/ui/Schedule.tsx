"use client";
import { useMemo, useRef, useState } from "react";
import type { AppData } from "./useApp";
import { haptic } from "./useApp";
import { useNow } from "./Home";
import { IChevronL, IChevronR, IClock } from "./icons";
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

  const upcomingExams = board.exams.filter((e) => new Date(e.at).getTime() > now - 3 * 3600_000);
  const classesOf = (d: string) => board.schedule.filter((s) => s.date === d).sort((a, b) => a.start.localeCompare(b.start));
  const examsOf = (d: string) => board.exams.filter((e) => e.date === d);
  const ahead = Array.from(new Set(board.schedule.filter((s) => { const d = dayDiff(s.date + "T12:00:00+07:00", now); return d >= 1 && d <= 14; }).map((s) => s.date))).sort().slice(0, 7);

  const DayList = ({ d }: { d: string }) => {
    const cls = classesOf(d), ex = examsOf(d);
    if (!cls.length && !ex.length) return <div className="p-empty">{board.schedule.length ? "ไม่มีคาบเรียน 🌤️" : "ยังไม่มีตารางเรียนในระบบ — รอฝ่ายวิชาการอัปโหลดนะ"}</div>;
    return (
      <div className="slist">
        {ex.map((e) => (
          <div key={e.id} className="srow exam">
            <span className="st">{e.start || "—"}<small>{e.end}</small></span>
            <span className="sb"><b>📝 {e.name}</b><small>{[e.building, e.room].filter(Boolean).join(" · ") || "ไม่ระบุสถานที่"}</small></span>
          </div>
        ))}
        {cls.map((c) => {
          const st = new Date(`${c.date}T${c.start || "00:00"}:00+07:00`).getTime();
          const en = new Date(`${c.date}T${c.end || c.start || "23:59"}:00+07:00`).getTime();
          const live = now >= st && now <= en;
          return (
            <div key={c.id} className={`srow ${live ? "now" : ""} ${d === today && now > en ? "past" : ""}`} style={{ ["--k" as string]: KIND_COLOR[c.kind] ?? "#7cc4ff" }}>
              <span className="st">{c.start}<small>{c.end}</small></span>
              <span className="sb">
                <b>{c.subject}{live && <i className="live">กำลังเรียน</i>}{c.kind !== "lecture" && <i className="kd">{KIND_TH[c.kind] ?? c.kind}</i>}</b>
                <small>{[c.topic, [c.building, c.room && (/\d/.test(c.room) ? `ห้อง ${c.room}` : c.room)].filter(Boolean).join(" "), c.lecturer && `อ.${c.lecturer}`].filter(Boolean).join(" · ")}</small>
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="col dash">
      <div className="dash-head"><div><div className="when">{board.semester || "ตารางเรียนของรุ่น"}</div><h1>ตาราง</h1></div></div>

      <section className="panel">
        <div className="ph"><h2>วันนี้ · {thLongDate(today + "T12:00:00+07:00")}</h2></div>
        <DayList d={today} />
      </section>

      {upcomingExams.length > 0 && (
        <section className="panel">
          <div className="ph"><h2>สอบที่กำลังจะมาถึง</h2></div>
          {upcomingExams.slice(0, 5).map((e) => {
            const d = Math.max(0, dayDiff(e.at, now));
            return (
              <button key={e.id} className="erow press" onClick={() => { setSel(e.date); setYm({ y: +e.date.slice(0, 4), m: +e.date.slice(5, 7) - 1 }); }}>
                <span className="ed"><b>{d}</b><small>{d === 0 ? "วันนี้" : "วัน"}</small></span>
                <span className="sb"><b>{e.name}</b><small>{thDateTime(e.at)}{e.end ? `–${e.end}` : ""}{e.building || e.room ? ` · ${[e.building, e.room].filter(Boolean).join(" ")}` : ""}</small></span>
              </button>
            );
          })}
        </section>
      )}

      <section
        className="panel cal mini"
        onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={(e) => {
          const t = touch.current; touch.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1);
        }}
      >
        <div className="mhead">
          <button className="nav press" onClick={() => shift(-1)} aria-label="เดือนก่อน"><IChevronL width={16} height={16} /></button>
          <b>{TH_MONTHS[ym.m]} {ym.y + 543}</b>
          <button className="nav press" onClick={() => shift(1)} aria-label="เดือนถัดไป"><IChevronR width={16} height={16} /></button>
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
        {sel !== today && (
          <div className="seldays">
            <div className="grp">{thLongDate(sel + "T12:00:00+07:00")}</div>
            <DayList d={sel} />
          </div>
        )}
      </section>

      {ahead.length > 0 && (
        <section className="panel">
          <div className="ph"><h2>วันข้างหน้า</h2><span className="ph-note"><IClock width={12} height={12} /> 2 สัปดาห์</span></div>
          {ahead.map((d) => {
            const cls = classesOf(d);
            return (
              <button key={d} className="arow" onClick={() => { haptic(); setSel(d); setYm({ y: +d.slice(0, 4), m: +d.slice(5, 7) - 1 }); }}>
                <span className="dchip"><small>{TH_DAYS_SHORT[bkkParts(d + "T12:00:00+07:00").dow]}</small><b>{+d.slice(8)}</b></span>
                <span className="a-b"><span className="a-t" style={{ fontSize: 13.5 }}>{cls.map((w) => w.subject).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}</span>
                  <span className="a-m">{cls.length} คาบ · เริ่ม {cls[0]?.start} น.</span></span>
                <IChevronR width={15} height={15} />
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}
