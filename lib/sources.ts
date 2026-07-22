// ทะเบียนแหล่งข้อมูล (source registry) — ชนิด/ช่วง/สิทธิ์/cache ของแต่ละแท็บ
// layout (header row / คอลัมน์) มาจากการตรวจโครงสร้างชีตจริง
//
// ลำดับความสำคัญ (priority ต่ำ = ค้นก่อน/สำคัญกว่า): current เหนือ archive เสมอ
// การเข้าถึง (access):
//   all   = สมาชิกทุกคนเข้าถึงได้
//   self  = เฉพาะเจ้าของ LINE user ID (กรองด้วยโค้ด) หรือแอดมิน
//   admin = แอดมินเท่านั้น

export type SourceId =
  | "current"
  | "historyIndex"
  | "knowledgeArchive"
  | "announcementArchive"
  | "linkArchive"
  | "members"
  | "finance"
  | "announcementQueue"
  | "rawMessages";

export type AccessLevel = "all" | "self" | "admin";

export interface SourceDef {
  id: SourceId;
  // หาแท็บจริงจาก metadata (กันชื่อไทยสะกดต่าง/ถูกตัด)
  match: (title: string) => boolean;
  label: string; // ชื่อไว้โชว์ใน log/README
  headerRow: number; // แถว header (1-indexed) — แถวแรกที่ batchGet คืน = header
  lastCol: string; // คอลัมน์สุดท้าย เช่น "L"
  lastRow: number; // จำกัดจำนวนแถว (กัน range ใหญ่เกิน)
  cacheMs: number;
  access: AccessLevel;
  selfIdCol?: number; // index คอลัมน์ LINE user ID (0-indexed) สำหรับ self
  priority: number;
  purpose: string;
}

const norm = (s: string) => s.normalize("NFKC");
const has = (needle: string) => (t: string) => norm(t).includes(needle);

export const SOURCES: Record<SourceId, SourceDef> = {
  current: {
    id: "current",
    match: has("บริบทล่าสุด"),
    label: "AI_บริบทล่าสุด_ใช้แท็บนี้",
    headerRow: 7, // rows 1-6 = คำอธิบายระบบ, row 7 = header, row 8+ = ข้อมูล
    lastCol: "L",
    lastRow: 200,
    cacheMs: 60_000,
    access: "all",
    priority: 0,
    purpose: "ข้อมูลล่าสุดที่อนุมัติแล้ว — ค้นก่อนเสมอ มีสิทธิ์เหนือ archive",
  },
  historyIndex: {
    id: "historyIndex",
    match: has("ประวัติย่อ"), // ครอบคลุมทั้ง ดัชนี/ดรรชนี
    label: "AI_(ดัชนี/ดรรชนี)ประวัติย่อ_ตั้งแต่วันแรก",
    headerRow: 6, // row 6 = header (ช่วงเวลา|ภาพรวม|คำค้น|แหล่งค้น)
    lastCol: "D",
    lastRow: 200,
    cacheMs: 300_000,
    access: "all",
    priority: 1,
    purpose: "แผนที่ประวัติแบบย่อ — บอกว่าเรื่องเก่าอยู่ช่วงไหน/ค้น archive ตัวไหน",
  },
  knowledgeArchive: {
    id: "knowledgeArchive",
    match: has("01_"),
    label: "01_ฐานความรู้_AI",
    headerRow: 1,
    lastCol: "P",
    lastRow: 1200,
    cacheMs: 300_000,
    access: "all",
    priority: 2,
    purpose: "ความรู้ย้อนหลังแบบละเอียด",
  },
  announcementArchive: {
    id: "announcementArchive",
    match: has("02_"),
    label: "02_ประกาศ_สำคัญ",
    headerRow: 1,
    lastCol: "N",
    lastRow: 650,
    cacheMs: 300_000,
    access: "all",
    priority: 2,
    purpose: "ประกาศเก่า วันที่ และเดดไลน์",
  },
  linkArchive: {
    id: "linkArchive",
    match: has("03_"),
    label: "03_ลิงก์_ทรัพยากร",
    headerRow: 1,
    lastCol: "K",
    lastRow: 700,
    cacheMs: 300_000,
    access: "all",
    priority: 2,
    purpose: "ฟอร์ม ไฟล์ และลิงก์ทรัพยากร",
  },
  members: {
    id: "members",
    match: has("04_"),
    label: "04_สมาชิก_จากแชต",
    headerRow: 1,
    lastCol: "O",
    lastRow: 400,
    cacheMs: 60_000,
    access: "self",
    selfIdCol: 2, // คอลัมน์ C = LINE user ID
    priority: 3,
    purpose: "ข้อมูลสมาชิก — เฉพาะเจ้าของ LINE user ID หรือแอดมิน",
  },
  finance: {
    id: "finance",
    match: has("05_"),
    label: "05_ธุรกรรม_การเงิน",
    headerRow: 1,
    lastCol: "Q",
    lastRow: 500,
    cacheMs: 30_000,
    access: "self",
    selfIdCol: 2, // คอลัมน์ C = LINE user ID
    priority: 3,
    purpose: "ธุรกรรมการเงิน — เฉพาะเจ้าของ LINE user ID หรือแอดมิน; สติกเกอร์/คำกล่าวอ้างเปลี่ยนสถานะไม่ได้",
  },
  announcementQueue: {
    id: "announcementQueue",
    match: has("06_"),
    label: "06_คิวประกาศ_LINE",
    headerRow: 1,
    lastCol: "P",
    lastRow: 500,
    cacheMs: 15_000,
    access: "admin",
    priority: 4,
    purpose: "คิวประกาศ — แอดมินเท่านั้น",
  },
  rawMessages: {
    id: "rawMessages",
    match: has("07_"),
    label: "07_ข้อความทั้งหมด",
    headerRow: 1,
    lastCol: "J",
    lastRow: 5000,
    cacheMs: 15_000,
    access: "admin",
    priority: 5,
    purpose: "ข้อความดิบทั้งหมด — แอดมินเท่านั้น ไม่โหลดโดย default",
  },
};

// source ที่สมาชิกทั่วไปเข้าถึงได้ (archive)
export const PUBLIC_ARCHIVE_IDS: SourceId[] = [
  "knowledgeArchive",
  "announcementArchive",
  "linkArchive",
];

export function isAdmin(userId: string | undefined): boolean {
  if (!userId) return false;
  const ids = (process.env.ADMIN_LINE_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

// ปิด/ปฏิเสธ source ตามสิทธิ์ผู้ใช้ — กันไม่ให้ Gemini เป็นคนตัดสินสิทธิ์
export function canAccess(id: SourceId, userId: string | undefined): boolean {
  const src = SOURCES[id];
  if (src.access === "all") return true;
  if (src.access === "self") return true; // ยอมให้เข้าได้ แต่ต้องกรองแถวด้วย userId ทีหลัง
  if (src.access === "admin") return isAdmin(userId);
  return false;
}
