// ข้อมูลส่วนตัวของผู้ถาม (ส่งเข้า AI เฉพาะคำถามของคนนั้น) + ภาพรวมสำหรับแอดมิน
// การกรองทำด้วยโค้ดเสมอ — AI ไม่มีทางเห็นข้อมูลส่วนตัวของคนอื่นถ้าผู้ถามไม่ใช่แอดมิน
import { readRoster } from "@/lib/bc/roster";
import { feeStatusFor, readFeeMonths, financeMatrix } from "@/lib/bc/fees";
import { formStatesFor, statusForForm } from "@/lib/bc/status";
import { readForms } from "@/lib/bc/forms";
import { ranking } from "@/lib/bc/academic";
import { drawsForStudent } from "@/lib/bc/draws";
import { readMembers } from "@/lib/bc/members";
import { thDateTime, bkkDayKey } from "@/lib/time";
import { digits } from "@/lib/bc/sheets";

const FEE_TH: Record<string, string> = {
  paid: "จ่ายแล้ว", yearly: "จ่ายแล้ว (แพ็กรายปี)", waived: "ได้รับยกเว้น", partial: "จ่ายบางส่วน",
  unpaid: "ยังไม่จ่าย", overdue: "ยังไม่จ่าย (เลยกำหนด)", upcoming: "ยังไม่ถึงรอบ",
};
const LEVEL_TH: Record<string, string> = {
  red: "อยู่ใน Red Zone", close: "ใกล้ Red Zone", watch: "เฝ้าระวังเล็กน้อย", safe: "ปลอดภัย",
};

export async function personalBlock(studentId: string): Promise<string> {
  const sid = digits(studentId);
  const [roster, fees, forms, rank, draws] = await Promise.all([
    readRoster(), feeStatusFor(sid), formStatesFor(sid), ranking(), drawsForStudent(sid),
  ]);
  const me = roster.find((r) => r.student_id === sid);
  const lines: string[] = [];
  lines.push(`ตัวตน: ${me?.prefix ?? ""}${me?.full_name ?? "-"} (${me?.nickname ?? "-"}) · รหัส ${sid} · เลขที่ ${Number(sid.slice(-3))}`);
  if (fees.months.length) {
    lines.push(`เงินรุ่นของฉัน: ${fees.months.map((m) => `${m.label} ${m.amount}฿ = ${FEE_TH[m.state]}`).join(" · ")}`);
    lines.push(`ยอดค้างรวม: ${fees.outstanding} บาท${fees.next ? ` · รอบถัดไปที่ต้องจ่าย: ${fees.next.label}${fees.next.due ? ` ภายใน ${thDateTime(fees.next.due)}` : ""}` : ""}${fees.yearly ? " · เป็นแพ็กรายปี" : ""}`);
  } else {
    lines.push("เงินรุ่นของฉัน: ฝ่ายการเงินยังไม่ได้ลงข้อมูลในระบบ");
  }
  if (forms.length) {
    lines.push(`ฟอร์ม/งานของฉัน: ${forms.map((f) => `${f.form.name} = ${f.state === "done" ? "ทำแล้ว" : f.state === "claimed" ? "แจ้งว่าทำแล้ว รอตรวจ" : "ยังไม่ทำ"}${f.form.deadline_at ? ` (ปิด ${thDateTime(f.form.deadline_at)})` : ""}`).join(" · ")}`);
  }
  const r = rank.rows.find((x) => x.student_id === sid);
  if (r) {
    if (!rank.enabled) lines.push(`Red zone: ตอนนี้ระบบปิด Red Zone อยู่ ทุกคนอยู่ Green Zone (เริ่มต้นใหม่) · ยังไม่ได้กรอกข้อสอบ ${r.misses} ครั้ง${r.missedExams.length ? ` (${r.missedExams.join(", ")})` : ""}`);
    else lines.push(`Red zone ของฉัน: ${LEVEL_TH[r.level]} · ยังไม่ได้จำ ${r.misses} ครั้ง${r.missedExams.length ? ` (${r.missedExams.join(", ")})` : ""}${r.feeMisses ? ` · เงินรุ่นเลยกำหนด ${r.feeMonths.join(", ")}` : ""} (red zone นับทั้งข้อสอบที่ยังไม่ได้จำและเงินรุ่นที่เลยกำหนด)`);
  }
  for (const d of draws) {
    if (!d.inPool) continue;
    lines.push(`การสุ่มกิจกรรม "${d.activity}": ${d.phase === "revealed" ? (d.selected ? "ฉันถูกเลือก" : "ฉันไม่ถูกเลือก") : `ประกาศผล ${thDateTime(d.reveal_at)}`}`);
  }
  return lines.join("\n");
}

// ภาพรวมทั้งรุ่น — เฉพาะแอดมินถามในแชตส่วนตัว
export async function adminBlock(): Promise<string> {
  const [roster, months, matrix, forms, rank, members] = await Promise.all([
    readRoster(), readFeeMonths(), financeMatrix(), readForms(), ranking(), readMembers(),
  ]);
  const nick = (sid: string) => roster.find((r) => r.student_id === sid)?.nickname || sid;
  const lines: string[] = [];
  const verified = members.filter((m) => m.status === "verified").length;
  lines.push(`ลงทะเบียนแล้ว ${verified}/${roster.length} คน`);
  const regSet = new Set(members.filter((m) => m.status === "verified").map((m) => digits(m.matched_student_id)));
  const notReg = roster.filter((r) => !regSet.has(r.student_id));
  if (notReg.length) lines.push(`ยังไม่ลงทะเบียน (${notReg.length} คน): ${notReg.map((r) => `${r.nickname || r.full_name}(${Number(r.student_id.slice(-3))})`).join(", ")}`);
  const appUsers = members.filter((m) => m.portal_confirmed_at).length;
  lines.push(`เปิดแอป BM33 แล้ว ${appUsers} คน`);
  const thisMonth = bkkDayKey().slice(0, 7);
  for (const m of months.filter((x) => x.month <= thisMonth).slice(-3)) {
    const unpaid = roster.filter((r) => ["unpaid", "overdue"].includes(matrix.cell(r.student_id, m.month)));
    lines.push(`เงินรุ่น ${m.label || m.month}: ค้าง ${unpaid.length} คน${unpaid.length ? ` (${unpaid.map((r) => nick(r.student_id)).join(", ")})` : ""}`);
  }
  for (const f of forms.filter((x) => x.status !== "closed")) {
    const st = await statusForForm(f);
    const undone = st.filter((s) => s.state !== "done").map((s) => nick(digits(s.member.matched_student_id)));
    lines.push(`ฟอร์ม ${f.name}: ยังไม่ทำ ${undone.length} คน (เฉพาะคนที่ลงทะเบียนแล้ว)${undone.length ? `: ${undone.join(", ")}` : ""}`);
  }
  const red = rank.rows.filter((r) => r.level === "red");
  lines.push(!rank.enabled ? "Red zone ตอนนี้: ปิดระบบอยู่ (ทุกคน Green Zone)" : `Red zone ตอนนี้: ${red.length ? red.map((r) => `${r.nickname}(${r.misses})`).join(", ") : "ไม่มี"}`);
  return lines.join("\n");
}
