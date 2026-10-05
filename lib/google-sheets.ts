// Google Sheets API client (service account) — อ่าน/เขียนชีตแบบ private
// ใช้แทน public CSV เดิม รองรับหลายแท็บ + batchGet + cache แยกราย source
//
// สำคัญ: ชื่อแท็บภาษาไทยสะกดไม่ตรงกันได้ (ดัชนี/ดรรชนี) และ xlsx ตัดที่ 31 ตัวอักษร
// เราจึง "resolve" ชื่อแท็บจริงจาก metadata ของสเปรดชีต แล้วค่อยประกอบ A1 range
// -> ไม่ต้อง hardcode ชื่อไทยให้ผิดพลาด
//
// ทุก call ผ่าน withRetry(): Sheets จำกัด ~60 read/นาที ต่อ service account
// ถ้าโดน 429/5xx จะรอแบบ exponential backoff แล้วลองใหม่ (แทนที่จะพังทั้งหน้า)

import { google, sheets_v4 } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

let _sheets: sheets_v4.Sheets | null = null;
function client(): sheets_v4.Sheets {
  if (_sheets) return _sheets;
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // private key เก็บใน env แบบ escape \n -> แปลงกลับเป็น newline จริง
      private_key: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    },
    // spreadsheets = อ่าน+เขียน (ต้องใช้เขียนตอน log ข้อความ/บันทึกความรู้)
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  _sheets = google.sheets({ version: "v4", auth });
  return _sheets;
}

// ── retry + backoff (429 rate limit / 5xx / network) ─────────────────────────
function isRetryable(err: unknown): boolean {
  const e = err as { code?: number | string; status?: number; response?: { status?: number }; message?: string };
  const status = Number(e?.response?.status ?? e?.status ?? e?.code ?? 0);
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
  const msg = String(e?.message ?? err);
  return /RESOURCE_EXHAUSTED|rateLimit|Quota exceeded|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(msg);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || i === attempts - 1) break;
      // 0.6s, 1.2s, 2.4s, 4.8s, 9.6s (+ jitter) — รวมไม่เกิน ~20 วิ
      await sleep(600 * 2 ** i + Math.random() * 400);
    }
  }
  throw lastErr;
}

// ── metadata: map "ชื่อแท็บจริง" (cache 10 นาที) ─────────────────────────────
let _titleCache: { titles: string[]; ids: Map<string, number>; at: number } | null = null;

async function loadMeta(): Promise<{ titles: string[]; ids: Map<string, number> }> {
  if (_titleCache && Date.now() - _titleCache.at < 600_000) return _titleCache;
  const res = await withRetry(() =>
    client().spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties(title,sheetId)" })
  );
  const ids = new Map<string, number>();
  const titles: string[] = [];
  for (const s of res.data.sheets ?? []) {
    const t = s.properties?.title ?? "";
    if (!t) continue;
    titles.push(t);
    ids.set(t, s.properties?.sheetId ?? 0);
  }
  _titleCache = { titles, ids, at: Date.now() };
  return _titleCache;
}

export async function getSheetTitles(): Promise<string[]> {
  return (await loadMeta()).titles;
}

// หาแท็บจริงตัวแรกที่ผ่านเงื่อนไข match (เช่น includes("ประวัติย่อ"))
export async function resolveTitle(
  match: (title: string) => boolean
): Promise<string | null> {
  const titles = await getSheetTitles();
  return titles.find(match) ?? null;
}

// ── อ่านค่าหลายช่วงพร้อมกัน (batchGet) ──────────────────────────────────────
export async function batchGet(ranges: string[]): Promise<string[][][]> {
  if (ranges.length === 0) return [];
  const res = await withRetry(() =>
    client().spreadsheets.values.batchGet({
      spreadsheetId: SHEET_ID,
      ranges,
      valueRenderOption: "FORMATTED_VALUE", // ได้ค่าตามที่แสดง (วันที่/เลขเป็น string)
    })
  );
  return (res.data.valueRanges ?? []).map(
    (vr) => (vr.values as string[][] | undefined) ?? []
  );
}

export async function getRange(range: string): Promise<string[][]> {
  const [rows] = await batchGet([range]);
  return rows ?? [];
}

// ── เขียน: append แถวต่อท้ายแท็บ (ใช้ log ข้อความ + บันทึกความรู้) ───────────
export async function appendRows(
  a1Sheet: string, // เช่น "'07_ข้อความทั้งหมด'!A1"
  values: (string | number)[][]
): Promise<void> {
  if (values.length === 0) return;
  await withRetry(() =>
    client().spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: a1Sheet,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    })
  );
}

// อัปเดตช่วงหนึ่ง (ใช้ mark สถานะ processed ของแถว log)
export async function updateRange(
  range: string,
  values: (string | number)[][]
): Promise<void> {
  await withRetry(() =>
    client().spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range,
      valueInputOption: "RAW",
      requestBody: { values },
    })
  );
}

// อัปเดตหลายช่วงใน request เดียว (ประหยัดโควตาเขียน)
export async function batchUpdateRanges(
  data: { range: string; values: (string | number)[][] }[]
): Promise<void> {
  if (data.length === 0) return;
  await withRetry(() =>
    client().spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: "RAW", data },
    })
  );
}

// ล้างค่าในช่วง (ใช้ตอนเขียนทับทั้งแท็บ เช่น คลังแชตที่นำเข้าใหม่)
export async function clearRange(range: string): Promise<void> {
  await withRetry(() => client().spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range }));
}

export function colLetter(n: number): string {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// ── สร้างแท็บใหม่ถ้ายังไม่มี + ใส่ header (ใช้โดย control center / BC_ tabs) ──
export async function ensureTab(
  title: string,
  headers: string[]
): Promise<void> {
  await ensureTabs([{ title, headers }]);
}

// ensure หลายแท็บด้วย request น้อยที่สุด:
//   1 metadata + 1 batchGet ของ header ทุกแท็บ + (ถ้าต้อง) 1 addSheet + 1 batchUpdate
export async function ensureTabs(specs: { title: string; headers: string[] }[]): Promise<void> {
  if (specs.length === 0) return;
  const meta = await loadMeta();
  const missing = specs.filter((s) => !meta.titles.includes(s.title));
  if (missing.length) {
    await withRetry(() =>
      client().spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests: missing.map((s) => ({ addSheet: { properties: { title: s.title } } })) },
      })
    ).catch((err) => {
      // อีก instance อาจสร้างไปพร้อมกัน — ถ้า "already exists" ถือว่าโอเค
      if (!/already exists/i.test(String((err as Error)?.message ?? err))) throw err;
    });
    _titleCache = null; // invalidate — จะได้เห็นแท็บใหม่รอบหน้า
  }
  // header ปัจจุบันของทุกแท็บใน batchGet เดียว
  const heads = await batchGet(specs.map((s) => `'${s.title}'!A1:${colLetter(Math.max(s.headers.length, 1))}1`));
  const writes: { range: string; values: string[][] }[] = [];
  specs.forEach((s, i) => {
    const cur = (heads[i]?.[0] ?? []).map((c) => String(c ?? "").trim());
    // มีแท็บแล้ว — ใส่/อัปเดต header ให้ตรงกับที่กำหนด (self-migrate เมื่อเพิ่มคอลัมน์ใหม่)
    if (s.headers.some((h, j) => cur[j] !== h)) {
      writes.push({ range: `'${s.title}'!A1:${colLetter(s.headers.length)}1`, values: [s.headers] });
    }
  });
  await batchUpdateRanges(writes);
}

// หา numeric sheetId (gid) ของแท็บจากชื่อ
async function sheetIdByTitle(title: string): Promise<number | null> {
  let meta = await loadMeta();
  if (!meta.ids.has(title)) { _titleCache = null; meta = await loadMeta(); }
  return meta.ids.get(title) ?? null;
}

// ลบ 1 แถวจริงออกจากแท็บ (rowNumber = เลขแถว 1-indexed ตามที่ readTable คืนใน __row)
export async function deleteRow(title: string, rowNumber: number): Promise<void> {
  const sheetId = await sheetIdByTitle(title);
  if (sheetId == null || rowNumber < 2) return; // ห้ามลบ header
  await withRetry(() =>
    client().spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber },
          },
        }],
      },
    })
  );
}

// อ่านทั้งแท็บ (แถวแรก = header) คืน records เป็น object[] + เลขแถวจริง
// ลบหลายแถวติดกัน (startRow..endRow รวมปลาย, 1-indexed) ใน request เดียว — ห้ามแตะ header
export async function deleteRows(title: string, startRow: number, endRow: number): Promise<void> {
  const sheetId = await sheetIdByTitle(title);
  if (sheetId == null || startRow < 2 || endRow < startRow) return;
  await withRetry(() =>
    client().spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: startRow - 1, endIndex: endRow } } }] },
    })
  );
}

export interface SheetRow {
  __row: number; // เลขแถวจริงในชีต (1-indexed)
  [key: string]: string | number;
}

export function gridToRows(grid: string[][]): SheetRow[] {
  if (grid.length < 1) return [];
  const header = (grid[0] ?? []).map((h) => String(h ?? "").trim());
  const out: SheetRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r] ?? [];
    if (cells.every((c) => !String(c ?? "").trim())) continue;
    const row: SheetRow = { __row: r + 1 };
    header.forEach((h, i) => { if (h) row[h] = String(cells[i] ?? ""); });
    out.push(row);
  }
  return out;
}

export async function readTable(title: string, lastCol = "AZ"): Promise<SheetRow[]> {
  return gridToRows(await getRange(`'${title}'!A1:${lastCol}`));
}

// อ่านหลายแท็บใน request เดียว (ใช้โดย snapshot ของ control center / แอปสมาชิก)
export async function readTables(titles: string[], lastCol = "AZ"): Promise<Record<string, SheetRow[]>> {
  const grids = await batchGet(titles.map((t) => `'${t}'!A1:${lastCol}`));
  const out: Record<string, SheetRow[]> = {};
  titles.forEach((t, i) => { out[t] = gridToRows(grids[i] ?? []); });
  return out;
}

// ── อ่านสเปรดชีตอื่น (response sheet ของฟอร์มที่มี spreadsheetId ต่างจากตัวหลัก) ──
export async function getForeignTitles(spreadsheetId: string): Promise<string[]> {
  const res = await withRetry(() =>
    client().spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" })
  );
  return res.data.sheets?.map((s) => s.properties?.title ?? "").filter(Boolean) ?? [];
}

export async function readForeignGrid(spreadsheetId: string, range: string): Promise<string[][]> {
  const res = await withRetry(() =>
    client().spreadsheets.values.get({ spreadsheetId, range, valueRenderOption: "FORMATTED_VALUE" })
  );
  return (res.data.values as string[][] | undefined) ?? [];
}

export async function readForeignTable(
  spreadsheetId: string,
  tab: string,
  lastCol = "AZ"
): Promise<SheetRow[]> {
  return gridToRows(await readForeignGrid(spreadsheetId, `'${tab}'!A1:${lastCol}`));
}

// ดึง spreadsheetId จากลิงก์ Google Sheet
export function parseSheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : url.trim().length > 20 && !url.includes("/") ? url.trim() : null;
}

export { SHEET_ID };
