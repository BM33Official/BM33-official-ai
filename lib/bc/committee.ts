// กรรมการรุ่น (BC_committee) — ใช้ตัดสินว่า "ข้อความของใคร = ประกาศทางการ"
// + ปุ่มติดต่อในแอป/บอท. ถ้าแท็บว่าง ใช้รายชื่อตั้งต้นจากทำเนียบใน lib/routing.ts
import { readKey, appendRecords, nowISO, digits } from "@/lib/bc/sheets";
import { CommitteeRec } from "@/lib/bc/types";
import { readRoster } from "@/lib/bc/roster";

export interface CommitteeMember {
  student_id: string;
  nickname: string;
  role: string;
  contact_url: string;
  sort: number;
}

// ทำเนียบตั้งต้น (ปีที่ 2) — จับคู่กับทะเบียนด้วยชื่อจริง
const SEED: { first: string; nickname: string; role: string; contact?: string }[] = [
  { first: "ปิยังกูร", nickname: "ไปร์ท", role: "ประธานรุ่น", contact: "https://line.me/ti/p/~pi_pe_2006" },
  { first: "ปาลิตา", nickname: "ปาล์มมี่", role: "รองประธาน", contact: "https://line.me/ti/p/~palmy2007" },
  { first: "มนัสนันท์", nickname: "ใบเตย", role: "รองประธาน", contact: "https://line.me/ti/p/~manussanan8650" },
  { first: "พิมพ์พันธุ์", nickname: "พิมพ์", role: "เลขานุการ" },
  { first: "คัคณาง", nickname: "เค้ก", role: "ฝ่ายการเงิน" },
  { first: "นรัตน์", nickname: "นาย", role: "ฝ่ายวิชาการ", contact: "https://line.me/ti/p/~nine_sk143" },
  { first: "กชพร", nickname: "อิ่ม", role: "ฝ่ายกิจการภายใน", contact: "https://line.me/ti/p/~kodchaportongmaleewe" },
  { first: "เสฏฐพันธ์", nickname: "เสท", role: "ฝ่ายพัฒนาคุณภาพชีวิต" },
  { first: "วีร์ทิวัตถ์", nickname: "บิงโก", role: "ฝ่ายสื่อสารองค์กร", contact: "https://line.me/ti/p/jN0mw_cs_H" },
  { first: "รดา", nickname: "มิวสิค", role: "ฝ่ายเอกสารและฐานข้อมูล" },
];

function lineUrlFromId(id?: string): string {
  const v = (id ?? "").trim();
  // LINE ID ที่เป็นเบอร์โทรใช้ลิงก์ ~id ไม่ได้
  if (!v || /\d{8,}/.test(v.replace(/\D/g, "")) && !/[a-z]/i.test(v) || /[^\w.\-@]/.test(v)) return "";
  return `https://line.me/ti/p/~${encodeURIComponent(v)}`;
}

export async function readCommittee(): Promise<CommitteeMember[]> {
  const rows = await readKey<CommitteeRec>("committee");
  if (rows.length) {
    return rows
      .filter((r) => digits(r.student_id) || r.nickname)
      .map((r, i) => ({
        student_id: digits(r.student_id),
        nickname: r.nickname,
        role: r.role,
        contact_url: r.contact_url,
        sort: Number(r.sort) || i + 1,
      }))
      .sort((a, b) => a.sort - b.sort);
  }
  return seedFromRoster();
}

async function seedFromRoster(): Promise<CommitteeMember[]> {
  const roster = await readRoster();
  return SEED.map((s, i) => {
    const r = roster.find((x) => x.full_name.startsWith(s.first));
    return {
      student_id: r?.student_id ?? "",
      nickname: r?.nickname || s.nickname,
      role: s.role,
      contact_url: s.contact || lineUrlFromId(r?.line_id),
      sort: i + 1,
    };
  });
}

// เขียนรายชื่อตั้งต้นลงชีต (ครั้งแรก) — แอดมินแก้ต่อในหน้า "ตั้งค่า"
export async function seedCommitteeIfEmpty(): Promise<number> {
  const rows = await readKey<CommitteeRec>("committee");
  if (rows.length) return 0;
  const seed = await seedFromRoster();
  await appendRecords("committee", seed.map((c) => ({ ...c, sort: String(c.sort), updated_at: nowISO() })));
  return seed.length;
}

export async function committeeByStudent(): Promise<Map<string, CommitteeMember>> {
  return new Map((await readCommittee()).filter((c) => c.student_id).map((c) => [c.student_id, c]));
}

export async function president(): Promise<CommitteeMember | null> {
  const all = await readCommittee();
  return all.find((c) => /ประธาน/.test(c.role) && !/รอง/.test(c.role)) ?? all[0] ?? null;
}

export { lineUrlFromId };
