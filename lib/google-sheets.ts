// Google Sheets API client (service account) — อ่าน/เขียนชีตแบบ private
// ใช้แทน public CSV เดิม รองรับหลายแท็บ + batchGet + cache แยกราย source
//
// สำคัญ: ชื่อแท็บภาษาไทยสะกดไม่ตรงกันได้ (ดัชนี/ดรรชนี) และ xlsx ตัดที่ 31 ตัวอักษร
// เราจึง "resolve" ชื่อแท็บจริงจาก metadata ของสเปรดชีต แล้วค่อยประกอบ A1 range
// -> ไม่ต้อง hardcode ชื่อไทยให้ผิดพลาด

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

// ── metadata: map "ชื่อแท็บจริง" (cache 10 นาที) ─────────────────────────────
let _titleCache: { titles: string[]; at: number } | null = null;

export async function getSheetTitles(): Promise<string[]> {
  if (_titleCache && Date.now() - _titleCache.at < 600_000) return _titleCache.titles;
  const res = await client().spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: "sheets.properties.title",
  });
  const titles =
    res.data.sheets?.map((s) => s.properties?.title ?? "").filter(Boolean) ?? [];
  _titleCache = { titles, at: Date.now() };
  return titles;
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
  const res = await client().spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges,
    valueRenderOption: "FORMATTED_VALUE", // ได้ค่าตามที่แสดง (วันที่/เลขเป็น string)
  });
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
  await client().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: a1Sheet,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

// อัปเดตช่วงหนึ่ง (ใช้ mark สถานะ processed ของแถว log)
export async function updateRange(
  range: string,
  values: (string | number)[][]
): Promise<void> {
  await client().spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// ── สร้างแท็บใหม่ถ้ายังไม่มี + ใส่ header (ใช้โดย control center / BC_ tabs) ──
export async function ensureTab(
  title: string,
  headers: string[]
): Promise<void> {
  const titles = await getSheetTitles();
  const lastCol = colLetter(headers.length);
  if (!titles.includes(title)) {
    await client().spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
    _titleCache = null; // invalidate — จะได้เห็นแท็บใหม่รอบหน้า
    await appendRows(`'${title}'!A1`, [headers]);
    return;
  }
  // มีแท็บแล้ว — ใส่/อัปเดต header ให้ตรงกับที่กำหนด (self-migrate เมื่อเพิ่มคอลัมน์ใหม่)
  const first = await getRange(`'${title}'!A1:1`);
  const cur = (first[0] ?? []).map((c) => String(c ?? "").trim());
  const needsWrite = headers.some((h, i) => cur[i] !== h);
  if (needsWrite) {
    await updateRange(`'${title}'!A1:${lastCol}1`, [headers]);
  }
}

// หา numeric sheetId (gid) ของแท็บจากชื่อ
async function sheetIdByTitle(title: string): Promise<number | null> {
  const res = await client().spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: "sheets.properties(title,sheetId)",
  });
  const s = res.data.sheets?.find((x) => x.properties?.title === title);
  return s?.properties?.sheetId ?? null;
}

// ลบ 1 แถวจริงออกจากแท็บ (rowNumber = เลขแถว 1-indexed ตามที่ readTable คืนใน __row)
export async function deleteRow(title: string, rowNumber: number): Promise<void> {
  const sheetId = await sheetIdByTitle(title);
  if (sheetId == null || rowNumber < 2) return; // ห้ามลบ header
  await client().spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber },
        },
      }],
    },
  });
}

// อ่านทั้งแท็บ (แถวแรก = header) คืน records เป็น object[] + เลขแถวจริง
export interface SheetRow {
  __row: number; // เลขแถวจริงในชีต (1-indexed)
  [key: string]: string | number;
}
export async function readTable(title: string, lastCol = "Z"): Promise<SheetRow[]> {
  const grid = await getRange(`'${title}'!A1:${lastCol}`);
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

// ── อ่านสเปรดชีตอื่น (response sheet ของฟอร์มที่มี spreadsheetId ต่างจากตัวหลัก) ──
export async function getForeignTitles(spreadsheetId: string): Promise<string[]> {
  const res = await client().spreadsheets.get({
    spreadsheetId, fields: "sheets.properties.title",
  });
  return res.data.sheets?.map((s) => s.properties?.title ?? "").filter(Boolean) ?? [];
}

export async function readForeignTable(
  spreadsheetId: string,
  tab: string,
  lastCol = "Z"
): Promise<SheetRow[]> {
  const res = await client().spreadsheets.values.get({
    spreadsheetId,
    range: `'${tab}'!A1:${lastCol}`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const grid = (res.data.values as string[][] | undefined) ?? [];
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

// ดึง spreadsheetId จากลิงก์ Google Sheet
export function parseSheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : url.trim().length > 20 && !url.includes("/") ? url.trim() : null;
}

export { SHEET_ID };
