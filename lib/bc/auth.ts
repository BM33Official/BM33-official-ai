// auth ง่าย ๆ สำหรับ control center — ไม่มี username
//   - แอดมินเต็ม: รหัส ADMIN_PANEL_PASSWORD  -> เห็น/ใช้ได้ทุกแท็บ
//   - ฝ่ายวิชาการ: รหัส ACADEMIC_PANEL_PASSWORD (ถ้าตั้งไว้) -> เห็น/ใช้ได้เฉพาะแท็บวิชาการ
// cookie เก็บ token ที่ผูกกับ role (httpOnly) เทียบกับค่าที่คำนวณจาก env
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "bc_session";
export type Role = "admin" | "academic";

export function makeToken(pw: string): string {
  return createHash("sha256").update("bc|" + pw).digest("hex");
}
function academicToken(pw: string): string {
  return createHash("sha256").update("bc|acad|" + pw).digest("hex");
}

// พยายามจับคู่รหัสผ่านกับ role -> คืน token ที่จะเซ็ตใน cookie (null = รหัสผิด)
export function tokenForPassword(pw: string): { token: string; role: Role } | null {
  const admin = process.env.ADMIN_PANEL_PASSWORD;
  const acad = process.env.ACADEMIC_PANEL_PASSWORD;
  if (admin && pw === admin) return { token: makeToken(admin), role: "admin" };
  if (acad && pw === acad) return { token: academicToken(acad), role: "academic" };
  return null;
}

// role ปัจจุบันจาก cookie (null = ยังไม่ล็อกอิน)
export function currentRole(): Role | null {
  const c = cookies().get(SESSION_COOKIE)?.value;
  if (!c) return null;
  const admin = process.env.ADMIN_PANEL_PASSWORD;
  const acad = process.env.ACADEMIC_PANEL_PASSWORD;
  if (admin && c === makeToken(admin)) return "admin";
  if (acad && c === academicToken(acad)) return "academic";
  return null;
}

export function isAuthed(): boolean {
  return currentRole() !== null;
}
export function isAdmin(): boolean {
  return currentRole() === "admin";
}

// ใช้ในหน้าที่ทุก role เข้าได้ (เช่น แท็บวิชาการ)
export function requireAuth(): void {
  if (!isAuthed()) redirect("/admin/login");
}
// ใช้ในหน้าที่เฉพาะแอดมินเต็มเท่านั้น — ฝ่ายวิชาการจะถูกส่งไปแท็บวิชาการ
export function requireAdmin(): void {
  const role = currentRole();
  if (!role) redirect("/admin/login");
  if (role !== "admin") redirect("/admin/academic");
}

// admin LINE user ids (สำหรับ test mode ส่งหาแอดมิน)
export function adminLineIds(): string[] {
  return (process.env.ADMIN_LINE_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
