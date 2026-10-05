"use client";
// วิธีใช้ — ทัวร์แบบแอปมือโปร: ไฮไลต์ทีละส่วนบนหน้าจอจริง + การ์ดอธิบาย (ถัดไป / ย้อน / ข้าม · แตะจุดไฮไลต์ = ถัดไป)
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Layer } from "./Chrome";
import { haptic } from "./useApp";

export type TourStep = { target?: string; icon: string; title: string; text: string; tip?: string };

export const HOME_TOUR: TourStep[] = [
  { icon: "👋", title: "ยินดีต้อนรับสู่ BM33", text: "ทุกเรื่องของรุ่นอยู่ในแอปนี้ ใช้เวลาแค่ 30 วินาที มาดูกันว่าแต่ละส่วนทำอะไรได้บ้าง" },
  { target: "exam", icon: "⏳", title: "นับถอยหลังสอบ", text: "เห็นทันทีว่าอีกกี่วันถึงสอบครั้งถัดไป", tip: "แตะเพื่อดูตารางสอบทั้งหมด" },
  { target: "fees", icon: "💸", title: "เงินรุ่นของคุณ", text: "ยอดที่ต้องจ่าย ปุ่มชำระ และส่งสลิปได้ในที่เดียว ฝ่ายการเงินตรวจให้", tip: "ส่งรูปสลิปในแชตบอทก็ได้" },
  { target: "zone", icon: "🟢", title: "สถานะของฉัน", text: "ดูประวัติการเรียกเก็บเงินรุ่นและงานวิชาการของคุณ เห็นเฉพาะคุณคนเดียว" },
  { target: "classes", icon: "🏫", title: "วันนี้เรียนอะไร", text: "คาบเรียนวันนี้ ห้อง และเวลา คาบที่กำลังเรียนอยู่จะขึ้นป้ายให้", tip: "ปัดซ้าย-ขวาเพื่อดูคาบถัดไป" },
  { target: "todo", icon: "📝", title: "สิ่งที่ต้องกรอก", text: "ฟอร์มและงานที่ทุกคนต้องทำ กด “กรอก” เพื่อเปิดฟอร์ม ทำเสร็จแล้วแตะวงกลม ✓", tip: "กรรมการเห็นทันทีว่าใครทำแล้ว จะได้ไม่โดนตาม" },
  { target: "ann", icon: "📣", title: "ประกาศ", text: "เรียงเรื่องใกล้ถึงขึ้นก่อน สลับเป็น “ล่าสุด” ได้ เรื่องที่ผ่านไปแล้วย้ายไปอยู่ “ที่ผ่านมาแล้ว” ด้านล่าง", tip: "แตะประกาศเพื่ออ่านเต็ม กดลิงก์ หรือเพิ่มลงปฏิทิน" },
  { target: "daily", icon: "☀️", title: "สรุปวันนี้", text: "บอทสรุปเรื่องสำคัญให้ทุกเช้า อะไรด่วน อะไรวันนี้ อะไรรอข้างหน้า" },
  { target: "tab-schedule", icon: "🗓️", title: "ตาราง", text: "ตารางเรียนทั้งสัปดาห์และปฏิทินสอบแบบรายเดือน" },
  { target: "tab-fortune", icon: "🐉", title: "เซียมซี", text: "เขย่าวันละใบ ใบแรกของวันการันตี Gold ขึ้นไป สะสมให้ครบ 200 ใบ ลุ้นแจ็กพอต" },
  { target: "tab-me", icon: "👤", title: "ของฉัน", text: "โปรไฟล์ (ซิงก์รูปและชื่อจาก LINE) เงินรุ่น สิ่งที่ต้องทำวันนี้ และช่องทางติดต่อกรรมการ" },
  { target: "help", icon: "💬", title: "สงสัยอะไร ถามบอทได้", text: "กลับไปที่แชต BM33 ใน LINE แล้วพิมพ์ถามได้เลย เช่น “พรุ่งนี้เรียนอะไร” หรือ “เงินรุ่นค้างเท่าไหร่”", tip: "ดูวิธีใช้ซ้ำได้ที่ปุ่มนี้ทุกเมื่อ" },
];

type Rect = { x: number; y: number; w: number; h: number };
const PAD = 8;

export default function Tour({ steps: all, onClose }: { steps: TourStep[]; onClose: () => void }) {
  // ข้ามขั้นที่ไม่มีบนจอ (เช่น ยังไม่มีสอบ/ยังไม่มีสรุปวันนี้)
  const steps = useMemo(() => all.filter((s) => !s.target || document.querySelector(`[data-tour="${s.target}"]`)), [all]);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vh, setVh] = useState(844);
  const step = steps[i];

  const measure = useCallback(() => {
    setVh(window.innerHeight);
    if (!step?.target) { setRect(null); return; }
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: Math.min(r.height + PAD * 2, window.innerHeight * 0.52) });
  }, [step]);

  useLayoutEffect(() => {
    if (!step?.target) { measure(); return; }
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    if (el && !step.target.startsWith("tab-")) el.scrollIntoView({ behavior: "smooth", block: "center" });
    measure();
    const t1 = setTimeout(measure, 260), t2 = setTimeout(measure, 560);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [step, measure]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const next = useCallback(() => { haptic(); if (i < steps.length - 1) setI(i + 1); else onClose(); }, [i, steps.length, onClose]);
  const back = useCallback(() => { haptic(); setI((x) => Math.max(0, x - 1)); }, []);
  if (!step) return null;

  // การ์ดอยู่ฝั่งที่มีที่ว่างมากกว่า (บน/ล่างของจุดไฮไลต์)
  const below = !rect || rect.y + rect.h / 2 < vh / 2;
  const cardTop = !rect ? undefined : below ? Math.min(rect.y + rect.h + 14, vh - 250) : undefined;
  const cardBottom = rect && !below ? Math.max(vh - rect.y + 14, 20) : undefined;
  const last = i === steps.length - 1;

  return (
    <Layer>
      <div className="tour" role="dialog" aria-label="วิธีใช้">
        {rect ? (
          <div className="tour-hole" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} onClick={next}><i /></div>
        ) : <div className="tour-dim" />}
        <div className={`tour-card ${rect ? "" : "center"}`} key={i}
          style={rect ? { top: cardTop, bottom: cardBottom, left: 16, right: 16 } : { left: 20, right: 20, top: vh * 0.28 }}>
          <div className="tour-top">
            <span className="tour-ic">{step.icon}</span>
            <span className="tour-count">{i + 1} / {steps.length}</span>
            <button className="tour-skip" onClick={() => { haptic(); onClose(); }}>ข้าม</button>
          </div>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          {step.tip && <div className="tour-tip">💡 {step.tip}</div>}
          <div className="tour-dots">{steps.map((_, k) => <i key={k} className={k === i ? "on" : k < i ? "done" : ""} />)}</div>
          <div className="tour-btns">
            {i > 0 ? <button className="btn ghost" onClick={back}>ย้อน</button> : <span />}
            <button className="btn" onClick={next}>{last ? "เริ่มใช้งานเลย 🎉" : i === 0 ? "เริ่มทัวร์" : "ถัดไป"}</button>
          </div>
        </div>
      </div>
    </Layer>
  );
}
