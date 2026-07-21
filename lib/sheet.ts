// ดึง + cache FAQ CSV จาก Google Sheet (public "Publish to web" CSV URL)
// cache 60 วิ — แก้คำตอบในชีตแล้วรอสูงสุด 60 วิ ไม่ต้อง deploy ใหม่

let cache: { text: string; at: number } | null = null;

export async function getFaqText(): Promise<string> {
  if (cache && Date.now() - cache.at < 60_000) return cache.text;
  const res = await fetch(process.env.SHEET_CSV_URL!, { cache: "no-store" });
  if (!res.ok) throw new Error(`sheet ${res.status}`);
  const text = await res.text();
  cache = { text, at: Date.now() };
  return text;
}

// ใช้ตอน fetch ชีตล้ม — คืน CSV ล่าสุดที่ cache ไว้ (ถ้ามี)
export function getCachedFaqText(): string | null {
  return cache?.text ?? null;
}
