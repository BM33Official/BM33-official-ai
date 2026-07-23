// BC storage layer — สร้างแท็บ + อ่าน/เขียน typed บน lib/google-sheets.ts
import {
  ensureTab, readTable, appendRows, updateRange, SheetRow,
} from "@/lib/google-sheets";
import { TABS, HEADERS } from "@/lib/bc/types";

let _ensured = false;
// สร้างแท็บ BC ทั้งหมดถ้ายังไม่มี (idempotent, cache หลังรันครั้งแรก)
export async function ensureBcTabs(): Promise<void> {
  if (_ensured) return;
  for (const key of Object.keys(TABS) as (keyof typeof TABS)[]) {
    await ensureTab(TABS[key], HEADERS[key]);
  }
  _ensured = true;
}

export async function readTab<T = SheetRow>(tab: string): Promise<T[]> {
  return (await readTable(tab)) as unknown as T[];
}

// append 1 แถวจาก object (เรียงตาม header ที่กำหนด)
export async function appendRecord(
  tabKey: keyof typeof TABS,
  record: Record<string, string | number>
): Promise<void> {
  const row = HEADERS[tabKey].map((h) => record[h] ?? "");
  await appendRows(`'${TABS[tabKey]}'!A1`, [row]);
}

// เขียนทับทั้งแถว (จากเลขแถวจริง) ตาม header ที่กำหนด
export async function updateRecord(
  tabKey: keyof typeof TABS,
  rowNumber: number,
  record: Record<string, string | number>
): Promise<void> {
  const headers = HEADERS[tabKey];
  const lastCol = colLetter(headers.length);
  const row = headers.map((h) => record[h] ?? "");
  await updateRange(`'${TABS[tabKey]}'!A${rowNumber}:${lastCol}${rowNumber}`, [row]);
}

// อัปเดตเฉพาะบางคอลัมน์ในแถว (อ่านค่าเดิม merge แล้วเขียนกลับ)
export async function patchRecord(
  tabKey: keyof typeof TABS,
  rowNumber: number,
  existing: Record<string, string | number>,
  patch: Record<string, string | number>
): Promise<void> {
  await updateRecord(tabKey, rowNumber, { ...existing, ...patch });
}

export function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function nowISO(): string {
  return new Date().toISOString();
}
