// รูปที่อัปโหลดจาก control center (แนบไปกับข้อความ LINE) — เก็บใน BC_media เป็น base64 แบ่งชิ้นละ ≤45,000 ตัวอักษร
// (เซลล์ชีตรับได้ 50,000) แล้วเสิร์ฟที่ /api/media/<id>.jpg (https สาธารณะ ตามที่ LINE ต้องการ · CDN cache ถาวร)
import { appendRecords, nowISO } from "@/lib/bc/sheets";
import { batchGet } from "@/lib/google-sheets";
import { TABS } from "@/lib/bc/types";

const PART = 45_000;
export const MEDIA_MAX_BYTES = 1_000_000; // LINE: รูปพรีวิว ≤ 1MB (เราใช้ไฟล์เดียวกันทั้งรูปเต็มและพรีวิว)

export async function saveMedia(base64: string, mime: string): Promise<string> {
  if (!/^image\/(jpeg|png)$/.test(mime)) throw new Error("รองรับเฉพาะ JPEG/PNG");
  const clean = base64.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  const bytes = Math.floor((clean.length * 3) / 4);
  if (bytes > MEDIA_MAX_BYTES) throw new Error("รูปใหญ่เกิน 1MB — ลองรูปที่เล็กลง");
  const id = `img${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const at = nowISO();
  const rows: Record<string, string>[] = [];
  for (let i = 0, p = 0; i < clean.length; i += PART, p++) rows.push({ id, part: String(p), mime, data: clean.slice(i, i + PART), created_at: at });
  await appendRecords("media", rows);
  return `${id}.${mime === "image/png" ? "png" : "jpg"}`;
}

// อ่านรูปตาม id: อ่านคอลัมน์ id ก่อน (เล็ก) แล้วดึงเฉพาะแถวของรูปนั้น
const _mem = new Map<string, { mime: string; buf: Buffer }>();
export async function readMedia(id: string): Promise<{ mime: string; buf: Buffer } | null> {
  if (!/^img[a-z0-9]{6,20}$/.test(id)) return null;
  const hit = _mem.get(id);
  if (hit) return hit;
  const [ids] = await batchGet([`'${TABS.media}'!A2:C`]);
  const rows: { row: number; part: number; mime: string }[] = [];
  (ids ?? []).forEach((r, i) => { if (r[0] === id) rows.push({ row: i + 2, part: Number(r[1]) || 0, mime: r[2] || "image/jpeg" }); });
  if (!rows.length) return null;
  rows.sort((a, b) => a.part - b.part);
  const parts = await batchGet(rows.map((r) => `'${TABS.media}'!D${r.row}`));
  const b64 = parts.map((p) => p?.[0]?.[0] ?? "").join("");
  const out = { mime: rows[0].mime, buf: Buffer.from(b64, "base64") };
  if (_mem.size > 30) _mem.clear();
  _mem.set(id, out);
  return out;
}
