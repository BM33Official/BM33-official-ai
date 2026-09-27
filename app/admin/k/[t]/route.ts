// ลิงก์เข้าตรงของฝ่าย (การเงิน/วิชาการ): ตรวจลายเซ็น -> ตั้ง session -> ไปหน้าของฝ่ายนั้น
import { NextResponse } from "next/server";
import { tokenForLink, SESSION_COOKIE, ROLE_HOME } from "@/lib/bc/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { t: string } }) {
  const m = await tokenForLink(params.t);
  const url = new URL(m ? ROLE_HOME[m.role] : "/admin/login?expired=1", req.url);
  const res = NextResponse.redirect(url);
  if (m) res.cookies.set(SESSION_COOKIE, m.token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 60 });
  return res;
}
