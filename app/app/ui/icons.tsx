// ไอคอนเส้นบางแบบ iOS — วาดเอง ไม่พึ่งอีโมจิสำหรับส่วนควบคุม
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { filled?: boolean };
const base = (p: P) => ({
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...p,
});

export const IHome = ({ filled, ...p }: P) => (
  <svg {...base(p)}><path d="M3.5 10.6 12 4l8.5 6.6V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-5.6H9.2v5.6H5A1.5 1.5 0 0 1 3.5 19z" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : 0} /></svg>
);
export const IBell = ({ filled, ...p }: P) => (
  <svg {...base(p)}><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : 0} /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></svg>
);
export const ICalendar = ({ filled, ...p }: P) => (
  <svg {...base(p)}><rect x="3.5" y="5" width="17" height="15.5" rx="3" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : 0} /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><circle cx="8.5" cy="14" r=".9" fill="currentColor" /><circle cx="12" cy="14" r=".9" fill="currentColor" /><circle cx="15.5" cy="14" r=".9" fill="currentColor" /></svg>
);
export const IUser = ({ filled, ...p }: P) => (
  <svg {...base(p)}><circle cx="12" cy="8.5" r="4" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : 0} /><path d="M4.5 20c1.4-3.6 4.2-5.3 7.5-5.3s6.1 1.7 7.5 5.3" /></svg>
);
export const IWheel = ({ filled, ...p }: P) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" fill={filled ? "currentColor" : "none"} fillOpacity={filled ? 0.18 : 0} /><circle cx="12" cy="12" r="2.2" /><path d="M12 3.5v6.3M12 14.2v6.3M3.5 12h6.3M14.2 12h6.3M6 6l4.4 4.4M13.6 13.6 18 18M18 6l-4.4 4.4M10.4 13.6 6 18" strokeWidth={1.3} /></svg>
);
export const IChevronR = (p: P) => (<svg {...base(p)}><path d="m9 5.5 6.5 6.5L9 18.5" /></svg>);
export const IChevronL = (p: P) => (<svg {...base(p)}><path d="M15 5.5 8.5 12l6.5 6.5" /></svg>);
export const IClose = (p: P) => (<svg {...base(p)}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>);
export const IClock = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>);
export const IPin = (p: P) => (<svg {...base(p)}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" /><circle cx="12" cy="10" r="2.4" /></svg>);
export const ILink = (p: P) => (<svg {...base(p)}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>);
export const ICheck = (p: P) => (<svg {...base(p)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>);
export const IWallet = (p: P) => (<svg {...base(p)}><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M16 12.5h2.5M3 9.5h13a2 2 0 0 0 2-2V6" /></svg>);
export const IDoc = (p: P) => (<svg {...base(p)}><path d="M7 3.5h7l4.5 4.5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" /><path d="M13.5 3.5V8H18M8.5 12.5h7M8.5 16h5" /></svg>);
export const IShield = (p: P) => (<svg {...base(p)}><path d="M12 3 5 6v5.5c0 4.3 3 7.7 7 9.5 4-1.8 7-5.2 7-9.5V6z" /></svg>);
export const ILock = (p: P) => (<svg {...base(p)}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>);
export const ISpark = (p: P) => (<svg {...base(p)}><path d="M12 3.5 13.8 10 20.5 12 13.8 14 12 20.5 10.2 14 3.5 12 10.2 10z" /></svg>);
export const IBook = (p: P) => (<svg {...base(p)}><path d="M4.5 5.5A2 2 0 0 1 6.5 3.5H19v15H6.5a2 2 0 0 0-2 2z" /><path d="M4.5 20.5v-15M19 18.5v2h-12.5" /></svg>);
export const IChat = (p: P) => (<svg {...base(p)}><path d="M20 12a7.5 7.5 0 0 1-11 6.6L4.5 20l1.3-4A7.5 7.5 0 1 1 20 12z" /></svg>);
export const IFlame = (p: P) => (<svg {...base(p)}><path d="M12 21c3.6 0 6-2.4 6-5.8 0-3.5-2.5-5.6-3.4-8.7-.2 2-1.2 3.2-2.3 3.8C12.2 7.3 10.5 4.6 8 3c.4 3-1.2 5-2.3 6.7A6.6 6.6 0 0 0 6 15.2C6 18.6 8.4 21 12 21z" /></svg>);
export const IRefresh = (p: P) => (<svg {...base(p)}><path d="M20 11a8 8 0 0 0-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16M20 20v-4h-4" /></svg>);
export const ISound = ({ filled, ...p }: P) => (<svg {...base(p)}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />{filled ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="m16 9.5 5 5M21 9.5l-5 5" />}</svg>);
export const IShare = (p: P) => (<svg {...base(p)}><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8" /><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" /></svg>);
