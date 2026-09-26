// นับรายการที่ "ต้องสนใจ" ต่อเมนู (badge สีแดง) — อ่านจาก snapshot (cache) ไม่ยิงชีตเพิ่ม
import { NextResponse } from "next/server";
import { currentRole } from "@/lib/bc/auth";
import { snapshot } from "@/lib/bc/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const role = await currentRole();
  if (!role) return NextResponse.json({ ok: false }, { status: 401 });
  if (role !== "admin") return NextResponse.json({ ok: true, role });
  try {
    const s = await snapshot();
    const str = (v: unknown) => String(v ?? "");
    const now = Date.now();
    const pendingOutbox = s.outbox.filter((o) => str(o.status) === "pending" && !(o.expires_at && new Date(str(o.expires_at)).getTime() < now)).length;
    const claims = s.status.filter((o) => str(o.state) === "claimed").length;
    const mismatch = s.members.filter((m) => str(m.onboarding_state) === "mismatch").length;
    const inProgress = s.members.filter((m) => str(m.onboarding_state) && !["done", "mismatch"].includes(str(m.onboarding_state))).length;
    const pendingBc = s.broadcasts.filter((b) => ["pending"].includes(str(b.status))).length;
    const drafts = s.announcements.filter((a) => str(a.status) === "draft").length;
    return NextResponse.json({
      ok: true,
      role,
      inbox: pendingOutbox + claims + mismatch,
      members: inProgress,
      broadcasts: pendingBc,
      announcements: drafts,
      learning: 0,
    });
  } catch {
    return NextResponse.json({ ok: true, role });
  }
}
