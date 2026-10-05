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
  | "president_student_id"
  | "rich_menu_v2_id"
  | "rich_menu_v3_id"
  | "rich_menu_v4_id"
  | "ai_budget_usd" // งบ AI ต่อเดือน (ดอลลาร์) — ค่าเริ่มต้น 10
  | "ai_price_json" // {"in":0.5,"cached":0.05,"out":3} ดอลลาร์ต่อ 1M token
  | "ai_user_daily_cap" // คำถามต่อคนต่อวัน (ค่าเริ่มต้น 30)
  | "linktree_url"
  | "payment_account_name" // ชื่อบัญชีผู้รับเงินรุ่น (ใช้ตรวจสลิป)
  | "payment_account_no" // เลขบัญชี/พร้อมเพย์ (4 ตัวท้ายพอ)
  | "slip_auto_approve"
  | "usd_thb"
  | "red_zone_enabled" // "0" = ปิด Red Zone ทั้งระบบ (ทุกคน Green Zone) · ว่าง/"1" = เปิด
  | "learn_groups" // กลุ่ม LINE ที่บอทเก็บข้อมูล: "*" = ทุกกลุ่มที่บอทอยู่ · ว่าง = ใช้ env LEARN_GROUP_IDS · หรือ id คั่นด้วย ,
  | "known_groups_json" // กลุ่มที่บอทเคยเห็น [{id,first,last}] (แสดงในตั้งค่า + ปุ่มให้บอทออกจากกลุ่ม)
  | "red_zone_fees" // "0" = ไม่นับเงินรุ่นค้างใน red zone (ค่าเริ่มต้น = นับ)
  | "red_zone_fee_weight" // น้ำหนักต่อ 1 เดือนที่เลยกำหนดแล้วยังไม่จ่าย (ค่าเริ่มต้น 1 = เท่ากับไม่ได้จำข้อสอบ 1 ครั้งล่าสุด)
  | "fee_carry_json" // {"<student_id>": เดือนที่ค้างยกมาจากระบบเดิม} — ฝ่ายการเงินกรอกเองได้ ไม่ต้องเริ่มใหม่
  | "digest_auto_day" // วันล่าสุดที่ระบบเสนอ "เตือนรวม" + LINE หาแอดมินแล้ว (กันซ้ำวันละครั้ง)
  | "fortune_pool_base"; // ยอดเขย่ารวมทั้งรุ่น ณ แจ็กพอตล่าสุด (Jackpot Pool = ยอดรวมตอนนี้ − ค่านี้) // อัตราแลกเปลี่ยนสำหรับแสดงค่า AI เป็นบาท (ค่าเริ่มต้น 33) // "1" = สลิปที่ AI ตรวจแล้วผ่านทุกข้อ ลงว่าจ่ายแล้วทันที (ฝ่ายการเงินย้อนได้)

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

// ตั้งหลายค่าพร้อมกันแบบปลอดภัย: อ่านสด 1 ครั้ง -> แก้แถวเดิมทีละแถว -> คีย์ใหม่ append รวดเดียว
// (เดิมหน้าเว็บยิง setConfig พร้อมกันหลายตัว -> append ชนกันในชีต ค่าบางตัวหาย)
export async function setConfigMany(values: Partial<Record<ConfigKey, string>>, note = ""): Promise<void> {
  const { readKeyFresh, patchRecord, appendRecords } = await import("@/lib/bc/sheets");
  const rows = await readKeyFresh("config");
  const creates: Record<string, string>[] = [];
  for (const [key, value] of Object.entries(values)) {
    const rec = { key, value: String(value ?? ""), updated_at: nowISO(), note };
    const hit = rows.find((r) => String(r.key ?? "") === key);
    if (hit) await patchRecord("config", hit.__row, hit as never, rec);
    else creates.push(rec);
  }
  if (creates.length) await appendRecords("config", creates);
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
