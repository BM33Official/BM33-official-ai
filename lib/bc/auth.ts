// auth ง่าย ๆ สำหรับ control center — รหัสผ่านเดียว (ADMIN_PANEL_PASSWORD)
// cookie = sha256("bc|"+password) (httpOnly) เทียบกับค่าที่คำนวณจาก env
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "bc_session";

export function makeToken(pw: string): string {
  return createHash("sha256").update("bc|" + pw).digest("hex");
}

export function isAuthed(): boolean {
  const pw = process.env.ADMIN_PANEL_PASSWORD;
  if (!pw) return false;
  const c = cookies().get(SESSION_COOKIE)?.value;
  return !!c && c === makeToken(pw);
}

// ใช้ในหน้า server component ที่ต้องล็อกอิน
export function requireAuth(): void {
  if (!isAuthed()) redirect("/admin/login");
}

// admin LINE user ids (สำหรับ test mode ส่งหาแอดมิน)
export function adminLineIds(): string[] {
  return (process.env.ADMIN_LINE_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
