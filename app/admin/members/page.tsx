import { requireAdmin } from "@/lib/bc/auth";
import { ensureBcTabs } from "@/lib/bc/sheets";
import { readMembers } from "@/lib/bc/members";
import { readRoster } from "@/lib/bc/roster";
import MembersTable, { MemberRow } from "../ui/MembersTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const digits = (s: string) => String(s ?? "").replace(/\D/g, "");

export default async function Members() {
  requireAdmin();
  await ensureBcTabs();
  const [members, roster] = await Promise.all([readMembers(true), readRoster()]);

  // จับคู่ member กับ student_id (verified ก่อน แล้ว pending)
  const memberBySid = new Map<string, (typeof members)[number]>();
  for (const m of members) {
    const sid = digits(m.matched_student_id) || digits(m.pending_student_id);
    if (!sid) continue;
    const prev = memberBySid.get(sid);
    if (!prev || (m.status === "verified" && prev.status !== "verified")) memberBySid.set(sid, m);
  }

  const rows: MemberRow[] = roster.map((r) => {
    const sid = digits(r.student_id);
    const m = memberBySid.get(sid);
    let state: MemberRow["state"] = "missing";
    if (m) {
      if (m.status === "verified") state = "verified";
      else if (m.onboarding_state === "mismatch" || m.status === "mismatch") state = "mismatch";
      else state = "onboarding";
    }
    return {
      student_id: sid,
      full_name: r.full_name || "",
      nickname: r.nickname || "",
      line_name: m?.display_name || "",
      state,
      onboarded_at: m?.onboarded_at || "",
    };
  });

  // สมาชิกที่ลงทะเบียนแต่ไม่อยู่ในทะเบียนรุ่น (เผื่อกรณีพิเศษ)
  const rosterSids = new Set(roster.map((r) => digits(r.student_id)));
  for (const m of members) {
    const sid = digits(m.matched_student_id) || digits(m.pending_student_id);
    if (sid && rosterSids.has(sid)) continue;
    rows.push({
      student_id: sid || "",
      full_name: m.claimed_name || "",
      nickname: "",
      line_name: m.display_name || "",
      state: m.status === "verified" ? "verified" : "onboarding",
      onboarded_at: m.onboarded_at || "",
    });
  }

  const verified = rows.filter((r) => r.state === "verified").length;
  const onboarding = rows.filter((r) => r.state === "onboarding" || r.state === "mismatch").length;
  const missing = rows.filter((r) => r.state === "missing").length;

  return (
    <div className="wrap">
      <h1>สมาชิก</h1>
      <p className="sub">ทุกคนในทะเบียนรุ่น {roster.length} คน — เรียงตามรหัส นศ. · เห็นชัดว่าใครยังไม่แอดบอท/ยังไม่ลงทะเบียน</p>
      <MembersTable rows={rows} total={roster.length} verified={verified} onboarding={onboarding} missing={missing} />
    </div>
  );
}
