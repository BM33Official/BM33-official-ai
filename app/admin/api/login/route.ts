// ล็อกอิน control center — เทียบรหัสผ่าน แล้วตั้ง cookie
import { NextResponse } from "next/server";
import { makeToken, SESSION_COOKIE } from "@/lib/bc/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const pw = process.env.ADMIN_PANEL_PASSWORD;
  if (!pw) return NextResponse.json({ ok: false, error: "ยังไม่ได้ตั้ง ADMIN_PANEL_PASSWORD" }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if ((body.password ?? "") !== pw) {
    return NextResponse.json({ ok: false, error: "รหัสผ่านไม่ถูกต้อง" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, makeToken(pw), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
