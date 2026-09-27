// auth ง่าย ๆ สำหรับ control center — ไม่มี username มีแต่รหัสผ่านต่อ "บทบาท"
//   - admin    : ADMIN_PANEL_PASSWORD (Vercel env)            -> ทุกหน้า
//   - academic : ตั้งในหน้า "ตั้งค่า" (BC_config) หรือ env ACADEMIC_PANEL_PASSWORD -> เฉพาะหน้าวิชาการ
//   - finance  : ตั้งในหน้า "ตั้งค่า" (BC_config)                -> เฉพาะหน้าการเงิน
// cookie = "<role>.<hmac>" ผูกกับ hash ของรหัสปัจจุบัน -> เปลี่ยนรหัสเมื่อไร session เก่าหลุดทันที
import { cookies } from "next/headers";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { redirect } from "next/navigation";
import { getConfig, hashPassword } from "@/lib/bc/config";

export const SESSION_COOKIE = "bc_session";
export type Role = "admin" | "academic" | "finance";

export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  academic: "/admin/academic",
  finance: "/admin/finance",
};
export const ROLE_LABEL: Record<Role, string> = {
  admin: "แอดมิน",
  academic: "ฝ่ายวิชาการ",
  finance: "ฝ่ายการเงิน",
};

function secret(): string {
  return createHash("sha256").update("bc-session|" + (process.env.LINE_CHANNEL_SECRET ?? "") + (process.env.ADMIN_PANEL_PASSWORD ?? "")).digest("hex");
}

// hash ของรหัสที่ใช้งานอยู่ตอนนี้ ต่อบทบาท ("" = บทบาทนี้ยังไม่เปิด)
async function credHashes(): Promise<Record<Role, string>> {
  let cfg: Record<string, string> = {};
  try { cfg = await getConfig(); } catch { /* ชีตล่ม -> admin ยังเข้าได้ */ }
  const admin = process.env.ADMIN_PANEL_PASSWORD ? hashPassword(process.env.ADMIN_PANEL_PASSWORD) : "";
  const academic = cfg.academic_password_hash || (process.env.ACADEMIC_PANEL_PASSWORD ? hashPassword(process.env.ACADEMIC_PANEL_PASSWORD) : "");
  const finance = cfg.finance_password_hash || "";
  return { admin, academic, finance };
}

function sign(role: Role, credHash: string): string {
  return createHmac("sha256", secret()).update(`${role}|${credHash}`).digest("hex");
}

// พยายามจับคู่รหัสผ่านกับ role -> คืน token ที่จะเซ็ตใน cookie (null = รหัสผิด)
export async function tokenForPassword(pw: string): Promise<{ token: string; role: Role } | null> {
  if (!pw) return null;
  const h = hashPassword(pw);
  const creds = await credHashes();
  for (const role of ["admin", "academic", "finance"] as Role[]) {
    if (creds[role] && creds[role] === h) return { token: `${role}.${sign(role, creds[role])}`, role };
  }
  return null;
}

let _roleMemo: { cookie: string; role: Role | null; at: number } | null = null;

// role ปัจจุบันจาก cookie (null = ยังไม่ล็อกอิน)
export async function currentRole(): Promise<Role | null> {
  const c = cookies().get(SESSION_COOKIE)?.value ?? "";
  if (!c) return null;
  if (_roleMemo && _roleMemo.cookie === c && Date.now() - _roleMemo.at < 5_000) return _roleMemo.role;
  const [role, sig] = c.split(".") as [Role, string];
  let result: Role | null = null;
  if (role && sig && role in ROLE_HOME) {
    const creds = await credHashes();
    if (creds[role]) {
      const want = Buffer.from(sign(role, creds[role]));
      const got = Buffer.from(sig);
      if (want.length === got.length && timingSafeEqual(want, got)) result = role;
    }
  }
  _roleMemo = { cookie: c, role: result, at: Date.now() };
  return result;
}

export async function isAuthed(): Promise<boolean> {
  return (await currentRole()) !== null;
}
export async function isAdmin(): Promise<boolean> {
  return (await currentRole()) === "admin";
}

// หน้าที่เปิดให้บางบทบาท — คนอื่นถูกส่งกลับหน้าหลักของบทบาทตัวเอง
export async function requireRole(...roles: Role[]): Promise<Role> {
  const role = await currentRole();
  if (!role) redirect("/admin/login");
  if (role !== "admin" && !roles.includes(role)) redirect(ROLE_HOME[role]);
  return role;
}
export async function requireAdmin(): Promise<void> {
  await requireRole("admin");
}
// หน้าที่ทุก role เข้าได้
export async function requireAuth(): Promise<Role> {
  const role = await currentRole();
  if (!role) redirect("/admin/login");
  return role;
}

// admin LINE user ids (สำหรับ test mode ส่งหาแอดมิน)
export function adminLineIds(): string[] {
  return (process.env.ADMIN_LINE_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// action prefix ที่แต่ละ role ใช้ได้ (admin ใช้ได้ทุกอย่าง)
export const ROLE_ACTIONS: Record<Exclude<Role, "admin">, string[]> = {
  academic: ["academic.", "draw."],
  finance: ["finance."],
};
export function roleCan(role: Role, action: string): boolean {
  if (role === "admin") return true;
  return ROLE_ACTIONS[role].some((p) => action.startsWith(p));
}


// ── ลิงก์เข้าตรง (ส่งให้ฝ่ายการเงิน/วิชาการ) — เปิดแล้วเข้าหน้าของฝ่ายตัวเองได้เลย ไม่ต้องพิมพ์รหัส
// ผูกกับรหัสผ่านปัจจุบัน: เปลี่ยนรหัสเมื่อไร ลิงก์เก่าใช้ไม่ได้ทันที
export async function accessLink(role: Exclude<Role, "admin">, base: string): Promise<string | null> {
  const creds = await credHashes();
  if (!creds[role]) return null;
  const sig = createHmac("sha256", secret()).update(`link|${role}|${creds[role]}`).digest("base64url").slice(0, 32);
  return `${base.replace(/\/$/, "")}/admin/k/${role}.${sig}`;
}
export async function tokenForLink(t: string): Promise<{ token: string; role: Role } | null> {
  const [role, sig] = t.split(".") as [Role, string];
  if (role !== "finance" && role !== "academic") return null;
  const creds = await credHashes();
  if (!creds[role] || !sig) return null;
  const want = createHmac("sha256", secret()).update(`link|${role}|${creds[role]}`).digest("base64url").slice(0, 32);
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  return { token: `${role}.${sign(role, creds[role])}`, role };
}
