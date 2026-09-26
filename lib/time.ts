// เวลาไทย (Asia/Bangkok, UTC+7 ไม่มี DST) — ใช้ได้ทั้ง server และ client
export const TZ = "Asia/Bangkok";
const OFFSET_MS = 7 * 3600_000;

export const TH_DAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
export const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export const TH_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// แยกส่วนประกอบวันเวลาตามเวลาไทย
export function bkkParts(d: Date | string | number) {
  const t = new Date(typeof d === "string" || typeof d === "number" ? d : d.getTime());
  const x = new Date(t.getTime() + OFFSET_MS);
  return {
    y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(),
    hh: x.getUTCHours(), mm: x.getUTCMinutes(), dow: x.getUTCDay(),
  };
}

export function isValidDate(s: string | undefined | null): boolean {
  if (!s) return false;
  return !isNaN(new Date(s).getTime());
}

// YYYY-MM-DD ตามเวลาไทย
export function bkkDayKey(d: Date | string | number = Date.now()): string {
  const p = bkkParts(d);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

// "YYYY-MM-DD" + "HH:mm" (เวลาไทย) -> Date
export function bkkDate(day: string, time = "00:00"): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, (hh || 0) - 7, mm || 0));
}

const pad = (n: number) => String(n).padStart(2, "0");

// "พฤ. 2 ต.ค. 69"
export function thShortDate(d: Date | string): string {
  const p = bkkParts(d);
  return `${TH_DAYS_SHORT[p.dow]} ${p.d} ${TH_MONTHS_SHORT[p.m]} ${String((p.y + 543) % 100).padStart(2, "0")}`;
}
// "วันพฤหัสบดีที่ 2 ตุลาคม 2569"
export function thLongDate(d: Date | string): string {
  const p = bkkParts(d);
  return `วัน${TH_DAYS[p.dow]}ที่ ${p.d} ${TH_MONTHS[p.m]} ${p.y + 543}`;
}
export function thTime(d: Date | string): string {
  const p = bkkParts(d);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}
// "พฤ. 2 ต.ค. 69 · 23:59 น." (ตัดเวลาทิ้งถ้าเป็น 00:00 แบบไม่ได้ระบุเวลา)
export function thDateTime(d: Date | string, withTime = true): string {
  const p = bkkParts(d);
  const t = withTime && !(p.hh === 0 && p.mm === 0) ? ` · ${pad(p.hh)}:${pad(p.mm)} น.` : "";
  return thShortDate(d) + t;
}

// จำนวน "วันปฏิทิน" ระหว่างวันนี้กับวันนั้น (เวลาไทย): 0 = วันนี้, 1 = พรุ่งนี้
export function dayDiff(target: Date | string, now: Date | number = Date.now()): number {
  const a = bkkDayKey(now), b = bkkDayKey(target);
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86_400_000);
}

// "วันนี้ 23:59" / "พรุ่งนี้" / "อีก 3 วัน" / "เลยมา 2 วัน"
export function relativeTh(target: Date | string, now: Date | number = Date.now()): string {
  const t = new Date(target).getTime();
  const n = typeof now === "number" ? now : now.getTime();
  const diffMs = t - n;
  const days = dayDiff(target, n);
  if (diffMs < 0) {
    if (days === 0) return "หมดเวลาแล้ววันนี้";
    return `เลยมา ${Math.abs(days)} วัน`;
  }
  if (diffMs < 3600_000) return `อีก ${Math.max(1, Math.round(diffMs / 60_000))} นาที`;
  if (days === 0) return `วันนี้ ${thTime(target)} น.`;
  if (days === 1) return `พรุ่งนี้ ${thTime(target)} น.`;
  if (days < 7) return `อีก ${days} วัน`;
  if (days < 30) return `อีก ${days} วัน`;
  return `อีก ${Math.round(days / 30)} เดือน`;
}

// countdown แยกหน่วย (สำหรับการ์ดนับถอยหลังสอบ)
export function countdownParts(target: Date | string, now = Date.now()) {
  let ms = Math.max(0, new Date(target).getTime() - now);
  const d = Math.floor(ms / 86_400_000); ms -= d * 86_400_000;
  const h = Math.floor(ms / 3_600_000); ms -= h * 3_600_000;
  const m = Math.floor(ms / 60_000); ms -= m * 60_000;
  const s = Math.floor(ms / 1000);
  return { d, h, m, s };
}

// วันที่ไทยปัจจุบันแบบเต็มสำหรับ prompt AI
export function nowContextTh(now = new Date()): string {
  return `${thLongDate(now)} เวลา ${thTime(now)} น. (ISO ${new Date(now.getTime()).toISOString()}, เขตเวลา Asia/Bangkok UTC+7)`;
}

// แปลงค่าที่ AI/ผู้ใช้ให้มาเป็น ISO (รองรับ YYYY-MM-DD, YYYY-MM-DDTHH:mm(+07:00), ปี พ.ศ.)
export function normalizeISO(v: string | undefined | null): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (m) {
    let y = +m[1];
    if (y > 2400) y -= 543; // พ.ศ.
    const day = `${y}-${pad(+m[2])}-${pad(+m[3])}`;
    if (m[6]) {
      const d = new Date(`${day}T${pad(+(m[4] ?? 0))}:${m[5] ?? "00"}:00${m[6] === "Z" ? "Z" : m[6].includes(":") ? m[6] : m[6].slice(0, 3) + ":" + m[6].slice(3)}`);
      return isNaN(d.getTime()) ? "" : d.toISOString();
    }
    return bkkDate(day, m[4] ? `${m[4]}:${m[5]}` : "00:00").toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

// "เมื่อกี้" / "5 นาทีที่แล้ว" / "3 ชม.ที่แล้ว" / "เมื่อวาน" / "4 วันที่แล้ว" / วันที่
export function agoTh(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const s = Math.max(0, (now - t) / 1000);
  if (s < 90) return "เมื่อกี้";
  if (s < 3600) return `${Math.round(s / 60)} นาทีที่แล้ว`;
  const days = -dayDiff(iso, now);
  if (days === 0) return `${Math.round(s / 3600)} ชม.ที่แล้ว`;
  if (days === 1) return "เมื่อวาน";
  if (days < 7) return `${days} วันที่แล้ว`;
  return thShortDate(iso);
}
