// อ่าน/เขียนสมาชิกที่ลงทะเบียน (BC_members)
// อ่านผ่าน snapshot (cache แชร์) — เขียนแล้ว snapshot ถูกล้างอัตโนมัติ
import { readKey, readKeyFresh, appendRecord, patchRecord, nowISO, digits } from "@/lib/bc/sheets";
import { Member } from "@/lib/bc/types";

export async function readMembers(force = false): Promise<Member[]> {
  return force ? readKeyFresh<Member>("members") : readKey<Member>("members");
}

// หาสมาชิกจาก userId ของบอท "หรือ" userId จาก LIFF (อาจต่างกันถ้าอยู่คนละ provider)
export async function getMember(lineUserId: string, force = false): Promise<Member | null> {
  if (!lineUserId) return null;
  const all = await readMembers(force);
  return (
    all.find((m) => m.line_user_id === lineUserId) ??
    all.find((m) => m.liff_user_id === lineUserId) ??
    null
  );
}

export async function memberByStudent(studentId: string, force = false): Promise<Member | null> {
  const sid = digits(studentId);
  if (!sid) return null;
  const all = await readMembers(force);
  const hits = all.filter((m) => digits(m.matched_student_id) === sid);
  return hits.find((m) => m.status === "verified") ?? hits[0] ?? null;
}

// สร้างแถวสมาชิกใหม่ (ตอน follow) หรือรีเซ็ตให้เริ่ม onboarding ใหม่
export async function startOnboarding(
  lineUserId: string,
  displayName: string
): Promise<void> {
  const existing = await getMember(lineUserId, true);
  const base = {
    line_user_id: lineUserId,
    display_name: displayName,
    claimed_name: "",
    last3: "",
    matched_student_id: "",
    pending_student_id: "",
    status: "unverified",
    onboarding_state: "awaiting_info",
    onboarded_at: "",
    updated_at: nowISO(),
  };
  if (existing?.__row) {
    // ถ้าเคยยืนยันแล้ว ไม่ต้องรีเซ็ต — แค่เก็บ display name
    if (existing.status === "verified") {
      await patchRecord("members", existing.__row, existing as never, {
        display_name: displayName || existing.display_name, updated_at: nowISO(),
      });
    } else {
      await patchRecord("members", existing.__row, existing as never, { ...base, liff_user_id: existing.liff_user_id ?? "" });
    }
  } else {
    await appendRecord("members", base);
  }
}

export async function patchMember(
  member: Member,
  patch: Partial<Member>
): Promise<void> {
  if (!member.__row) return;
  // อ่านสดก่อน (กันทับค่าที่เพิ่งเปลี่ยนจากอีกช่องทาง เช่น บอท vs แอป)
  const latest = (await readMembers(true)).find((m) => m.__row === member.__row) ?? member;
  await patchRecord("members", member.__row, latest as never, {
    ...(patch as Record<string, string>),
    updated_at: nowISO(),
  });
}

export async function verifiedMembers(): Promise<Member[]> {
  return (await readMembers()).filter(
    (m) => m.status === "verified" && m.matched_student_id && m.line_user_id
  );
}

// ใครก็ได้ที่ยืนยันแล้ว (รวมคนที่ยืนยันผ่านแอปอย่างเดียว ไม่มี userId ของบอท)
export async function verifiedAny(): Promise<Member[]> {
  return (await readMembers()).filter((m) => m.status === "verified" && m.matched_student_id);
}
