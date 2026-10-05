// BC storage layer — สร้างแท็บ + อ่าน/เขียน typed บน lib/google-sheets.ts
//
// หลักการอ่าน (กัน rate-limit ของ Google Sheets):
//   snapshot()  = อ่าน "ทุกแท็บ BC" ใน batchGet เดียว แล้ว cache แชร์ข้าม instance (tag "bc")
//                 -> ทุกหน้า/ทุก API อ่านจาก snapshot นี้ ไม่ยิงชีตเอง
//   fresh(keys) = อ่านสดไม่ผ่าน cache (ใช้ก่อนเขียน เพื่อได้เลขแถว/ค่าล่าสุดจริง)
// เขียนทุกครั้ง -> bust("bc") ให้ทุกคนเห็นข้อมูลใหม่ในคำขอถัดไป
import {
  ensureTabs, readTables, appendRows, updateRange, SheetRow, colLetter,
} from "@/lib/google-sheets";
import { TABS, HEADERS, TabKey } from "@/lib/bc/types";
import { cached, bust } from "@/lib/cache";

export { colLetter };

// เปลี่ยนเลขนี้เมื่อแก้ HEADERS -> ทุก instance จะ ensure header ใหม่อีกรอบ
const SCHEMA_VERSION = "v3.4";

const MANAGED = (Object.keys(TABS) as TabKey[]).filter((k) => HEADERS[k].length > 0);

let _ensured = false;
// สร้างแท็บ BC ทั้งหมดถ้ายังไม่มี (idempotent) — ครั้งเดียวต่อ schema version (แชร์ข้าม instance)
export async function ensureBcTabs(): Promise<void> {
  if (_ensured) return;
  await cached(`schema:${SCHEMA_VERSION}`, ["schema"], 86_400, async () => {
    await ensureTabs([
      ...MANAGED.map((k) => ({ title: TABS[k], headers: HEADERS[k] })),
    ]);
    return true;
  });
  _ensured = true;
}

export type Snapshot = Record<TabKey, SheetRow[]> & { at: number };

async function readAll(keys: TabKey[]): Promise<Record<string, SheetRow[]>> {
  await ensureBcTabs();
  const titles = keys.map((k) => TABS[k]);
  const byTitle = await readTables(titles);
  const out: Record<string, SheetRow[]> = {};
  keys.forEach((k) => { out[k] = byTitle[TABS[k]] ?? []; });
  return out;
}

// แท็บที่โตเร็ว/ไม่ต้องใช้ใน hot path -> ไม่อยู่ใน snapshot
const NOT_IN_SNAPSHOT: TabKey[] = ["chatlog", "sendLog", "usage", "slips", "media"];
const ALL_KEYS = (Object.keys(TABS) as TabKey[]).filter((k) => !NOT_IN_SNAPSHOT.includes(k));

// อ่านทุกแท็บ BC (cache 20 วิ แชร์ข้าม instance)
export async function snapshot(): Promise<Snapshot> {
  return cached("bc:snapshot", ["bc"], 20, async () => {
    const all = await readAll(ALL_KEYS);
    return { ...(all as Record<TabKey, SheetRow[]>), at: Date.now() };
  });
}

// อ่านสด (ไม่ผ่าน cache) — ใช้ก่อน mutation
export async function fresh<K extends TabKey>(...keys: K[]): Promise<Record<K, SheetRow[]>> {
  return (await readAll(keys)) as Record<K, SheetRow[]>;
}

export async function readTab<T = SheetRow>(tab: string): Promise<T[]> {
  const key = (Object.keys(TABS) as TabKey[]).find((k) => TABS[k] === tab);
  if (!key) throw new Error(`unknown BC tab ${tab}`);
  return (await snapshot())[key] as unknown as T[];
}

export async function readKey<T = SheetRow>(key: TabKey): Promise<T[]> {
  return (await snapshot())[key] as unknown as T[];
}
export async function readKeyFresh<T = SheetRow>(key: TabKey): Promise<T[]> {
  return (await fresh(key))[key] as unknown as T[];
}

// append 1+ แถวจาก object (เรียงตาม header ที่กำหนด)
export async function appendRecord(
  tabKey: TabKey,
  record: Record<string, string | number>
): Promise<void> {
  await appendRecords(tabKey, [record]);
}
export async function appendRecords(
  tabKey: TabKey,
  records: Record<string, string | number>[]
): Promise<void> {
  if (!records.length) return;
  await ensureBcTabs();
  const rows = records.map((record) => HEADERS[tabKey].map((h) => record[h] ?? ""));
  await appendRows(`'${TABS[tabKey]}'!A1`, rows);
  bust("bc");
}

// เขียนทับทั้งแถว (จากเลขแถวจริง) ตาม header ที่กำหนด
export async function updateRecord(
  tabKey: TabKey,
  rowNumber: number,
  record: Record<string, string | number>
): Promise<void> {
  const headers = HEADERS[tabKey];
  const lastCol = colLetter(headers.length);
  const row = headers.map((h) => record[h] ?? "");
  await updateRange(`'${TABS[tabKey]}'!A${rowNumber}:${lastCol}${rowNumber}`, [row]);
  bust("bc");
}

// อัปเดตเฉพาะบางคอลัมน์ในแถว (merge กับค่าเดิมแล้วเขียนกลับ)
export async function patchRecord(
  tabKey: TabKey,
  rowNumber: number,
  existing: Record<string, string | number>,
  patch: Record<string, string | number>
): Promise<void> {
  await updateRecord(tabKey, rowNumber, { ...existing, ...patch });
}

// อ่านสดแล้ว patch แถวที่ field = value (ปลอดภัยกว่า patchRecord เมื่อ snapshot อาจเก่า)
export async function patchWhere(
  tabKey: TabKey,
  field: string,
  value: string,
  patch: Record<string, string | number>
): Promise<boolean> {
  const rows = await readKeyFresh(tabKey);
  const hit = rows.find((r) => String(r[field] ?? "") === value);
  if (!hit) return false;
  await patchRecord(tabKey, hit.__row, hit as never, patch);
  return true;
}

// upsert: หาแถวตาม predicate (อ่านสด) -> patch หรือ append
export async function upsertWhere(
  tabKey: TabKey,
  pred: (r: SheetRow) => boolean,
  record: Record<string, string | number>
): Promise<"updated" | "created"> {
  const rows = await readKeyFresh(tabKey);
  const hit = rows.find(pred);
  if (hit) {
    await patchRecord(tabKey, hit.__row, hit as never, record);
    return "updated";
  }
  await appendRecord(tabKey, record);
  return "created";
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

export const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
