// อัปโหลดรูปจาก control center -> คืนลิงก์ https สำหรับส่งใน LINE (เครื่องแอดมินย่อรูปให้ ≤1MB ก่อนส่ง)
import { NextResponse } from "next/server";
import { currentRole } from "@/lib/bc/auth";
import { saveMedia } from "@/lib/bc/media";
import { ensureBcTabs } from "@/lib/bc/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const role = await currentRole();
  if (!role) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const { image, mime } = (await req.json()) as { image?: string; mime?: string };
    if (!image) return NextResponse.json({ ok: false, error: "ไม่มีรูป" }, { status: 400 });
    await ensureBcTabs();
    const file = await saveMedia(image, mime || "image/jpeg");
    const base = process.env.PUBLIC_BASE_URL || new URL(req.url).origin;
    return NextResponse.json({ ok: true, url: `${base.replace(/\/$/, "")}/api/media/${file}` });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String((err as Error)?.message ?? err).slice(0, 200) }, { status: 400 });
  }
}
