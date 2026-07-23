// จัดการปุ่ม "จ่ายแล้ว/ทำแล้ว" (postback verify:<formId>)
// auto form: อ่าน response sheet ถ้าเจอ -> confirm อัตโนมัติ, ไม่เจอ -> claim (รอผู้ดูแล)
import { messagingApi } from "@line/bot-sdk";
import { ensureBcTabs } from "@/lib/bc/sheets";
import { getMember } from "@/lib/bc/members";
import { getForm } from "@/lib/bc/forms";
import { autoDoneSet, setStatus } from "@/lib/bc/status";

type Msg = messagingApi.Message;
const text = (t: string): Msg => ({ type: "text", text: t });
const digits = (s: string) => String(s ?? "").replace(/\D/g, "");

export async function handleVerifyClaim(userId: string, formId: string): Promise<Msg[]> {
  await ensureBcTabs();
  const member = await getMember(userId);
  if (!member || member.status !== "verified" || !member.matched_student_id) {
    return [text("ยังยืนยันตัวตนไม่สำเร็จเลย พิมพ์ 'ลงทะเบียน' เพื่อยืนยันตัวตนก่อนนะ 🙏")];
  }
  const form = await getForm(formId);
  if (!form) return [text("ไม่พบรายการนี้ในระบบแล้ว อาจถูกปิดไปนะ 🙏")];

  const sid = member.matched_student_id;
  const label = form.name || "รายการนี้";

  if (form.access === "auto") {
    const doneSet = await autoDoneSet(form);
    if (doneSet.has(digits(sid))) {
      await setStatus(sid, form.form_id, "confirmed", "auto", "ตรวจพบในชีตตอนกดปุ่ม");
      return [text(`ยืนยันเรียบร้อย ✅ ระบบตรวจพบว่าทำ "${label}" แล้ว ขอบคุณนะ 🙏`)];
    }
    await setStatus(sid, form.form_id, "claimed", "self_claim", "กดปุ่มแต่ยังไม่พบในชีต");
    return [text(`รับเรื่องแล้ว 🙏 ตอนนี้ยังไม่พบข้อมูลของ "${label}" ในระบบ เดี๋ยวผู้ดูแลจะช่วยตรวจสอบอีกครั้งนะ`)];
  }

  await setStatus(sid, form.form_id, "claimed", "self_claim", "manual form");
  return [text(`รับเรื่องแล้ว 🙏 บันทึกว่าทำ "${label}" แล้ว รอผู้ดูแลยืนยันอีกครั้งนะ`)];
}
