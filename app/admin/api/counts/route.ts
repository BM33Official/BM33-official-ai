// นับรายการที่ "ต้องสนใจ" ต่อแท็บ (สำหรับ badge แจ้งเตือนสีแดง)
import { NextResponse } from "next/server";
import { isAuthed, currentRole } from "@/lib/bc/auth";
import { ensureBcTabs } from "@/lib/bc/sheets";
import { readMembers } from "@/lib/bc/members";
import { readOverlay } from "@/lib/bc/status";
import { readBroadcasts } from "@/lib/bc/broadcast";
import { readTable } from "@/lib/google-sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAuthed()) return NextResponse.json({ ok: false }, { status: 401 });
  const role = currentRole();
  // ฝ่ายวิชาการเห็นแค่แท็บวิชาการ — ไม่ต้องนับ badge อื่น (ประหยัด read)
  if (role === "academic") return NextResponse.json({ ok: true, role });
  try {
    await ensureBcTabs();
    const [members, overlay, broadcasts, buffer, pending] = await Promise.all([
      readMembers(true), readOverlay(true), readBroadcasts(),
      readTable("07_ข้อความทั้งหมด").catch(() => []),
      readTable("BC_summaries").catch(() => []),
    ]);
    const inProgress = members.filter((m) => m.onboarding_state && m.onboarding_state !== "done").length;
    const claims = overlay.filter((o) => o.state === "claimed").length;
    const mismatch = members.filter((m) => m.onboarding_state === "mismatch").length;
    const newBuffer = buffer.filter((r) => { const s = String(r["สถานะเรียนรู้"] ?? "").trim(); return !s || s === "new"; }).length;
    const pendingBc = broadcasts.filter((b) => ["draft", "pending", "scheduled"].includes(b.status)).length;
    const pendingSummaries = pending.filter((r) => String(r["status"] ?? "") === "pending").length;

    return NextResponse.json({
      ok: true,
      role,
      members: inProgress,
      inbox: claims + mismatch,
      learning: newBuffer,
      broadcasts: pendingBc,
      summary: pendingSummaries,
    });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
