// ลอจิกลงทะเบียนแบบสนทนา — คืนข้อความที่จะ reply กลับ (webhook เอาไปส่ง)
import { messagingApi } from "@line/bot-sdk";
import { ensureBcTabs, nowISO } from "@/lib/bc/sheets";
import { startOnboarding, getMember, patchMember } from "@/lib/bc/members";
import { matchRoster } from "@/lib/bc/roster";
import { confirmBubble } from "@/lib/line-cards";
import { Member } from "@/lib/bc/types";

type Msg = messagingApi.Message;
const text = (t: string): Msg => ({ type: "text", text: t });

const ASK =
  "สวัสดีค้าบ 👋 ยินดีต้อนรับสู่บอทกลางรุ่น BM33\nรบกวนพิมพ์ ชื่อ-นามสกุล และ เลข 3 ตัวท้ายของรหัสนักศึกษา เพื่อยืนยันตัวตนนะ\n(ตัวอย่าง: บิงโก วีร์ทิวัตถ์ 123)";

// follow — เริ่ม onboarding
export async function handleFollow(userId: string, displayName: string): Promise<Msg[]> {
  await ensureBcTabs();
  await startOnboarding(userId, displayName);
  const m = await getMember(userId);
  if (m?.status === "verified") {
    return [text(`ยินดีต้อนรับกลับมานะ 🎉 ระบบจำได้แล้วว่าเป็นสมาชิกที่ยืนยันตัวตนแล้ว`)];
  }
  return [text(ASK)];
}

// แยกชื่อ + 3 หลักท้ายจากข้อความ
function parse(input: string): { name: string; last3: string } {
  const groups = input.match(/\d{3,}/g);
  const last3 = groups ? groups[groups.length - 1].slice(-3) : "";
  const name = input
    .replace(/\d+/g, " ")
    .replace(/รหัส|เลขที่|นศ\.?|ชื่อ|id|last|digit/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { name, last3 };
}

// ข้อความระหว่าง onboarding (state = awaiting_info)
export async function handleOnboardingText(member: Member, input: string): Promise<Msg[]> {
  await ensureBcTabs();
  const { name, last3 } = parse(input);
  if (!last3) {
    return [text("ขอเลข 3 ตัวท้ายของรหัสนักศึกษาด้วยนะ 🙏\n(ตัวอย่าง: บิงโก 123)")];
  }
  const res = await matchRoster(name, last3);

  if (res.match) {
    await patchMember(member, {
      claimed_name: name, last3,
      pending_student_id: res.match.student_id,
      onboarding_state: "awaiting_confirm",
    });
    return [
      confirmBubble(
        "ยืนยันตัวตน",
        `คุณคือ ${res.match.full_name}${res.match.nickname ? ` (${res.match.nickname})` : ""}\nรหัส นศ. ลงท้าย ${last3} ใช่ไหม?`,
        "onboard_confirm:yes",
        "onboard_confirm:no"
      ),
    ];
  }

  if (res.ambiguous) {
    await patchMember(member, { claimed_name: name, last3, onboarding_state: "mismatch" });
    return [text("มีเพื่อนหลายคนที่รหัสลงท้ายเลขนี้ ขอชื่อ-นามสกุลเต็มอีกครั้งนะ หรือรอผู้ดูแลช่วยยืนยันก็ได้ 🙏")];
  }

  // ไม่พบ 3 หลักท้ายในทะเบียน
  await patchMember(member, { claimed_name: name, last3, onboarding_state: "awaiting_info" });
  return [text("ไม่พบรหัสลงท้ายเลขนี้ในทะเบียนรุ่นเลย ลองเช็กอีกครั้งแล้วพิมพ์ใหม่นะ (ชื่อ + 3 ตัวท้ายรหัส นศ.)")];
}

// ตอบ confirm (จาก postback หรือพิมพ์ ใช่/ไม่)
export async function handleConfirm(member: Member, yes: boolean): Promise<Msg[]> {
  await ensureBcTabs();
  if (member.onboarding_state !== "awaiting_confirm") {
    return [text(ASK)];
  }
  if (yes) {
    await patchMember(member, {
      matched_student_id: member.pending_student_id,
      pending_student_id: "",
      status: "verified",
      onboarding_state: "done",
      onboarded_at: nowISO(),
    });
    return [text("ยืนยันตัวตนสำเร็จ ✅ ตั้งแต่นี้ถ้ามีประกาศหรือเรื่องต้องทำ เดี๋ยวบอทแจ้งให้นะ ขอบคุณค้าบ 🙏")];
  }
  await patchMember(member, { pending_student_id: "", onboarding_state: "awaiting_info" });
  return [text("โอเค งั้นพิมพ์ ชื่อ-นามสกุล และ 3 ตัวท้ายรหัส นศ. ใหม่อีกครั้งนะ 🙏")];
}
