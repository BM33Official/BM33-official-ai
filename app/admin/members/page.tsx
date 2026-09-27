import { requireAdmin } from "@/lib/bc/auth";
import { readMembers } from "@/lib/bc/members";
import { readRoster } from "@/lib/bc/roster";
import { Users } from "lucide-react";
import MembersTable, { MemberRow } from "../ui/MembersTable";
import { Head, Ring } from "../ui/kit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const digits = (s: string) => String(s ?? "").replace(/\D/g, "");

export default async function Members() {
  await requireAdmin();
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
      app: m?.portal_confirmed_at ? "yes" : "",
      last_seen: m?.last_seen_at || "",
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
      state: m.status === "verified" ? "verified" : m.status === "mismatch" ? "mismatch" : "onboarding",
      onboarded_at: m.onboarded_at || "",
      app: m.portal_confirmed_at ? "yes" : "",
      last_seen: m.last_seen_at || "",
    });
  }

  const verified = rows.filter((r) => r.state === "verified").length;
  const onboarding = rows.filter((r) => r.state === "onboarding" || r.state === "mismatch").length;
  const missing = rows.filter((r) => r.state === "missing").length;

  return (
    <div className="wrap">
      <Head icon={Users} tone="blue" title="สมาชิก" sub={`ทะเบียนรุ่น ${roster.length} คน — แต่ละช่องคือเพื่อน 1 คน`} />
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 24, alignItems: "center", marginBottom: 16 }}>
          <Ring value={verified} max={roster.length || 1} size={110} stroke={12} tone="blue" label={verified} sub={`จาก ${roster.length}`} />
          <div className="row" style={{ gap: 28 }}>
            <div><div className="bignum" style={{ color: "#0058b8" }}>{rows.filter((r) => r.app).length}</div><div className="hint">เปิดแอปแล้ว</div></div>
            <div><div className="bignum" style={{ color: "var(--orange-ink)" }}>{onboarding}</div><div className="hint">กำลังยืนยัน</div></div>
            <div><div className="bignum muted">{missing}</div><div className="hint">ยังไม่เข้าร่วม</div></div>
          </div>
        </div>
        <div className="dots">
          {rows.filter((r) => r.student_id).sort((a, b) => a.student_id.localeCompare(b.student_id)).map((r) => (
            <span key={r.student_id} className={`d ${r.state === "verified" ? (r.app ? "blue" : "soft") : r.state === "missing" ? "none" : "warn"}`}
              title={`${r.nickname || r.full_name} · ${r.state === "verified" ? (r.app ? "ยืนยันแล้ว + เปิดแอป" : "ยืนยันแล้ว") : r.state === "missing" ? "ยังไม่เข้าร่วม" : "กำลังยืนยัน"}`}>{Number(r.student_id.slice(-3))}</span>
          ))}
        </div>
        <div className="legend" style={{ marginTop: 12 }}><span><i style={{ background: "#007aff" }} />เปิดแอปแล้ว</span><span><i style={{ background: "#d7f5df" }} />ยืนยันแล้ว</span><span><i style={{ background: "#ff9500" }} />กำลังยืนยัน</span><span><i style={{ background: "#e5e5ea" }} />ยังไม่เข้าร่วม</span></div>
      </div>
      <MembersTable rows={rows} total={roster.length} verified={verified} onboarding={onboarding} missing={missing} />
    </div>
  );
}
