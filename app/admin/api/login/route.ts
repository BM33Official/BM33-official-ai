// ล็อกอิน control center — เทียบรหัสผ่าน (แอดมิน/วิชาการ) แล้วตั้ง cookie ตาม role
import { NextResponse } from "next/server";
import { tokenForPassword, SESSION_COOKIE } from "@/lib/bc/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!process.env.ADMIN_PANEL_PASSWORD) {
    return NextResponse.json({ ok: false, error: "ยังไม่ได้ตั้ง ADMIN_PANEL_PASSWORD" }, { status: 500 });
  }
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const match = tokenForPassword(body.password ?? "");
  if (!match) {
    return NextResponse.json({ ok: false, error: "รหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  // ฝ่ายวิชาการเข้าแท็บวิชาการโดยตรง, แอดมินเข้าแดชบอร์ด
  const res = NextResponse.json({ ok: true, role: match.role, redirect: match.role === "academic" ? "/admin/academic" : "/admin" });
  res.cookies.set(SESSION_COOKIE, match.token, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
