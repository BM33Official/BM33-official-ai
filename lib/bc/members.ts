// อ่าน/เขียนสมาชิกที่ลงทะเบียน (BC_members)
import { readTab, appendRecord, patchRecord, nowISO } from "@/lib/bc/sheets";
import { TABS, Member } from "@/lib/bc/types";

// cache สั้น ๆ (ลด read ต่อ DM) — ล้างเมื่อมีการเขียน
let _cache: { rows: Member[]; at: number } | null = null;
function invalidate() { _cache = null; }

export async function readMembers(force = false): Promise<Member[]> {
  if (!force && _cache && Date.now() - _cache.at < 15_000) return _cache.rows;
  const rows = await readTab<Member>(TABS.members);
  _cache = { rows, at: Date.now() };
  return rows;
}

export async function getMember(lineUserId: string): Promise<Member | null> {
  if (!lineUserId) return null;
  const all = await readMembers();
  return all.find((m) => m.line_user_id === lineUserId) ?? null;
}

// สร้างแถวสมาชิกใหม่ (ตอน follow) หรือรีเซ็ตให้เริ่ม onboarding ใหม่
export async function startOnboarding(
  lineUserId: string,
  displayName: string
): Promise<void> {
  const existing = await getMember(lineUserId);
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
        display_name: displayName, updated_at: nowISO(),
      });
    } else {
      await patchRecord("members", existing.__row, existing as never, base);
    }
  } else {
    await appendRecord("members", base);
  }
  invalidate();
}

export async function patchMember(
  member: Member,
  patch: Partial<Member>
): Promise<void> {
  if (!member.__row) return;
  await patchRecord("members", member.__row, member as never, {
    ...(patch as Record<string, string>),
    updated_at: nowISO(),
  });
  invalidate();
}

export async function verifiedMembers(): Promise<Member[]> {
  return (await readMembers()).filter(
    (m) => m.status === "verified" && m.matched_student_id && m.line_user_id
  );
}
