// คำถามที่ตอบได้จากข้อมูลในระบบตรง ๆ — ไม่เรียก AI (ค่าใช้จ่าย 0) และตอบเร็ว
// ถ้าข้อมูลที่ต้องใช้ยังไม่มีในระบบ -> คืน null ให้ AI ไปค้นเองตามปกติ
import { liveSchedule, liveUniExams, examStart } from "@/lib/bc/schedule";
import { feeStatusFor } from "@/lib/bc/fees";
import { ranking } from "@/lib/bc/academic";
import { bkkDayKey, thDateTime, relativeTh, thShortDate } from "@/lib/time";
import type { AnswerOut, Asker } from "@/lib/ai/answer";

const ans = (reply: string, topic = "อื่นๆ", kind: AnswerOut["kind"] = "answer"): AnswerOut => ({ kind, reply, links: [], topic, personal: false, search_terms: [] });

export async function tryRules(q0: string, asker: Asker): Promise<AnswerOut | null> {
  const q = q0.trim().toLowerCase();
  const nick = asker.channel === "dm" && asker.nickname ? `${asker.nickname} ` : "";

  if (q.length <= 16 && /^(สวัสดี|หวัดดี|ดีจ้า|ดีค่ะ|ดีครับ|hello|hi|hey)/.test(q)) {
    return ans(`หวัดดี${nick ? " " + nick.trim() : ""} 👋\n\nถามเรื่องรุ่นได้หมดเลยนะ ประกาศ ตารางเรียน เงินรุ่น ฟอร์มที่ต้องกรอก ลิงก์ต่าง ๆ บอทค้นให้ 🔎`, "อื่นๆ", "smalltalk");
  }
  if (q.length <= 24 && /^(ขอบคุณ|ขอบใจ|thank|thx|แต้งกิ้ว|ขอบคุน|ty\b)/.test(q)) {
    return ans(`ยินดีเลย${nick ? " " + nick.trim() : ""} 💙 มีอะไรถามได้ตลอดนะ`, "อื่นๆ", "smalltalk");
  }

  // ตารางเรียนวันนี้/พรุ่งนี้
  const dayWord = q.match(/(วันนี้|พรุ่งนี้|มะรืน)/)?.[1];
  if (dayWord && /(เรียน|คาบ|ตึก|ห้อง|วิชา|lecture|lab|แลป|แล็บ)/.test(q) && !/(สอบ|ส่ง|ฟอร์ม)/.test(q)) {
    const sched = await liveSchedule();
    if (sched.length) {
      const offset = dayWord === "วันนี้" ? 0 : dayWord === "พรุ่งนี้" ? 1 : 2;
      const day = bkkDayKey(Date.now() + offset * 86_400_000);
      const covered = sched.some((s) => s.date >= day) && sched.some((s) => s.date <= day);
      const rows = sched.filter((s) => s.date === day).sort((a, b) => a.start.localeCompare(b.start));
      if (rows.length || covered) {
        const label = `${dayWord} (${thShortDate(day + "T12:00:00+07:00")})`;
        if (!rows.length) return ans(`${label} ไม่มีคาบเรียนในตารางเลย 🎉 พักผ่อนบ้างนะ`, "วิชาการ");
        return ans(`${label} เรียน ${rows.length} คาบ 📚\n\n${rows.map((s) => `• ${s.start}–${s.end} ${s.subject}${s.topic ? ` — ${s.topic}` : ""}\n   📍 ${[s.building, s.room].filter(Boolean).join(" ห้อง ") || "ยังไม่ระบุที่"}`).join("\n")}\n\nดูทั้งเดือนได้ในแอป BM33 แท็บตารางนะ`, "วิชาการ");
      }
    }
  }

  // สอบครั้งหน้า
  if (/สอบ/.test(q) && /(ครั้งหน้า|ถัดไป|ต่อไป|เมื่อไหร่|เมื่อไร|วันไหน|อีกกี่วัน|ใกล้สุด|next)/.test(q) && !/(จำข้อสอบ|ฟอร์ม|ลิงก์|ลิ้งค์|ห้องไหน.*ปี)/.test(q)) {
    const exams = (await liveUniExams()).filter((e) => examStart(e).getTime() > Date.now());
    if (exams.length) {
      const e = exams[0];
      const more = exams.slice(1, 3);
      return ans(`สอบครั้งหน้า: ${e.name} 📝\n\n🗓 ${thDateTime(examStart(e))}${e.end ? `–${e.end}` : ""} (${relativeTh(examStart(e))})\n📍 ${[e.building, e.room].filter(Boolean).join(" ห้อง ") || "ยังไม่ระบุที่"}${more.length ? `\n\nถัดไป:\n${more.map((x) => `• ${x.name} — ${thDateTime(examStart(x))}`).join("\n")}` : ""}\n\nสู้ ๆ นะ 💪`, "วิชาการ");
    }
  }

  // เงินรุ่นของฉัน (แชตส่วนตัว + ยืนยันตัวตนแล้วเท่านั้น)
  if (asker.channel !== "group" && asker.verified && asker.studentId &&
      /(เงินรุ่น|ค่ารุ่น|ค่าสนับสนุนรุ่น)/.test(q) && /(ค้าง|จ่าย.{0,4}(ยัง|แล้ว)|ของ(ฉัน|เรา|ผม|หนู|เค้า)|ต้องจ่าย|เหลือ)/.test(q)) {
    const f = await feeStatusFor(asker.studentId);
    if (f.months.length) {
      const owed = f.months.filter((m) => m.state === "unpaid" || m.state === "overdue");
      const r = owed.length
        ? `${nick}ยังค้างเงินรุ่น ${owed.length} เดือน รวม ${f.outstanding.toLocaleString()} บาท 💸\n\n${owed.map((m) => `• ${m.label} ${m.amount} บาท${m.state === "overdue" ? " (เลยกำหนดแล้ว)" : m.due ? ` (ภายใน ${thDateTime(m.due)})` : ""}`).join("\n")}\n\nจ่ายแล้วส่งสลิปในแอป BM33 แท็บของฉันได้เลย ฝ่ายการเงินจะตรวจให้`
        : `${nick}จ่ายเงินรุ่นครบทุกเดือนที่มีในระบบแล้ว ✅${f.yearly ? " (แพ็กรายปี)" : ""} ขอบคุณมากนะ 💙`;
      return { ...ans(r, "การเงิน"), personal: true };
    }
  }

  // red zone ของฉัน
  if (asker.channel !== "group" && asker.verified && asker.studentId && /(red ?zone|เรดโซน|เรด โซน)/i.test(q) && /(ฉัน|เรา|ผม|หนู|ไหม|มั้ย|ยัง|อยู่)/.test(q)) {
    const { rows } = await ranking();
    const r = rows.find((x) => x.student_id === asker.studentId);
    if (r) {
      const fee = r.feeMisses ? `\n💸 เงินรุ่นที่เลยกำหนด: ${r.feeMonths.join(", ")} (จ่ายแล้วส่งสลิปในแอปได้เลย)` : "";
      const msg = r.level === "red"
        ? `${nick}ตอนนี้อยู่ใน Red Zone นะ 📕${r.misses ? ` ยังไม่ได้จำข้อสอบ ${r.misses} ครั้ง` : ""}${r.missedExams.length ? `\n\n${r.missedExams.map((n) => `• ${n}`).join("\n")}` : ""}${fee}\n\nค่อย ๆ ทยอยเคลียร์ เดี๋ยวก็หลุดโซน สู้ ๆ 💪`
        : r.misses === 0 && r.feeMisses === 0 ? `${nick}ปลอดภัย ไม่อยู่ใน Red Zone เลย ✅ จำข้อสอบครบ เงินรุ่นก็ไม่ค้าง เก่งมาก 🌟`
        : `${nick}ยังไม่อยู่ใน Red Zone นะ 🟡${r.misses ? ` (ยังไม่ได้จำ ${r.misses} ครั้ง)` : ""}${fee}\nอีกประมาณ ${r.distanceToRed} ครั้งจะถึงโซน ระวังนิดนึงน้า`;
      return { ...ans(msg, "วิชาการ"), personal: true };
    }
  }
  return null;
}
