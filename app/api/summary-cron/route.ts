// cron สรุป/เตือน — ?mode=due (เช็คเดดไลน์ใกล้ถึง รายวัน) | ?mode=weekly (สรุปสัปดาห์)
// ป้องกันด้วย BROADCAST_CRON_SECRET; สร้างเป็น pending รออนุมัติในหน้า สรุป/รอส่ง
import { NextResponse } from "next/server";
import { ensureBcTabs } from "@/lib/bc/sheets";
import { adminLineIds } from "@/lib/bc/auth";
import { runAppAutomation } from "@/lib/bc/cron";
import { generateDaily } from "@/lib/bc/daily";
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
  const mode = new URL(req.url).searchParams.get("mode") ?? "due";
  try {
    await ensureBcTabs();
    // v2: สรุปประจำวันบนแอป + คิวเตือนเดดไลน์ (แทนสรุปสัปดาห์/เตือนแบบเดิม)
    if (mode === "daily") {
      const r = await generateDaily({ force: new URL(req.url).searchParams.get("force") === "1" });
      return NextResponse.json({ ok: true, mode, ...r });
    }
    const r = await runAppAutomation();
    return NextResponse.json({ ok: true, mode, ...r, admins: adminLineIds().length });
  } catch (err) {
    log.error("summary_cron_failed", { message: String(err) });
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
