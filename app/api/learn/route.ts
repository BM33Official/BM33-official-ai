// endpoint สำหรับ job digest — ป้องกันด้วย secret (LEARN_CRON_SECRET)
// เรียกโดย GitHub Actions cron 3 รอบ/วัน (13:30 / 20:00 / 03:00 เวลาไทย)
// วิธีเรียก: GET/POST /api/learn?key=SECRET  หรือ header  x-learn-secret: SECRET

import { NextResponse } from "next/server";
import { runDigest } from "@/lib/digest";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // digest อาจใช้เวลาหลายวินาที

function authorized(req: Request): boolean {
  const secret = process.env.LEARN_CRON_SECRET;
  if (!secret) return false; // ยังไม่ตั้ง secret = ปิดไว้
  const url = new URL(req.url);
  const key = req.headers.get("x-learn-secret") ?? url.searchParams.get("key") ?? "";
  return key === secret;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  try {
    const result = await runDigest();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    log.error("digest_failed", { message: String(err) });
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
