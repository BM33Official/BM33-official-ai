// แปลงลิงก์ Google Docs/Sheets หรือไฟล์ที่อัปโหลด -> ข้อความ (สำหรับให้ระบบ/AI อ่าน)
//   Google Doc  : export txt แบบลิงก์สาธารณะก่อน ถ้าไม่ได้ใช้ Drive API ของ service account (ต้องแชร์ให้อีเมลระบบ)
//   Google Sheet: export csv (แท็บตาม gid) ถ้าไม่ได้ใช้ Sheets API
//   .docx (mammoth) · .xlsx/.csv (xlsx) · .txt  -> ข้อความ   |  PDF/รูป -> คืนเป็น part ให้ Gemini อ่านเอง
import { google } from "googleapis";
import { readForeignGrid, getForeignTitles } from "@/lib/google-sheets";
import type { Part } from "@/lib/gemini";

function drive() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

export interface Loaded { name: string; text?: string; part?: Part; error?: string }

const csvOf = (grid: string[][]) => grid.map((r) => r.map((c) => String(c ?? "").replace(/[\n,]/g, " ")).join(",")).join("\n");

export async function loadLink(url: string): Promise<Loaded> {
  const u = url.trim();
  const doc = u.match(/document\/d\/([\w-]+)/);
  const sheet = u.match(/spreadsheets\/d\/([\w-]+)/);
  const file = u.match(/(?:file\/d\/|open\?id=)([\w-]+)/);
  try {
    if (doc) {
      const r = await fetch(`https://docs.google.com/document/d/${doc[1]}/export?format=txt`, { redirect: "follow", cache: "no-store" });
      if (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html")) return { name: "Google Doc", text: await r.text() };
      const res = await drive().files.export({ fileId: doc[1], mimeType: "text/plain" }, { responseType: "text" });
      return { name: "Google Doc", text: String(res.data ?? "") };
    }
    if (sheet) {
      const gid = u.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
      const r = await fetch(`https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=csv&gid=${gid}`, { redirect: "follow", cache: "no-store" });
      if (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html")) return { name: "Google Sheet", text: await r.text() };
      const titles = await getForeignTitles(sheet[1]);
      const grids = await Promise.all(titles.slice(0, 4).map((t) => readForeignGrid(sheet[1], `'${t}'!A1:AZ`)));
      return { name: "Google Sheet", text: titles.slice(0, 4).map((t, i) => `## แท็บ ${t}\n${csvOf(grids[i])}`).join("\n\n") };
    }
    if (file) {
      const meta = await drive().files.get({ fileId: file[1], fields: "name,mimeType" });
      const mime = meta.data.mimeType ?? "";
      const res = await drive().files.get({ fileId: file[1], alt: "media" }, { responseType: "arraybuffer" });
      return loadFile(meta.data.name ?? "file", mime, Buffer.from(res.data as ArrayBuffer));
    }
    return { name: u, error: "รองรับลิงก์ Google Docs / Sheets / ไฟล์ใน Drive เท่านั้น" };
  } catch {
    return { name: u, error: "เปิดลิงก์ไม่ได้ — ตั้งแชร์เป็น 'ทุกคนที่มีลิงก์ดูได้' หรือแชร์ให้อีเมลระบบ (ดูในหน้าตั้งค่า)" };
  }
}

export async function loadFile(name: string, mime: string, buf: Buffer): Promise<Loaded> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx") || mime.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    return { name, text: (await mammoth.extractRawText({ buffer: buf })).value };
  }
  if (/\.(xlsx|xls|csv)$/.test(lower) || mime.includes("spreadsheet") || mime === "text/csv") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "buffer" });
    return { name, text: wb.SheetNames.slice(0, 4).map((n) => `## แท็บ ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join("\n\n") };
  }
  if (mime.startsWith("text/") || lower.endsWith(".txt")) return { name, text: buf.toString("utf8") };
  if (mime === "application/pdf" || mime.startsWith("image/")) {
    if (buf.length > 14 * 1024 * 1024) return { name, error: "ไฟล์ใหญ่เกิน 14MB" };
    return { name, part: { inlineData: { mimeType: mime, data: buf.toString("base64") } } };
  }
  return { name, error: "ไฟล์ชนิดนี้ยังไม่รองรับ (ใช้ .docx .xlsx .csv .pdf หรือรูป)" };
}
