// ตรวจสลิปโอนเงินรุ่น — สมาชิกส่งสลิป (แอป หรือส่งรูปในแชตบอท) -> AI อ่านยอด/วันที่/เลขอ้างอิง/ผู้รับ
// -> ระบบเทียบกับยอดที่ค้าง + บัญชีรุ่น + กันสลิปซ้ำ -> ฝ่ายการเงินกดยืนยันครั้งเดียว (ไม่ตัดสินแทนคน)
import { z } from "zod";
import { generateJSON, Type } from "@/lib/gemini";
import { appendRows, readTable } from "@/lib/google-sheets";
import { TABS, HEADERS, Slip } from "@/lib/bc/types";
import { ensureBcTabs, newId, nowISO, digits, patchRecord } from "@/lib/bc/sheets";
import { feeStatusFor, applyPayments, monthLabel } from "@/lib/bc/fees";
import { getConfig } from "@/lib/bc/config";
import { cached, bust } from "@/lib/cache";
import { normalizeISO, thDateTime } from "@/lib/time";
import { log } from "@/lib/logger";

const SlipZ = z.object({
  is_slip: z.boolean().default(false),
  amount: z.number().default(0),
  datetime: z.string().default(""),
  bank_ref: z.string().default(""),
  sender_name: z.string().default(""),
  receiver_name: z.string().default(""),
  receiver_account: z.string().default(""),
  bank: z.string().default(""),
});
type SlipRead = z.infer<typeof SlipZ>;

const SLIP_SYSTEM = `อ่านรูปสลิปโอนเงินธนาคาร/พร้อมเพย์ของไทย ตอบ JSON:
- is_slip: เป็นสลิปโอนเงินที่สำเร็จจริงไหม (รูปอื่น/มีม/แคปแชต = false)
- amount: ยอดเงิน (ตัวเลข บาท)
- datetime: วันเวลาโอนแบบ ISO เวลาไทย (+07:00) — ปี พ.ศ. ให้ลบ 543
- bank_ref: เลขที่รายการ/รหัสอ้างอิง (คัดลอกตามที่เห็น)
- sender_name, receiver_name: ชื่อผู้โอน/ผู้รับตามที่แสดง · receiver_account: เลขบัญชี/พร้อมเพย์ผู้รับตามที่แสดง (อาจมี x)
- bank: ธนาคาร/แอปที่ออกสลิป
ห้ามเดาค่าที่มองไม่เห็น (ใส่ "" หรือ 0)`;

async function readSlip(imageBase64: string, mimeType: string, who: string): Promise<SlipRead | null> {
  const { data } = await generateJSON(SLIP_SYSTEM, "อ่านสลิปนี้", {
    type: Type.OBJECT,
    properties: {
      is_slip: { type: Type.BOOLEAN }, amount: { type: Type.NUMBER }, datetime: { type: Type.STRING }, bank_ref: { type: Type.STRING },
      sender_name: { type: Type.STRING }, receiver_name: { type: Type.STRING }, receiver_account: { type: Type.STRING }, bank: { type: Type.STRING },
    },
    required: ["is_slip", "amount", "datetime", "bank_ref"],
  }, SlipZ as unknown as z.ZodType<SlipRead>, {
    extraParts: [{ inlineData: { mimeType, data: imageBase64 } }],
    timeoutMs: 20_000, temperature: 0.1, thinking: "MINIMAL", maxOutputTokens: 600, feature: "slip", who,
  });
  return data;
}

// ย่อรูปเก็บในชีต (ช่องละ ≤ 50K ตัวอักษร)
async function thumb(imageBase64: string): Promise<string> {
  try {
    const sharp = (await import("sharp")).default;
    const buf = Buffer.from(imageBase64, "base64");
    for (const [w, q] of [[460, 50], [380, 40], [300, 32]] as const) {
      const out = await sharp(buf).rotate().resize({ width: w, withoutEnlargement: true }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
      const s = `data:image/jpeg;base64,${out.toString("base64")}`;
      if (s.length < 48_000) return s;
    }
  } catch (err) {
    log.warn("slip_thumb_failed", { message: String(err).slice(0, 120) });
  }
  return "";
}

export async function readSlips(): Promise<Slip[]> {
  return cached("bc:slips", ["slips"], 30, async () => {
    await ensureBcTabs();
    return (await readTable(TABS.slips, "O")) as unknown as Slip[];
  });
}

const nameKey = (s: string) => s.replace(/(นาย|นางสาว|นาง|น\.ส\.|mr\.?|ms\.?|miss|mrs\.?)\s*/gi, "").replace(/[\s.]/g, "").toLowerCase();

export interface SubmitResult { id: string; verdict: string; message: string }

export async function submitSlip(opts: { studentId: string; imageBase64: string; mimeType: string; source: "app" | "line"; month?: string }): Promise<SubmitResult | null> {
  const sid = digits(opts.studentId);
  const read = await readSlip(opts.imageBase64, opts.mimeType, sid);
  if (!read?.is_slip) return null;
  const [fees, cfg, slips] = await Promise.all([feeStatusFor(sid), getConfig(), readSlips()]);
  const owed = fees.months.filter((m) => m.state === "unpaid" || m.state === "overdue" || (m.state === "upcoming" && m.amount));
  const notes: string[] = [];
  let verdict: "ok" | "check" | "bad" = "ok";

  // เลือกเดือน: ที่สมาชิกเลือก > เดือนที่ยอดตรง > เดือนค้างที่เก่าสุด
  let month = opts.month && /^\d{4}-\d{2}(-[a-z0-9]{2,8})?$/.test(opts.month) ? opts.month : "";
  const amount = Math.round(read.amount * 100) / 100;
  if (!month) {
    const exact = owed.find((m) => m.amount === amount);
    month = exact?.month ?? owed[0]?.month ?? "";
  }
  const target = fees.months.find((m) => m.month === month);
  if (!target) { verdict = "check"; notes.push("ไม่พบเดือนที่ค้างในระบบ"); }
  else if (target.amount && amount !== target.amount) {
    const sum = owed.reduce((a, m) => a + m.amount, 0);
    if (amount === sum && owed.length > 1) notes.push(`ยอดเท่ากับค้างรวม ${owed.length} เดือน`);
    else { verdict = "check"; notes.push(`ยอด ${amount} ≠ ${target.amount} บาท`); }
  }
  // ผู้รับต้องเป็นบัญชีรุ่น (ถ้าตั้งไว้)
  const accName = cfg.payment_account_name?.trim();
  if (accName) {
    const a = nameKey(accName), r = nameKey(read.receiver_name);
    if (!r || !(r.includes(a.slice(0, 6)) || a.includes(r.slice(0, 6)))) { verdict = "check"; notes.push(`ผู้รับ "${read.receiver_name || "?"}" ไม่ตรงบัญชีรุ่น`); }
  }
  const accNo = digits(cfg.payment_account_no ?? "");
  if (accNo && read.receiver_account && !digits(read.receiver_account).endsWith(accNo.slice(-4)) && !read.receiver_account.includes(accNo.slice(-4))) {
    verdict = "check"; notes.push("เลขบัญชีผู้รับไม่ตรง");
  }
  // กันสลิปซ้ำ
  const ref = read.bank_ref.replace(/\s/g, "");
  if (ref && slips.some((s) => s.bank_ref === ref && s.status !== "rejected")) { verdict = "bad"; notes.push("เลขอ้างอิงนี้เคยส่งแล้ว (สลิปซ้ำ)"); }
  // วันที่สมเหตุสมผล
  const paidISO = normalizeISO(read.datetime);
  const t = paidISO ? new Date(paidISO).getTime() : 0;
  if (!t) notes.push("อ่านวันที่ไม่ได้");
  else if (t > Date.now() + 3600_000) { verdict = "bad"; notes.push("วันที่ในสลิปอยู่ในอนาคต"); }
  else if (Date.now() - t > 60 * 86_400_000) { verdict = verdict === "bad" ? "bad" : "check"; notes.push("สลิปเก่ากว่า 60 วัน"); }

  const id = newId("SL");
  const rec: Record<string, string> = {
    id, student_id: sid, month, amount: String(amount), paid_at: paidISO, bank_ref: ref, receiver: read.receiver_name,
    ai_verdict: verdict, ai_note: notes.join(" · ") || "ข้อมูลตรงทุกอย่าง", status: "pending", image: await thumb(opts.imageBase64),
    created_at: nowISO(), decided_at: "", decided_by: "", source: opts.source,
  };
  await ensureBcTabs();
  await appendRows(`'${TABS.slips}'!A1`, [HEADERS.slips.map((h) => rec[h] ?? "")]);
  bust("slips");

  const ml = month ? monthLabel(month) : "เงินรุ่น";
  // ตรวจผ่านทุกข้อ + เปิดโหมดอัตโนมัติ → ลงจ่ายเลย (ฝ่ายการเงินยังเห็นในประวัติ และยกเลิกได้)
  if (verdict === "ok" && month && cfg.slip_auto_approve === "1" && accName) {
    await decideSlip(id, true, "ai-auto", month);
    return { id, verdict, message: `ได้รับสลิป ${ml} แล้ว ✅\n\n💸 ${amount.toLocaleString()} บาท${paidISO ? ` · ${thDateTime(paidISO)}` : ""}\n\nระบบตรวจแล้วตรงทุกอย่าง ลงว่า "จ่ายแล้ว" ให้เรียบร้อย ขอบคุณน้า 💚` };
  }
  const message = verdict === "bad"
    ? `ได้รับสลิปแล้ว แต่ระบบเจอจุดที่ต้องให้ฝ่ายการเงินดู: ${notes.join(", ")} 🙏\n\nฝ่ายการเงินจะตรวจอีกครั้งนะ`
    : `ได้รับสลิป ${ml} แล้ว ✅\n\n💸 ${amount.toLocaleString()} บาท${paidISO ? ` · ${thDateTime(paidISO)}` : ""}\n\nรอฝ่ายการเงินยืนยัน แล้วสถานะในแอปจะเปลี่ยนเป็น "จ่ายแล้ว" เอง${verdict === "check" ? `\n(หมายเหตุ: ${notes.join(", ")})` : ""}`;
  return { id, verdict, message };
}

// ฝ่ายการเงินยืนยัน/ปฏิเสธ (ยืนยัน = ลงจ่ายในตารางเงินรุ่นให้อัตโนมัติ)
export async function decideSlip(id: string, approve: boolean, by: string, month?: string): Promise<boolean> {
  await ensureBcTabs();
  const rows = (await readTable(TABS.slips, "O")) as unknown as Slip[];
  const s = rows.find((r) => r.id === id);
  if (!s?.__row) return false;
  const m = month || s.month;
  if (approve && m) await applyPayments([{ student_id: s.student_id, month: m, kind: "monthly", amount: s.amount, note: `สลิป ${s.bank_ref || s.id}` }], by);
  await patchRecord("slips", s.__row, s as never, { status: approve ? "approved" : "rejected", decided_at: nowISO(), decided_by: by, month: m });
  bust("slips");
  return true;
}
