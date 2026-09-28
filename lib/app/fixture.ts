// ข้อมูลตัวอย่างสำหรับทดสอบหน้าตาแอป "ในเครื่องเท่านั้น" (APP_FIXTURE=1 และไม่ใช่ production)
// ไม่แตะชีตจริง — ใช้ถ่ายภาพหน้าจอ/ตรวจ UI ตอนที่ข้อมูลจริงยังว่าง
import { bkkDayKey, bkkDate } from "@/lib/time";

export function fixtureEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.APP_FIXTURE === "1";
}

type State = { board: Record<string, unknown>; mine: Record<string, unknown> };

export function applyFixture<T extends State>(s: T, opts: { draw?: string } = {}): T {
  const now = Date.now();
  const day = (d: number) => bkkDayKey(now + d * 86_400_000);
  const at = (d: number, t: string) => bkkDate(day(d), t).toISOString();
  const board = s.board as Record<string, unknown>;
  const mine = s.mine as Record<string, unknown>;
  board.announcements = [
    {
      id: "AN-FX1", title: "ส่งฟอร์มเลือกวิชาเลือกเสรี", summary: "ทุกคนต้องเลือกวิชาเลือกเสรีเทอมหน้า 2 วิชา ผ่านฟอร์มของคณะ ภายในพรุ่งนี้ 23:59 น.",
      body: "@All 📢 รบกวนเพื่อน ๆ ทุกคนกรอกฟอร์มเลือกวิชาเลือกเสรีเทอมหน้าด้วยน้าาา เลือกได้ 2 วิชา\nปิดพรุ่งนี้ 23:59 น. นะค้าบ ใครกรอกแล้วข้ามได้เลย 🙏\nhttps://forms.gle/example-elective",
      author: "ไปร์ท", author_role: "ประธานรุ่น", category: "ฟอร์ม/เอกสาร", deadline_at: at(1, "23:59"), event_at: "", location: "",
      links: [{ label: "กรอกฟอร์มเลือกวิชา", url: "https://forms.gle/example-elective" }], pinned: true, created_at: new Date(now - 5 * 3600_000).toISOString(), updated_at: "", form_id: "F-FX1", cal: "fx",
    },
    {
      id: "AN-FX2", title: "ต้อนรับน้องปี 1 — รับสมัครสตาฟ", summary: "รับสตาฟงานต้อนรับน้อง 12 คน ซ้อมวันศุกร์นี้ 17:00 ที่ลานกิจกรรม สมัครในฟอร์มภายในพฤหัส",
      body: "ฝ่ายกิจการภายในรับสมัครสตาฟงานต้อนรับน้องปี 1 จำนวน 12 คน 🎉 ซ้อมครั้งแรกศุกร์นี้ 17:00 น. ลานกิจกรรมตึกเรียนรวม\nสมัครได้ที่ https://forms.gle/example-staff",
      author: "อิ่ม", author_role: "ฝ่ายกิจการภายใน", category: "กิจกรรม", deadline_at: at(4, "18:00"), event_at: at(5, "17:00"), location: "ลานกิจกรรม อาคารเรียนรวม",
      links: [{ label: "สมัครสตาฟ", url: "https://forms.gle/example-staff" }], pinned: false, created_at: new Date(now - 26 * 3600_000).toISOString(), updated_at: "", form_id: "", cal: "fx",
    },
    {
      id: "AN-FX3", title: "เงินรุ่นเดือนตุลาคม 300 บาท", summary: "เงินรุ่น ต.ค. 300 บาท/คน โอนพร้อมเพย์แล้วแจ้งสลิปในฟอร์ม ภายใน 15 ต.ค.",
      body: "เงินรุ่นเดือนตุลาคมคนละ 300 บาทน้า 💸 โอนพร้อมเพย์แล้วแนบสลิปในฟอร์มภายใน 15 ต.ค. ค่ะ ใครจ่ายรายปีแล้วไม่ต้องจ่ายนะคะ",
      author: "เค้ก", author_role: "ฝ่ายการเงิน", category: "การเงิน", deadline_at: at(18, "23:59"), event_at: "", location: "",
      links: [{ label: "แจ้งโอน", url: "https://forms.gle/example-pay" }], pinned: false, created_at: new Date(now - 3 * 86_400_000).toISOString(), updated_at: "", form_id: "", cal: "fx",
    },
    {
      id: "AN-FX4", title: "ปรับห้องเรียน Immunology วันพุธ", summary: "คาบ Immunology วันพุธย้ายไปห้อง 702 ชั้น 7 อาคารเรียนรวม เวลาเดิม",
      body: "แจ้งเปลี่ยนห้องเรียน Immunology วันพุธนี้ย้ายไปห้อง 702 ชั้น 7 นะครับ เวลาเดิม 09:00", author: "นาย", author_role: "ฝ่ายวิชาการ",
      category: "วิชาการ", deadline_at: "", event_at: at(2, "09:00"), location: "ห้อง 702 อาคารเรียนรวม", links: [], pinned: false, created_at: new Date(now - 50 * 60_000).toISOString(), updated_at: "", form_id: "", cal: "fx",
    },
  ];
  board.forms = [
    { id: "F-FX1", name: "ฟอร์มเลือกวิชาเลือกเสรี", deadline_at: at(1, "23:59"), link: "https://forms.gle/example-elective", description: "กรอกทุกคน · ใช้เวลา 2 นาที", type: "form", closed: false },
    { id: "F-FX2", name: "Wellness survey ภาคเรียนที่ 1", deadline_at: at(9, "18:00"), link: "https://forms.gle/example-wellness", description: "", type: "form", closed: false },
    { id: "F-FX3", name: "สั่งจองชุดครุยพิธีเข้าวอร์ด", deadline_at: new Date(now - 6 * 3600_000).toISOString(), link: "https://forms.gle/example-gown", description: "", type: "form", closed: true },
    { id: "F-FX4", name: "ส่งรูปทำบัตร นศ.", deadline_at: at(3, "12:00"), link: "https://forms.gle/example-card", description: "", type: "form", closed: false },
  ];
  mine.forms = [{ id: "F-FX1", state: "none", undo: false }, { id: "F-FX2", state: "done", undo: true }, { id: "F-FX3", state: "none", undo: false }, { id: "F-FX4", state: "claimed", undo: true }];
  const lect = (d: number, start: string, end: string, subject: string, topic: string, lecturer: string, room: string, kind = "lecture") =>
    ({ id: `SC-${d}-${start}`, date: day(d), start, end, subject, topic, lecturer, building: "อาคารเรียนรวม", room, kind, note: "", block: "Block Immune" });
  board.schedule = [
    lect(0, "08:00", "09:50", "Immunology", "Innate immunity II", "ผศ.พญ.ศิริพร", "501"),
    lect(0, "10:00", "11:50", "Microbiology", "Bacterial pathogenesis", "อ.นพ.กิตติ", "501"),
    lect(0, "13:00", "15:50", "Immunology Lab", "Flow cytometry", "ทีมอาจารย์", "Lab 3", "lab"),
    lect(1, "09:00", "11:50", "Pathology", "Inflammation & repair", "รศ.นพ.ธนา", "702"),
    lect(1, "13:00", "14:50", "Pharmacology", "Antimicrobials I", "อ.ภญ.วรรณ", "702"),
    lect(2, "09:00", "11:50", "Immunology", "Adaptive immunity", "ผศ.พญ.ศิริพร", "702"),
    lect(3, "08:00", "09:50", "Microbiology", "Virology I", "อ.นพ.กิตติ", "501"),
    lect(5, "17:00", "19:00", "ซ้อมต้อนรับน้อง", "สตาฟงาน", "", "ลานกิจกรรม", "activity"),
    lect(9, "09:00", "12:00", "Immunology Quiz", "Quiz 2", "", "Hall A", "exam"),
  ];
  board.exams = [{ id: "UX-FX1", name: "สอบ Block Immune (Summative I)", date: day(12), start: "09:00", end: "12:00", building: "อาคารเรียนรวม", room: "Hall A-B", block: "Block Immune", note: "", at: at(12, "09:00") }];
  board.daily = {
    id: "DY-FX", date: day(0), headline: "เช้านี้มีเรียน 3 คาบ และฟอร์มเลือกวิชาปิดพรุ่งนี้ อย่าลืมน้า ☀️", updated_at: new Date(now - 3 * 3600_000).toISOString(),
    items: [
      { emoji: "📝", text: "ส่งฟอร์มเลือกวิชาเลือกเสรี ภายในพรุ่งนี้ 23:59 น.", at: at(1, "23:59"), ref: "AN-FX1", tone: "urgent" },
      { emoji: "🏫", text: "Immunology วันพุธย้ายไปห้อง 702 ชั้น 7 เวลาเดิม", at: at(2, "09:00"), ref: "AN-FX4", tone: "normal" },
      { emoji: "🎉", text: "สมัครสตาฟต้อนรับน้องภายในพฤหัส 18:00 น.", at: at(4, "18:00"), ref: "AN-FX2", tone: "normal" },
      { emoji: "📚", text: "อีก 12 วันสอบ Block Immune เริ่มทบทวนได้แล้ว", at: at(12, "09:00"), tone: "normal" },
    ],
  };
  board.notice = "";
  board.payment = { info: "โอนพร้อมเพย์ 08x-xxx-xxxx (บัญชีเงินรุ่น BM33) แล้วแนบสลิปในฟอร์ม", link: "https://forms.gle/example-pay" };
  board.semester = "ปี 2 · ภาคเรียนที่ 1/2569";
  const months = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
  const labels = ["ก.ค. 69", "ส.ค. 69", "ก.ย. 69", "ต.ค. 69", "พ.ย. 69", "ธ.ค. 69"];
  const states = ["paid", "paid", "paid", "unpaid", "upcoming", "upcoming"];
  mine.fees = {
    months: months.map((m, i) => ({ month: m, label: labels[i], amount: i === 3 ? 300 : 300, due: i === 3 ? at(18, "23:59") : "", state: states[i], paid_at: "", note: "" })),
    outstanding: 300, overdue: 0, paidCount: 3, yearly: false,
    next: { month: "2026-10", label: "ต.ค. 69", amount: 300, due: at(18, "23:59"), state: "unpaid", paid_at: "", note: "" },
  };
  mine.zone = { level: "close", misses: 2, missedExams: ["Genetics II", "Immune Quiz 1"], feeMisses: 1, feeMonths: ["ก.ย. 69"], gauge: 0.72, title: "ใกล้ Red Zone", text: "ใกล้เส้นแดงแล้ว ขอแรงอีกนิด เคลียร์ข้อที่ค้างก่อนสอบครั้งหน้านะ" };
  if (opts.draw) {
    const show = opts.draw === "reveal" ? now - 120_000 : now - 20_000;
    const reveal = opts.draw === "reveal" ? now - 10_000 : now + 70_000;
    board.draws = [{ id: "DR-FX", activity: "ช่วยงานต้อนรับน้อง 12 ต.ค.", need: 3, poolSize: 6, phase: opts.draw === "reveal" ? "revealed" : "drawing", show_at: new Date(show).toISOString(), reveal_at: new Date(reveal).toISOString() }];
    mine.draws = [{ id: "DR-FX", activity: "ช่วยงานต้อนรับน้อง 12 ต.ค.", need: 3, poolSize: 6, phase: opts.draw === "reveal" ? "revealed" : "drawing", show_at: new Date(show).toISOString(), reveal_at: new Date(reveal).toISOString(), inPool: true, selected: opts.draw === "reveal" ? true : null }];
  }
  return s;
}
