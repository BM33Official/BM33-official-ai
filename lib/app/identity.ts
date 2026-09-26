// จับคู่บัญชี LINE (จาก LIFF) กับนักศึกษา — ยืนยันครั้งเดียว แล้วล็อกไว้ตลอด
import { readMembers, patchMember } from "@/lib/bc/members";
import { readRoster, matchRoster } from "@/lib/bc/roster";
import { appendRecord, nowISO, digits } from "@/lib/bc/sheets";
import { Member, RosterEntry } from "@/lib/bc/types";
import { lineClient } from "@/lib/line";

export interface Candidate {
  sid: string;
  nickname: string;
  fullName: string;
  number: number;
}

function toCandidate(r: RosterEntry): Candidate {
  return { sid: r.student_id, nickname: r.nickname, fullName: `${r.prefix ?? ""}${r.full_name}`, number: Number(r.student_id.slice(-3)) };
}

export type ResolveResult =
  | { step: "ready"; sid: string }
  | { step: "confirm"; candidate: Candidate }
  | { step: "register"; reason?: string };

// userId ของ LIFF เป็นเพื่อนกับบอท (provider เดียวกัน) ไหม — ถ้าใช่ ใช้เป็น userId ของบอทได้เลย
async function sameProviderFriend(sub: string): Promise<boolean> {
  try {
    await lineClient.getProfile(sub);
    return true;
  } catch {
    return false;
  }
}

export async function resolveSub(sub: string): Promise<ResolveResult> {
  const members = await readMembers(true);
  const byLiff = members.find((m) => m.liff_user_id === sub && m.status === "verified" && m.matched_student_id);
  if (byLiff && byLiff.portal_confirmed_at) return { step: "ready", sid: digits(byLiff.matched_student_id) };
  const byBot = byLiff ?? members.find((m) => m.line_user_id === sub && m.status === "verified" && m.matched_student_id);
  if (byBot) {
    const r = (await readRoster()).find((x) => x.student_id === digits(byBot.matched_student_id));
    if (r) return { step: "confirm", candidate: toCandidate(r) };
  }
  return { step: "register" };
}

export async function candidateFor(name: string, last3: string): Promise<{ candidate?: Candidate; error?: string }> {
  const l3 = digits(last3).slice(-3);
  if (l3.length !== 3) return { error: "ใส่เลข 3 ตัวท้ายของรหัสนักศึกษาให้ครบนะ" };
  const res = await matchRoster(name, l3);
  if (res.match) return { candidate: toCandidate(res.match) };
  if (res.ambiguous) return { error: "มีเพื่อนหลายคนที่รหัสลงท้ายเลขนี้ พิมพ์ชื่อจริงให้เต็มอีกนิดนะ" };
  return { error: "ไม่พบรหัสลงท้ายเลขนี้ในทะเบียนรุ่น ลองเช็กอีกครั้งนะ" };
}

// ผูกบัญชี (หลังผู้ใช้กด "ใช่ นี่คือฉัน")
export async function linkSub(sub: string, sid: string, displayName = ""): Promise<{ ok: boolean; error?: string }> {
  const s = digits(sid);
  const members = await readMembers(true);
  // มีคนอื่น (LIFF คนละบัญชี) ยืนยันรหัสนี้ไปแล้ว -> ไม่ให้แย่ง ส่งให้แอดมินตรวจ
  const taken = members.find((m) => digits(m.matched_student_id) === s && m.status === "verified" && m.liff_user_id && m.liff_user_id !== sub);
  if (taken) {
    await appendRecord("members", {
      line_user_id: "", display_name: displayName, claimed_name: "(แอป) ขอยืนยันซ้ำ", last3: s.slice(-3),
      matched_student_id: "", pending_student_id: s, status: "mismatch", onboarding_state: "mismatch",
      onboarded_at: "", updated_at: nowISO(), liff_user_id: sub, portal_confirmed_at: "", last_seen_at: "",
    });
    return { ok: false, error: "รหัสนี้ถูกยืนยันด้วยบัญชี LINE อื่นแล้ว ส่งเรื่องให้แอดมินตรวจสอบแล้วนะ 🙏" };
  }
  const friend = await sameProviderFriend(sub);
  // แถวของตัวเองอยู่แล้ว (จากบอท หรือ LIFF) -> อัปเดต
  const own = members.find((m) => m.liff_user_id === sub) ??
    members.find((m) => m.line_user_id === sub) ??
    members.find((m) => digits(m.matched_student_id) === s && m.status === "verified" && !m.liff_user_id);
  const patch: Partial<Member> = {
    liff_user_id: sub,
    portal_confirmed_at: nowISO(),
    matched_student_id: s,
    status: "verified",
    onboarding_state: "done",
    last_seen_at: nowISO(),
  };
  if (friend && !own?.line_user_id) patch.line_user_id = sub;
  if (own?.__row) {
    if (!own.onboarded_at) patch.onboarded_at = nowISO();
    await patchMember(own, patch);
  } else {
    await appendRecord("members", {
      line_user_id: friend ? sub : "", display_name: displayName, claimed_name: "", last3: s.slice(-3),
      matched_student_id: s, pending_student_id: "", status: "verified", onboarding_state: "done",
      onboarded_at: nowISO(), updated_at: nowISO(), liff_user_id: sub, portal_confirmed_at: nowISO(), last_seen_at: nowISO(),
    });
  }
  return { ok: true };
}
