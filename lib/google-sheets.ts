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

export { SHEET_ID };
