// เงินรุ่น (BC_fee_months + BC_payments) — ฝ่ายการเงินใช้ในหน้า "การเงิน" (สิทธิ์เฉพาะแท็บนี้)
// ยอดแต่ละเดือนต่างกันได้ · จ่ายรายปี = ระบบลงให้ทุกเดือนในช่วงนั้นเป็น "yearly"
// สมาชิกแต่ละคนเห็นเฉพาะของตัวเองในแอป (กรองด้วยโค้ดเสมอ)
import { readKey, readKeyFresh, appendRecords, upsertWhere, nowISO, digits } from "@/lib/bc/sheets";
import { batchUpdateRanges, colLetter, readForeignTable, getForeignTitles, parseSheetId } from "@/lib/google-sheets";
import { TABS, HEADERS, FeeMonth, Payment } from "@/lib/bc/types";
import { bust } from "@/lib/cache";
import { bkkDate, bkkDayKey, TH_MONTHS_SHORT } from "@/lib/time";

// "waived" เลิกใช้ในหน้าจอแล้ว (สับสน) แต่ยังอ่านข้อมูลเก่าได้
export const PAID_KINDS = ["monthly", "yearly", "waived", "partial"];
export type FeeState = "paid" | "yearly" | "waived" | "partial" | "unpaid" | "overdue" | "upcoming";

// key ของรายการเรียกเก็บ: YYYY-MM = เงินรุ่นรายเดือน · YYYY-MM-xxxx = เรียกเก็บอื่น ๆ (ค่าเสื้อ ค่ากิจกรรม ฯลฯ)
export const FEE_KEY = /^\d{4}-\d{2}(-[a-z0-9]{2,8})?$/;
export const isMonthlyKey = (k: string) => /^\d{4}-\d{2}$/.test(k);
export function newChargeKey(month: string): string {
  return `${month}-${Math.random().toString(36).slice(2, 6)}`;
}

export function monthLabel(month: string): string {
  if (!isMonthlyKey(month)) return month;
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return `${TH_MONTHS_SHORT[m - 1]} ${String((y + 543) % 100).padStart(2, "0")}`;
}

export async function readFeeMonths(force = false): Promise<FeeMonth[]> {
  const rows = force ? await readKeyFresh<FeeMonth>("feeMonths") : await readKey<FeeMonth>("feeMonths");
  return rows.filter((m) => FEE_KEY.test(m.month)).sort((a, b) => a.month.localeCompare(b.month));
}
export async function readPayments(force = false): Promise<Payment[]> {
  const rows = force ? await readKeyFresh<Payment>("payments") : await readKey<Payment>("payments");
  return rows.map((p) => ({ ...p, student_id: digits(p.student_id) }));
}

// บันทึกรายการเรียกเก็บ · ไม่ส่ง key มา (other=true) = สร้างรายการใหม่ของเดือนนั้น (เช่น ค่าเสื้อรุ่น)
export async function upsertMonth(m: Partial<FeeMonth> & { month: string; other?: boolean }): Promise<string> {
  let key = String(m.month || "").trim();
  if (m.other && isMonthlyKey(key)) key = newChargeKey(key);
  if (!FEE_KEY.test(key)) throw new Error("เดือนต้องเป็นรูปแบบ YYYY-MM");
  if (!isMonthlyKey(key) && !String(m.label ?? "").trim()) throw new Error("ใส่ชื่อรายการด้วย เช่น ค่าเสื้อรุ่น");
  const link = String(m.link ?? "").trim();
  if (link && !/^https?:\/\//i.test(link)) throw new Error("ลิงก์ต้องขึ้นต้นด้วย https://");
  const prev = (await readFeeMonths(true)).find((r) => r.month === key);
  await upsertWhere("feeMonths", (r) => String(r.month) === key, {
    month: key,
    label: m.label || monthLabel(key),
    amount: String(m.amount ?? ""),
    due_date: m.due_date ?? "",
    note: m.note ?? "",
    updated_at: nowISO(),
    link,
    link_label: String(m.link_label ?? "").trim().slice(0, 20),
    created_at: prev?.created_at || nowISO(),
  });
  return key;
}

export async function deleteMonth(month: string): Promise<void> {
  // ไม่ลบแถวจริง (กันเลขแถวเลื่อน) — ทำเป็นเดือนว่างที่ไม่แสดง
  await upsertWhere("feeMonths", (r) => String(r.month) === month, {
    month: `x-${month}`, label: "", amount: "", due_date: "", note: "deleted", updated_at: nowISO(), link: "", link_label: "",
  });
}

function dueOf(m: FeeMonth): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(m.due_date)) return bkkDate(m.due_date, "23:59");
  return null;
}

export interface MonthStatus {
  month: string;
  label: string;
  amount: number;
  due: string; // ISO
  state: FeeState;
  paid_at: string;
  note: string;
  link: string; // ปุ่มชำระ/ฟอร์มของรายการนี้ ("" = ไม่มี)
  link_label: string;
  created_at: string;
}

export function stateFor(m: FeeMonth, p: Payment | undefined, now = Date.now()): FeeState {
  if (p && PAID_KINDS.includes(p.kind)) return (p.kind === "monthly" ? "paid" : p.kind) as FeeState;
  const due = dueOf(m);
  const thisMonth = bkkDayKey(now).slice(0, 7);
  if (due && due.getTime() < now) return "overdue";
  if (m.month.slice(0, 7) > thisMonth) return "upcoming";
  return "unpaid";
}

export async function feeStatusFor(studentId: string, now = Date.now()) {
  const sid = digits(studentId);
  const { feeCarry } = await import("@/lib/bc/academic");
  const [months, payments, carry] = await Promise.all([readFeeMonths(), readPayments(), feeCarry().catch(() => new Map<string, number>())]);
  const mine = new Map(payments.filter((p) => p.student_id === sid).map((p) => [p.month, p]));
  const list: MonthStatus[] = months.map((m) => {
    const p = mine.get(m.month);
    const due = dueOf(m);
    return {
      month: m.month, label: m.label || monthLabel(m.month), amount: Number(m.amount) || 0,
      due: due ? due.toISOString() : "", state: stateFor(m, p, now), paid_at: p?.paid_at ?? "", note: m.note,
      link: m.link ?? "", link_label: m.link_label || "ชำระเงิน", created_at: m.created_at || m.updated_at || "",
    };
  });
  const owed = list.filter((x) => x.state === "unpaid" || x.state === "overdue");
  const yearly = list.length > 0 && list.filter((x) => x.state === "yearly").length >= Math.min(6, list.length);
  const next = owed.sort((a, b) => (a.due || a.month).localeCompare(b.due || b.month))[0] ?? null;
  return {
    months: list,
    outstanding: owed.reduce((a, x) => a + x.amount, 0),
    overdue: list.filter((x) => x.state === "overdue").length,
    carried: carry.get(sid) ?? 0, // เดือนที่ค้างยกมาจากระบบเดิม (ฝ่ายการเงินกรอก)
    paidCount: list.filter((x) => ["paid", "yearly", "waived", "partial"].includes(x.state)).length,
    yearly,
    next,
  };
}

// ── ภาพรวมสำหรับฝ่ายการเงิน ──────────────────────────────────────────────────
export async function financeMatrix(now = Date.now()) {
  const [months, payments] = await Promise.all([readFeeMonths(), readPayments()]);
  const by = new Map(payments.map((p) => [`${p.student_id}|${p.month}`, p]));
  return {
    months,
    cell(studentId: string, month: string): FeeState {
      const m = months.find((x) => x.month === month);
      if (!m) return "upcoming";
      return stateFor(m, by.get(`${digits(studentId)}|${month}`), now);
    },
    payment(studentId: string, month: string) {
      return by.get(`${digits(studentId)}|${month}`);
    },
  };
}

export interface PayChange { student_id: string; month: string; kind: "" | "monthly" | "yearly" | "waived" | "partial"; amount?: string; note?: string }

// บันทึกหลายช่องพร้อมกัน (1 อ่านสด + 1 batchUpdate + 1 append)
export async function applyPayments(changes: PayChange[], by: string): Promise<number> {
  if (!changes.length) return 0;
  const current = await readPayments(true);
  const idx = new Map(current.map((p) => [`${p.student_id}|${p.month}`, p]));
  const months = new Map((await readFeeMonths(true)).map((m) => [m.month, m]));
  const headers = HEADERS.payments;
  const lastCol = colLetter(headers.length);
  const updates: { range: string; values: string[][] }[] = [];
  const creates: Record<string, string>[] = [];
  for (const c of changes) {
    const sid = digits(c.student_id);
    if (!sid || !FEE_KEY.test(c.month)) continue;
    const rec: Record<string, string> = {
      student_id: sid,
      month: c.month,
      amount: c.kind ? String(c.amount ?? months.get(c.month)?.amount ?? "") : "",
      kind: c.kind,
      paid_at: c.kind ? nowISO() : "",
      recorded_by: by,
      note: c.note ?? "",
      updated_at: nowISO(),
    };
    const cur = idx.get(`${sid}|${c.month}`);
    if (cur?.__row) {
      if (cur.kind === c.kind) continue;
      if (c.kind && cur.paid_at && PAID_KINDS.includes(cur.kind)) rec.paid_at = cur.paid_at;
      updates.push({ range: `'${TABS.payments}'!A${cur.__row}:${lastCol}${cur.__row}`, values: [headers.map((h) => rec[h] ?? "")] });
    } else if (c.kind) {
      creates.push(rec);
    }
  }
  await batchUpdateRanges(updates);
  if (creates.length) await appendRecords("payments", creates);
  bust("bc");
  return updates.length + creates.length;
}

// จ่ายรายปี: ลงทุกเดือนที่ระบุ (ค่าเริ่มต้น = ทุกเดือนที่มีในระบบ)
export async function markYearly(studentId: string, months: string[] | null, by: string, note = "จ่ายรายปี"): Promise<number> {
  const all = months ?? (await readFeeMonths(true)).filter((m) => isMonthlyKey(m.month)).map((m) => m.month); // รายปี = เฉพาะเงินรุ่นรายเดือน (ไม่รวมค่าเสื้อ ฯลฯ)
  return applyPayments(all.map((month) => ({ student_id: studentId, month, kind: "yearly", note })), by);
}

// ── นำเข้าจากชีตของฝ่ายการเงิน (ไม่บังคับ) ──────────────────────────────────
export async function inspectFinanceSheet(link: string) {
  const id = parseSheetId(link);
  if (!id) return { error: "ลิงก์ไม่ถูกต้อง" };
  try {
    const tabs = await getForeignTitles(id);
    const previews: Record<string, string[]> = {};
    for (const t of tabs.slice(0, 8)) {
      const rows = await readForeignTable(id, t);
      previews[t] = rows.length ? Object.keys(rows[0]).filter((k) => k !== "__row") : [];
    }
    return { sheetId: id, tabs, headers: previews };
  } catch {
    return { error: "อ่านชีตไม่ได้ — ต้องแชร์ชีตให้ service account (อีเมลในหน้าตั้งค่า) เป็น Viewer ก่อน" };
  }
}

const UNPAID_WORDS = /^(|0|-|–|x|✗|✘|no|false|ไม่|ยัง|ค้าง|ยังไม่จ่าย|unpaid)$/i;

// mapping: { idColumn, months: { "2026-10": "ต.ค." } } — ช่องที่มีค่า (ไม่ใช่ 0/ค้าง) = จ่ายแล้ว
export async function importFinanceSheet(opts: {
  sheetId: string; tab: string; idColumn: string; months: Record<string, string>; apply: boolean; by: string;
}) {
  const rows = await readForeignTable(opts.sheetId, opts.tab);
  const changes: PayChange[] = [];
  for (const r of rows) {
    const sid = digits(String(r[opts.idColumn] ?? ""));
    if (sid.length < 6) continue;
    for (const [month, col] of Object.entries(opts.months)) {
      if (!col) continue;
      const v = String(r[col] ?? "").trim();
      const paid = !UNPAID_WORDS.test(v);
      if (paid) changes.push({ student_id: sid, month, kind: /ปี|year/i.test(v) ? "yearly" : "monthly", note: `นำเข้า: ${v.slice(0, 30)}` });
    }
  }
  if (!opts.apply) return { preview: changes.length, sample: changes.slice(0, 12) };
  const n = await applyPayments(changes, opts.by);
  return { applied: n };
}


// ── เตือนคนที่ยังไม่จ่าย (ข้อความเฉพาะคน ใส่ยอดของแต่ละคน) -> กล่องรอตรวจ -> อนุมัติแล้วค่อยส่ง ──
export async function queueUnpaidReminder(opts: { month?: string; note?: string; by: string }): Promise<{ code: string; count: number; unreg: number }> {
  const { readRoster } = await import("@/lib/bc/roster");
  const { verifiedMembers } = await import("@/lib/bc/members");
  const { createOutbox, reminderMessages } = await import("@/lib/bc/outbox");
  const { getConfig } = await import("@/lib/bc/config");
  const [roster, members, cfg] = await Promise.all([readRoster(), verifiedMembers(), getConfig()]);
  const reg = new Set(members.map((m) => digits(m.matched_student_id)));
  const per: Record<string, import("@line/bot-sdk").messagingApi.Message[]> = {};
  let unreg = 0;
  const links = [
    ...(cfg.payment_link ? [{ label: "ลิงก์จ่าย/แจ้งโอน", url: cfg.payment_link }] : []),
    { label: "ส่งสลิปในแอป", url: "https://liff.line.me/2011755768-aSlCqo7l?tab=me" },
  ];
  for (const r of roster) {
    const f = await feeStatusFor(r.student_id);
    const owed = f.months.filter((m) => (m.state === "unpaid" || m.state === "overdue") && (!opts.month || m.month === opts.month));
    const carried = opts.month ? 0 : f.carried;
    if (!owed.length && !carried) continue;
    if (!reg.has(r.student_id)) { unreg++; continue; }
    const text = `${r.nickname || "เพื่อน"} จ๋า 💸 แอบมาเตือนเงินรุ่นน้า\n\n${carried ? `• ค้างยกมาจากก่อนหน้า ${carried} เดือน\n` : ""}${owed.map((m) => `• ${m.label} ${m.amount} บาท${m.state === "overdue" ? " (เลยกำหนดแล้ว)" : m.due ? ` (ภายใน ${m.due.slice(0, 10)})` : ""}`).join("\n")}\nรวม ${owed.reduce((a, m) => a + m.amount, 0).toLocaleString()} บาท${cfg.payment_info ? `\n\nวิธีจ่าย: ${cfg.payment_info}` : ""}${opts.note ? `\n\n${opts.note}` : ""}\n\nจ่ายแล้วส่งสลิปในแอปหรือส่งรูปสลิปในแชตนี้ได้เลย ถ้าจ่ายไปแล้วทักฝ่ายการเงินได้เลยนะ 🙏`;
    // ปุ่มชำระของแต่ละรายการ (ฝ่ายการเงินใส่ลิงก์ไว้) ขึ้นก่อน แล้วค่อยลิงก์ทั่วไป
    const own = owed.filter((m) => m.link).map((m) => ({ label: (owed.length > 1 ? `${m.link_label} ${m.label}` : m.link_label).slice(0, 20), url: m.link }));
    per[r.student_id] = reminderMessages({ text, title: "เงินรุ่น", links: [...own, ...links].slice(0, 4), color: "#059669" });
  }
  const ids = Object.keys(per);
  if (!ids.length) return { code: "", count: 0, unreg };
  const sample = (per[ids[0]][0] as { text?: string }).text ?? "";
  const item = await createOutbox({
    kind: "fee", title: `เตือนเงินรุ่น${opts.month ? ` ${monthLabel(opts.month)}` : ""} (${ids.length} คน)`,
    audience: `ids:${ids.join(",")}`, messages: [], perRecipient: per,
    preview: `ข้อความเฉพาะคน — ตัวอย่าง:\n\n${sample}`, notify: false,
  });
  // ฝ่ายการเงินมีสิทธิ์ส่งเอง: กดเตือน = ส่งทันที (แถวใน BC_outbox เป็นประวัติ)
  const { approveAndSend } = await import("@/lib/bc/outbox");
  const sent = await approveAndSend(item.id, opts.by);
  if (!sent.ok) throw new Error(sent.error || "ส่งไม่สำเร็จ");
  return { code: item.code, count: sent.count, unreg };
}
