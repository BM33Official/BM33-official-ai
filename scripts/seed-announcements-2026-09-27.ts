// ประกาศที่ยังเกี่ยวข้อง ณ 27 ก.ย. 2569 จากไฟล์ export แชตกลุ่มรุ่น + OpenChat (ข้อความต้นฉบับครบ)
// idempotent: source_ref = "export:<วันที่ เวลา ผู้ส่ง>" ซ้ำไม่สร้างใหม่
import "./_env";
import { readFileSync } from "fs";
import { parseLineExport } from "@/lib/kb/linechat";
import { createAnnouncement, readAnnouncements } from "@/lib/bc/announcements";
import { saveCommittee } from "@/lib/bc/committee-admin";
import { readCommittee } from "@/lib/bc/committee";

const main = parseLineExport(readFileSync(process.env.HOME + "/Downloads/[LINE]BM33 27 sep.txt", "utf8"), "main");
const open = parseLineExport(readFileSync(process.env.HOME + "/Downloads/[LINE]BM33 openchat 27 sep.txt", "utf8"), "openchat");
const find = (src: typeof main, date: string, time: string, sender?: string) => {
  const m = src.find((x) => x.date === date && x.time === time && (!sender || x.sender === sender));
  if (!m) throw new Error(`missing ${date} ${time} ${sender}`);
  return m.text;
};
const T = (d: string, t = "23:59") => new Date(`${d}T${t}:00+07:00`).toISOString();

const items = [
  { ref: "2026-09-27 11:13 Prite", body: find(main, "2026-09-27", "11:13", "Prite"), title: "ทุนฉุกเฉินสำหรับนักศึกษาที่โดนน้ำท่วม", summary: "ใครได้รับผลกระทบจากน้ำท่วม กรอกฟอร์มขอทุนฉุกเฉินของมหาวิทยาลัยได้เลย", category: "ด่วน", author: "ไปร์ท", role: "ประธานรุ่น", links: [{ label: "ขอทุนฉุกเฉิน", url: "https://s.uni.net.th/918fqao6yu" }], created: "2026-09-27T11:13", pinned: "1" },
  { ref: "2026-09-26 21:19 Prite", body: [find(main, "2026-09-26", "21:19", "Prite"), "เบื้องต้นรายละเอียดว่าจะจัดการเรียนการสอนอย่างไรต้องรออาจารย์แจ้งอีกทีในวันพรุ่งนี้", "นี่ติดต่ออาจารย์ให้ละ ถ้า 7 ตุลาช่วงบ่ายว่างกัน รีแอคข้อความนี้ให้หน่อย", "ใครที่บ้านน้ำท่วมทำให้ไม่สะดวกเดินทาง ฝากรีแอคข้อความนี้ด้วย"].join("\n\n"), title: "น้ำท่วม: อาจย้ายแลปไป พ. 7 ต.ค. ช่วงบ่าย (ออนไลน์)", summary: "อาจารย์ถามว่าว่างบ่าย 7 ต.ค. ไหม จะย้ายแลปไปเรียนออนไลน์วันนั้น — ว่าง/บ้านน้ำท่วม ให้กดรีแอคในกลุ่ม รอยืนยันจากอาจารย์", category: "วิชาการ", author: "ไปร์ท", role: "ประธานรุ่น", event: T("2026-10-07", "13:00"), links: [], created: "2026-09-26T21:19" },
  { ref: "2026-09-26 16:03 Sate", body: find(main, "2026-09-26", "16:03", "Sate"), title: "ออกแบบหอพัก นศพ. ใหม่ — ส่งไอเดีย", summary: "คณะกำลังจะสร้างหอพักนักศึกษาแพทย์ใหม่ อยากได้อะไร (ห้อง พื้นที่ส่วนกลาง ฟิตเนส ที่อ่านหนังสือ) กรอกฟอร์มได้เลย", category: "ทั่วไป", author: "เสท", role: "ฝ่ายพัฒนาคุณภาพชีวิต", links: [{ label: "ส่งไอเดียหอพัก", url: "https://docs.google.com/forms/d/e/1FAIpQLScUrmfKrgHVmjLbXD1JZ02gNtb4t8kdvSQ8tydT4SA0_Xsghw/viewform?usp=dialog" }], created: "2026-09-26T16:03", todo: false },
  { ref: "2026-09-21 08:14 Prite", body: find(main, "2026-09-21", "08:14", "Prite") + "\n\n" + find(main, "2026-09-21", "09:53", "Bingo Weetiwat"), title: "แบบสำรวจ พ.ร.บ.วิชาชีพเวชกรรม (ต่อใบอนุญาตทุก 5 ปี)", summary: "สพท. ขอความเห็นนักศึกษาแพทย์ทุกชั้นปีเรื่องการกำหนดอายุ/ต่ออายุใบอนุญาต (สอบ NL ทุก 5 ปี) ช่วยกันกรอกทุกคน ปิด อา. 27 ก.ย. 22:00", category: "ฟอร์ม/เอกสาร", author: "ไปร์ท", role: "ประธานรุ่น", deadline: T("2026-09-27", "22:00"), links: [{ label: "กรอกแบบสำรวจ", url: "https://forms.gle/ZmKMid8pSgeAQfLc7" }, { label: "อ่านร่าง พ.ร.บ.", url: "https://drive.google.com/drive/folders/1vBZZlUPdjs6Wl3DT0c0BFJdvFIDX_aIy" }], created: "2026-09-21T08:14", todo: true },
  { ref: "2026-08-11 11:50 Prite", body: find(main, "2026-08-11", "11:50", "Prite"), title: "ศิษย์พบครู ครั้งที่ 1 — พ. 30 ก.ย.", summary: "รอบสุดท้าย พ. 30 ก.ย. 13:00–15:30 (ลงทะเบียน 12:30) ห้องประชุม 1 ชั้น 6 อาคารทีปังกร — เช็กวันที่อาจารย์ที่ปรึกษามาในชีต", category: "กิจกรรม", author: "ไปร์ท", role: "ประธานรุ่น", event: T("2026-09-30", "13:00"), location: "ห้องประชุม 1 ชั้น 6 อาคารทีปังกรรัศมีโชติ", links: [{ label: "วันที่อาจารย์มา", url: "https://docs.google.com/spreadsheets/d/1r3Eh3OVlG0B2hB2qUK6M7uD7FxVfhFUFeHLbIKhA-Gs/edit?usp=drivesdk" }], created: "2026-08-11T11:50" },
  { ref: "2026-08-05 21:13 Prite", body: find(main, "2026-08-05", "21:13", "Prite"), title: "PCM x BM Research Pitching — รอบ 30 ก.ย.", summary: "ประกวด pitching ไอเดียวิจัย (ภาษาอังกฤษ ธีม Health Equity & Global Health in Digital Era) รอบ Semi Final พ. 30 ก.ย. 13:00 น. รอบชิง 28 ต.ค.", category: "วิชาการ", author: "ไปร์ท", role: "ประธานรุ่น", event: T("2026-09-30", "13:00"), links: [{ label: "เข้ากลุ่มไลน์", url: "https://line.me/ti/g/8ds84zEPND" }], created: "2026-08-05T21:13" },
  { ref: "2026-08-28 09:32 great.m", body: find(main, "2026-08-28", "09:32", "great.m"), title: "NMU Photo Contest 2026 (ปิด 30 ก.ย.)", summary: "ประกวดภาพถ่ายรอบรั้วมหาวิทยาลัย ชิงรางวัลรวมกว่า 20,000 บาท ส่งผลงานทางอีเมล pr@mnmu.ac.th ภายใน 30 ก.ย.", category: "กิจกรรม", author: "เกรท", role: "", deadline: T("2026-09-30"), links: [], created: "2026-08-28T09:32" },
  { ref: "2026-08-26 19:40 open", body: find(open, "2026-08-26", "19:40"), title: "Pre-order เสื้อ Vajira Sport x Syringe Games", summary: "ตัวละ 339 บาท (2 ตัว 639 · 3 ตัว 899) สกรีนชื่อ+เบอร์ฟรี สี Navy/Pink สั่งได้ถึง 30 ก.ย.", category: "กิจกรรม", author: "สโมสรนักศึกษา", role: "ประชาสัมพันธ์ (OpenChat)", deadline: T("2026-09-30"), links: [{ label: "สั่งเสื้อ", url: "https://forms.gle/zcoXPbzdPD4fRxpt8" }], created: "2026-08-26T19:40", todo: false },
  { ref: "2026-09-21 17:47 open", body: find(open, "2026-09-21", "17:47"), title: "Phayathai Health Leadership (อา. 11 ต.ค.)", summary: "กิจกรรมผู้นำ+ศิลปะร่วมกับหลายสถาบัน อา. 11 ต.ค. 08:30–15:45 ห้องประชุม 1 ชั้น 6 ทีปังกร — สำรวจความสนใจปิด 27 ก.ย.", category: "กิจกรรม", author: "สโมสรนักศึกษา", role: "ประชาสัมพันธ์ (OpenChat)", deadline: T("2026-09-27"), event: T("2026-10-11", "08:30"), location: "ห้องประชุม 1 ชั้น 6 อาคารทีปังกรรัศมีโชติ", links: [], created: "2026-09-21T17:47" },
  { ref: "2026-09-26 18:30 open", body: find(open, "2026-09-26", "18:30"), title: "SMST First Date — รับสมัครวงดนตรี/Cover dance", summary: "ประกวดวงดนตรีธีม 'การเดินทาง' และ Cover dance ในงาน SMST First Date 14 พ.ย. ที่ ม.รังสิต สมัครถึง 12 ต.ค. (QR ในโพสต์)", category: "กิจกรรม", author: "สโมสรนักศึกษา", role: "ประชาสัมพันธ์ (OpenChat)", deadline: T("2026-10-12"), event: T("2026-11-14", "09:00"), links: [], created: "2026-09-26T18:30" },
  { ref: "2026-09-27 08:30 open", body: find(open, "2026-09-27", "08:30"), title: "VajiraQuiz 2026 — รับทีมงานเพิ่ม", summary: "รับสตาฟเพิ่ม (ผู้ป่วยจำลอง นศ.หญิง / สถานที่ / สวัสดิการ / ประสาน / Photo / Video) งานวันที่ 14 พ.ย. ได้เกียรติบัตร+ชั่วโมงจิตอาสา", category: "กิจกรรม", author: "สโมสรนักศึกษา", role: "ประชาสัมพันธ์ (OpenChat)", event: T("2026-11-14", "08:00"), links: [{ label: "สมัครทีมงาน", url: "https://forms.gle/QrcPgasgv6eZ3Zmz5" }], created: "2026-09-27T08:30", todo: false },
  { ref: "2026-07-02 18:37 Sate", body: find(main, "2026-07-02", "18:37", "Sate"), title: "Syringe Game 35th — 15–17 ม.ค. 70 ที่ ม.สงขลาฯ", summary: "กีฬาไซริ้งเกม 15–17 ม.ค. 2570 ที่ มหาวิทยาลัยสงขลานครินทร์ จ.สงขลา — ติดตามการคัดตัว/กองเชียร์จากฝ่ายกีฬา", category: "กิจกรรม", author: "เสท", role: "ฝ่ายพัฒนาคุณภาพชีวิต", event: T("2027-01-15", "08:00"), links: [], created: "2026-07-02T18:37" },
];

(async () => {
  const existing = new Set((await readAnnouncements(true)).map((a) => a.source_ref));
  let n = 0;
  for (const it of items) {
    const ref = `export:${it.ref}`;
    if (existing.has(ref)) continue;
    await createAnnouncement({
      title: it.title, summary: it.summary, body: it.body, author: it.author, author_role: it.role, category: it.category,
      deadline_at: (it as { deadline?: string }).deadline ?? "", event_at: (it as { event?: string }).event ?? "", location: (it as { location?: string }).location ?? "",
      links: JSON.stringify(it.links), source: "group", source_ref: ref, status: "live", pinned: (it as { pinned?: string }).pinned ?? "",
      created_at: new Date(it.created + ":00+07:00").toISOString(),
    }, { autoForm: (it as { todo?: boolean }).todo === true });
    n++;
  }
  console.log("created", n);
  // กรรมการ: เพิ่มผู้ที่ประกาศในนามฝ่ายจริงจากแชต (ไบร์ท = วิชาการ, แบง = เก็บเงินรุ่น)
  const c = await readCommittee();
  const rows = c.map((x) => ({ student_id: x.student_id, nickname: x.nickname, role: x.role, contact_url: x.contact_url }));
  if (!rows.some((r) => r.student_id === "6801101011")) rows.push({ student_id: "6801101011", nickname: "ไบร์ท", role: "ฝ่ายวิชาการ", contact_url: "https://line.me/ti/p/~noobrightja" });
  if (!rows.some((r) => r.student_id === "6801101072")) rows.push({ student_id: "6801101072", nickname: "แบง", role: "ฝ่ายการเงิน (เก็บเงินรุ่น)", contact_url: "https://line.me/ti/p/~bang.nonsri" });
  console.log("committee", await saveCommittee(rows));
})();
