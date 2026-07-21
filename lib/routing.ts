// map หมวด -> ผู้ดูแล (ปุ่มโปรไฟล์ LINE — สูงสุด 4 ปุ่ม/ข้อความ ตามข้อจำกัด LINE)
// buttonLabel <= 20 ตัวอักษร · ข้อความรวม (base + note) <= 160 ตัวอักษร
//
// รูปแบบ profileUrl:
//   LINE ID:    https://line.me/ti/p/~<lineid>   (ต้องเปิด "อนุญาตให้เพิ่มเพื่อนด้วย ID")
//   share link: https://line.me/ti/p/<code>       (ใช้ได้เสมอ ชัวร์กว่า)
//   เบอร์โทร:    ❌ ทำปุ่มไม่ได้ -> โชว์เป็นข้อความใน note แทน
//
// ── ทำเนียบผู้ดูแล BM33 ปีที่ 2 ──
//   ประธาน           ไปร์ท (ปิยังกูร)    ~pi_pe_2006
//   รองประธาน        ปาล์มมี่ (ปาลิตา)   ~palmy2007
//   รองประธาน        ใบเตย (มนัสนันท์)   ~manussanan8650
//   เลขานุการ        พิมพ์ (พิมพ์พันธ์)   โทร 0840029407  (ไม่มีลิงก์ LINE)
//   สื่อสารองค์กร     บิงโก (วีร์ทิวัตถ์)   https://line.me/ti/p/jN0mw_cs_H
//   พัฒนาคุณภาพชีวิต  เสท (เสฏพันธ์)     โทร 0857166959  (ไม่มีลิงก์ LINE)
//   วิชาการ          นาย (นรรัตน์)       ~nine_sk143
//   กิจการภายใน      อิ่ม (กชพร)         ~kodchaportongmaleewe
//   การเงิน          เค้ก (คัคณาง)       โทร 0893587655  (⚠️ ยังไม่มีลิงก์ LINE)

export type Contact = {
  buttonLabel: string; // ข้อความบนปุ่ม <= 20 ตัวอักษร
  profileUrl: string; // ลิงก์โปรไฟล์ LINE
};

export type RouteInfo = {
  label: string; // ชื่อฝ่าย (โชว์ในข้อความ)
  note?: string; // ข้อความเสริมต่อท้าย (ผู้ติดต่อสำรอง / เบอร์โทรของคนที่ไม่มีลิงก์)
  contacts: Contact[]; // ปุ่มโปรไฟล์ (1-4 ปุ่ม)
};

export const ROUTING: Record<string, RouteInfo> = {
  การเงิน: {
    label: "ฝ่ายการเงิน",
    // ⚠️ เค้ก (หัวหน้าการเงิน) ให้มาแต่เบอร์ ยังไม่มีลิงก์ LINE -> โชว์เบอร์ + ปุ่มชี้ประธานไว้ก่อน
    note: "ฝ่ายการเงินคือเค้ก โทร. 0893587655 🙏",
    contacts: [
      { buttonLabel: "ทักประธานรุ่น", profileUrl: "https://line.me/ti/p/~pi_pe_2006" },
    ],
  },
  วิชาการ: {
    label: "ฝ่ายวิชาการ",
    contacts: [
      { buttonLabel: "ทักฝ่ายวิชาการ", profileUrl: "https://line.me/ti/p/~nine_sk143" }, // นาย
    ],
  },
  กิจกรรม: {
    label: "ฝ่ายกิจกรรม",
    note: "หรือฝ่ายพัฒนาคุณภาพชีวิต (เสท) โทร. 0857166959",
    contacts: [
      { buttonLabel: "ทักฝ่ายกิจกรรม", profileUrl: "https://line.me/ti/p/~kodchaportongmaleewe" }, // อิ่ม
    ],
  },
  อื่นๆ: {
    label: "ประธานรุ่น",
    note: "ถ้าประธานไม่ว่าง ทักรองประธาน (ปาล์มมี่/ใบเตย) ได้เลย เลขาฯ พิมพ์ โทร. 0840029407",
    contacts: [
      { buttonLabel: "ทักประธาน", profileUrl: "https://line.me/ti/p/~pi_pe_2006" }, // ไปร์ท
      { buttonLabel: "รองฯ ปาล์มมี่", profileUrl: "https://line.me/ti/p/~palmy2007" }, // ปาล์มมี่
      { buttonLabel: "รองฯ ใบเตย", profileUrl: "https://line.me/ti/p/~manussanan8650" }, // ใบเตย
      { buttonLabel: "ทักฝ่ายสื่อสาร", profileUrl: "https://line.me/ti/p/jN0mw_cs_H" }, // บิงโก
    ],
  },
};

// เลือกปลายทางจากหมวดที่ Gemini ส่งมา — ไม่รู้จักหมวด -> "อื่นๆ"
export function resolveRoute(category: string): RouteInfo {
  return ROUTING[category.trim()] ?? ROUTING["อื่นๆ"];
}
