"use client";
// ชิ้นส่วนโครงแอป: Sheet (ปัดลงเพื่อปิด), TabBar (แคปซูลแก้วเลื่อนตามแท็บ), Segmented, Toast
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IHome, ICalendar, IUser, IWheel, IClose } from "./icons";
import { haptic } from "./useApp";

export type TabKey = "home" | "schedule" | "me" | "fortune";
export const TABS: { key: TabKey; label: string; Icon: typeof IHome }[] = [
  { key: "home", label: "หน้าหลัก", Icon: IHome },
  { key: "schedule", label: "ตาราง", Icon: ICalendar },
  { key: "fortune", label: "เซียมซี", Icon: IWheel },
  { key: "me", label: "ของฉัน", Icon: IUser },
];

export function TabBar({ tab, onTab, badges }: { tab: TabKey; onTab: (t: TabKey) => void; badges: Partial<Record<TabKey, boolean>> }) {
  const idx = TABS.findIndex((t) => t.key === tab);
  return (
    <nav className="tabbar glass" role="tablist">
      <div className="blob" style={{ left: `calc(7px + (100% - 14px) / ${TABS.length} * ${idx})`, width: `calc((100% - 14px) / ${TABS.length})` }} />
      {TABS.map(({ key, label, Icon }) => (
        <button
          key={key}
          role="tab"
          aria-selected={tab === key}
          className={tab === key ? "on" : ""}
          onClick={() => { if (tab !== key) haptic(); onTab(key); }}
        >
          <Icon filled={tab === key} />
          <span>{label}</span>
          {badges[key] && <i className="dot" />}
        </button>
      ))}
    </nav>
  );
}

// เรนเดอร์ชั้นบนสุด (sheet/overlay) ออกนอกหน้าจอที่ถูกซ้อน -> อยู่เหนือแถบแท็บเสมอ
export function Layer({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<Element | null>(null);
  useEffect(() => { setEl(document.querySelector(".bm-root")); }, []);
  return el ? createPortal(children, el) : null;
}

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; dy: number; active: boolean }>({ y0: 0, dy: 0, active: false });
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    else { const t = setTimeout(() => setMounted(false), 500); return () => clearTimeout(t); }
  }, [open]);

  // ปัดลงที่หัว sheet หรือเมื่อเนื้อหาเลื่อนอยู่บนสุด -> ปิด
  useEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    const start = (e: TouchEvent) => {
      const top = contentRef.current?.scrollTop ?? 0;
      const fromGrab = (e.target as HTMLElement).closest(".grab");
      if (top > 0 && !fromGrab) return;
      drag.current = { y0: e.touches[0].clientY, dy: 0, active: true };
      el.style.transition = "none";
    };
    const move = (e: TouchEvent) => {
      if (!drag.current.active) return;
      const dy = e.touches[0].clientY - drag.current.y0;
      if (dy <= 0) { el.style.transform = ""; drag.current.dy = 0; return; }
      drag.current.dy = dy;
      el.style.transform = `translateY(${dy * 0.9}px)`;
      if (e.cancelable) e.preventDefault();
    };
    const end = () => {
      if (!drag.current.active) return;
      el.style.transition = "";
      el.style.transform = "";
      if (drag.current.dy > 110) { haptic(); onClose(); }
      drag.current.active = false;
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    return () => { el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", move); el.removeEventListener("touchend", end); };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);

  if (!mounted) return null;
  return (
    <Layer>
      <div className={`scrim ${open ? "on" : ""}`} onClick={onClose} />
      <div ref={ref} className={`sheet ${open ? "on" : ""}`} role="dialog" aria-modal="true">
        <div className="grab"><i /></div>
        <button className="close press" onClick={onClose} aria-label="ปิด"><IClose width={18} height={18} /></button>
        <div className="content" ref={contentRef}>{children}</div>
      </div>
    </Layer>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  const idx = Math.max(0, options.findIndex((o) => o.key === value));
  return (
    <div className="seg glass thin">
      <div className="thumb" style={{ left: `calc(4px + (100% - 8px) / ${options.length} * ${idx})`, width: `calc((100% - 8px) / ${options.length})` }} />
      {options.map((o) => (
        <button key={o.key} className={o.key === value ? "on" : ""} onClick={() => { haptic(); onChange(o.key); }}>{o.label}</button>
      ))}
    </div>
  );
}

// หัวข้อใหญ่ที่ย่อเป็นแถบบางเมื่อเลื่อน (แบบ iOS)
export function useCollapsingTitle(scrollEl: HTMLElement | null, threshold = 56) {
  const [collapsed, setCollapsed] = useState(false);
  useLayoutEffect(() => {
    if (!scrollEl) return;
    const on = () => setCollapsed(scrollEl.scrollTop > threshold);
    on();
    scrollEl.addEventListener("scroll", on, { passive: true });
    return () => scrollEl.removeEventListener("scroll", on);
  }, [scrollEl, threshold]);
  return collapsed;
}

export function Toast({ text, n = 0 }: { text: string; n?: number }) {
  const [shown, setShown] = useState("");
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!text) return;
    setShown(text);
    setOn(true);
    const t = setTimeout(() => setOn(false), 2600);
    return () => clearTimeout(t);
  }, [text, n]);
  return <div className={`toast glass ${on ? "on" : ""}`}>{shown}</div>;
}

// ข้อความที่มีลิงก์ -> ทำให้กดได้
export function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')\]]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p)
          ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p.length > 48 ? p.slice(0, 46) + "…" : p}</a>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

export function initialOf(name: string): string {
  const chars = Array.from((name || "?").trim());
  // สระหน้า (เ แ โ ใ ไ) ไม่ใช่ตัวแรกที่ควรโชว์ -> เอาพยัญชนะตามหลังมาด้วย
  if (/[เแโใไ]/.test(chars[0] ?? "") && chars[1]) return chars[0] + chars[1];
  return chars[0] ?? "?";
}
