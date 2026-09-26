// cache สองชั้นสำหรับข้อมูลจาก Google Sheets
//   1) Next.js Data Cache (unstable_cache) — แชร์ข้ามทุก instance บน Vercel
//      -> 100 คนเปิดแอปพร้อมกัน ก็ยังอ่านชีตแค่ ~1 ครั้งต่อรอบ revalidate
//   2) in-memory ต่อ instance — กันเรียก Data Cache ซ้ำในคำขอเดียวกัน
// เขียนข้อมูลเมื่อไร ให้เรียก bust(tag) -> ทุกหน้าเห็นข้อมูลใหม่ในคำขอถัดไป
//
// นอก runtime ของ Next (เช่น scripts/*.ts) unstable_cache ใช้ไม่ได้ -> ตกไปใช้ in-memory อย่างเดียว

import { unstable_cache, revalidateTag } from "next/cache";

type Entry = { v: unknown; at: number };
const mem = new Map<string, Entry>();
const memTags = new Map<string, Set<string>>();
const inflight = new Map<string, Promise<unknown>>();

// memo ต่อ instance สั้น ๆ (กัน Data Cache round-trip ซ้ำใน render เดียว)
const MEM_MS = 4_000;

export async function cached<T>(
  key: string,
  tags: string[],
  revalidateSec: number,
  fn: () => Promise<T>
): Promise<T> {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < Math.min(MEM_MS, revalidateSec * 1000)) return hit.v as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const p = (async () => {
    let v: T;
    try {
      v = await unstable_cache(fn, [key], { tags, revalidate: revalidateSec })();
    } catch (err) {
      if (!/incrementalCache missing|static generation store missing|Invariant/i.test(String((err as Error)?.message ?? err))) {
        // Data Cache ใช้ไม่ได้ชั่วคราว หรือ fn พังจริง -> ลองเรียกตรงอีกครั้ง
        try { v = await fn(); } catch (e2) {
          // สุดท้าย: ใช้ค่าเก่าใน memory ถ้ามี (ดีกว่าหน้าพัง)
          if (hit) return hit.v as T;
          throw e2;
        }
      } else {
        v = await fn();
      }
    }
    mem.set(key, { v, at: Date.now() });
    for (const t of tags) {
      if (!memTags.has(t)) memTags.set(t, new Set());
      memTags.get(t)!.add(key);
    }
    return v;
  })();
  inflight.set(key, p);
  try {
    return (await p) as T;
  } finally {
    inflight.delete(key);
  }
}

// ล้าง cache ตาม tag (หลังเขียนข้อมูล)
export function bust(...tags: string[]): void {
  for (const t of tags) {
    for (const k of memTags.get(t) ?? []) mem.delete(k);
    try { revalidateTag(t); } catch { /* นอก Next runtime */ }
  }
}
