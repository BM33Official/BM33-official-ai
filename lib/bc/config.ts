// BC_config — key/value ตั้งค่าระบบที่แก้ได้จาก control center (ไม่ต้องแตะ Vercel env)
import { readKey, upsertWhere, nowISO } from "@/lib/bc/sheets";
import { createHash, randomBytes } from "crypto";

export type ConfigKey =
  | "gemini_model" // โมเดลที่ใช้ตอบ (ว่าง = เลือกอัตโนมัติ)
  | "finance_password_hash"
  | "academic_password_hash"
  | "approver_line_ids" // comma — คนที่พิมพ์ approve ใน LINE ได้
  | "payment_info" // ข้อความวิธีจ่ายเงินรุ่น (แสดงในแอป)
  | "payment_link" // ลิงก์ฟอร์ม/QR สำหรับจ่าย
  | "finance_sheet_link" // (ไม่บังคับ) ลิงก์ชีตของฝ่ายการเงิน
  | "red_zone_size"
  | "reminder_plan" // เช่น "3,1,0" = เตือนก่อน 3 วัน, 1 วัน, วันจริง
  | "portal_notice" // ข้อความประกาศด่วนบนหัวแอป
  | "semester_label"
  | "president_student_id";

export async function getConfig(): Promise<Record<string, string>> {
  const rows = await readKey("config");
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = String(r.key ?? "").trim();
    if (k) out[k] = String(r.value ?? "");
  }
  return out;
}

export async function getConfigValue(key: ConfigKey, fallback = ""): Promise<string> {
  const c = await getConfig();
  return (c[key] ?? "").trim() || fallback;
}

export async function setConfig(key: ConfigKey, value: string, note = ""): Promise<void> {
  await upsertWhere("config", (r) => String(r.key ?? "") === key, {
    key, value, updated_at: nowISO(), note,
  });
}

// รหัสผ่าน role เก็บเป็น hash เท่านั้น (ไม่เก็บ plain text ในชีต)
export function hashPassword(pw: string): string {
  return createHash("sha256").update("bc-role|" + pw).digest("hex");
}
export function randomPassword(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

export async function approverIds(): Promise<string[]> {
  const fromCfg = (await getConfigValue("approver_line_ids"))
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (fromCfg.length) return fromCfg;
  return (process.env.ADMIN_LINE_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export async function redZoneSize(): Promise<number> {
  const n = Number(await getConfigValue("red_zone_size", "6"));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 6;
}

export async function reminderPlan(): Promise<number[]> {
  const raw = await getConfigValue("reminder_plan", "3,1,0");
  const days = raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 0);
  return days.length ? Array.from(new Set(days)).sort((a, b) => b - a) : [3, 1, 0];
}
