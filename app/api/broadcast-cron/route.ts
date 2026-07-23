// endpoint สำหรับ cron ส่ง broadcast ตามเวลา + เตือนซ้ำ
// ป้องกันด้วย BROADCAST_CRON_SECRET; เรียกโดย GitHub Actions
import { NextResponse } from "next/server";
import { runBroadcastCron } from "@/lib/bc/cron";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.BROADCAST_CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  const key = req.headers.get("x-cron-secret") ?? url.searchParams.get("key") ?? "";
  return key === secret;
}

async function handle(req: Request) {
  if (!authorized(req)) return new NextResponse("unauthorized", { status: 401 });
  try {
    const result = await runBroadcastCron();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    log.error("broadcast_cron_failed", { message: String(err) });
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
