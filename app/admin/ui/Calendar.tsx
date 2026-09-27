"use client";
// ปฏิทินเดือน (แบบแอปปฏิทินของ iPhone) — แตะวันเพื่อดูรายละเอียด
import { useState } from "react";
import { ChevronLeft, ChevronRight, BookOpen, FileText, Clock, CalendarDays, ClipboardCheck } from "lucide-react";

export type CalItem = { day: string; time: string; kind: "class" | "exam" | "deadline" | "event" | "form"; title: string; sub?: string };
const TH_MONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const KIND = {
  class: { th: "เรียน", icon: BookOpen, color: "#007aff" }, exam: { th: "สอบ", icon: FileText, color: "#ff3b30" },
  deadline: { th: "เดดไลน์", icon: Clock, color: "#ff9500" }, event: { th: "นัด/งาน", icon: CalendarDays, color: "#af52de" },
  form: { th: "ปิดฟอร์ม", icon: ClipboardCheck, color: "#34c759" },
};

export default function Calendar({ month, items, today }: { month: string; items: CalItem[]; today: string }) {
  const [sel, setSel] = useState(today.startsWith(month) ? today : `${month}-01`);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first.getTime() - first.getUTCDay() * 86_400_000);
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  const byDay = new Map<string, CalItem[]>();
  for (const it of items) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it]);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const selItems = byDay.get(sel) ?? [];
  const selDate = new Date(sel + "T12:00:00Z");

  return (
    <div className="split-side">
      <div className="card">
        <div className="card-h">
          <h3 style={{ fontSize: 22 }}>{TH_MONTH[m - 1]} <span className="muted">{y + 543}</span></h3>
          <div className="row" style={{ gap: 6 }}>
            <a className="btn btn-sm" href={`?m=${prev}`} aria-label="เดือนก่อน"><ChevronLeft size={17} /></a>
            <a className="btn btn-sm" href="?">วันนี้</a>
            <a className="btn btn-sm" href={`?m=${next}`} aria-label="เดือนถัดไป"><ChevronRight size={17} /></a>
          </div>
        </div>
        <div className="cal">
          {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const classes = list.filter((x) => x.kind === "class");
            const other = list.filter((x) => x.kind !== "class");
            return (
              <button key={d} className={`day ${d.slice(0, 7) !== month ? "out" : ""} ${d === today ? "today" : ""} ${d === sel ? "sel" : ""}`} onClick={() => setSel(d)}>
                <span className="n"><b>{Number(d.slice(8))}</b></span>
                {other.slice(0, 2).map((x, i) => <span key={i} className={`ev ${x.kind}`}>{x.title}</span>)}
                {classes.length > 0 && <span className="ev class">{classes.length} คาบ</span>}
                {other.length > 2 && <span className="hint" style={{ fontSize: 11 }}>+{other.length - 2}</span>}
              </button>
            );
          })}
        </div>
        <div className="legend" style={{ marginTop: 14 }}>
          {Object.entries(KIND).map(([k, v]) => <span key={k}><i style={{ background: v.color }} />{v.th}</span>)}
        </div>
      </div>
      <div className="card" style={{ position: "sticky", top: 20 }}>
        <div className="label">{selDate.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</div>
        <h3 style={{ fontSize: 22, marginBottom: 12 }}>{selItems.length ? `${selItems.length} รายการ` : "ว่าง 🎉"}</h3>
        <div className="stack" style={{ gap: 8 }}>
          {selItems.map((x, i) => {
            const K = KIND[x.kind];
            return (
              <div key={i} className="row" style={{ gap: 12, flexWrap: "nowrap", alignItems: "flex-start" }}>
                <span className="ic" style={{ background: K.color }}><K.icon strokeWidth={2.4} /></span>
                <div style={{ minWidth: 0 }}><b style={{ fontSize: 15 }}>{x.title}</b><div className="hint">{[x.time && x.time !== "00:00" ? `${x.time} น.` : "", K.th, x.sub].filter(Boolean).join(" · ")}</div></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
