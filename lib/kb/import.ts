// นำเข้าไฟล์ export แชต LINE เข้าแท็บ KB_แชตรุ่น (รวมกับของเดิม ไม่ซ้ำ) — ใช้ได้ทั้งจากสคริปต์และหน้า AI
import { ensureTabs, batchGet, clearRange, appendRows } from "@/lib/google-sheets";
import { parseLineExport, ChatMsg } from "@/lib/kb/linechat";
import { KB_CHAT_TAB, KB_CHAT_HEADERS, resetCorpus } from "@/lib/ai/corpus";
import { bust } from "@/lib/cache";

export async function importChatExport(raw: string, source: string): Promise<{ parsed: number; added: number; total: number; from: string; to: string }> {
  const msgs = parseLineExport(raw, source);
  await ensureTabs([{ title: KB_CHAT_TAB, headers: KB_CHAT_HEADERS }]);
  const [grid] = await batchGet([`'${KB_CHAT_TAB}'!A2:E`]);
  const existing: ChatMsg[] = (grid ?? []).filter((r) => r[4]).map((r) => ({ date: r[0], time: r[1], source: r[2], sender: r[3], text: r[4] }));
  const k = (m: ChatMsg) => `${m.date}|${m.time}|${m.source}|${m.text.replace(/\s+/g, "").slice(0, 60)}`;
  const seen = new Set(existing.map(k));
  const fresh = msgs.filter((m) => !seen.has(k(m)));
  const all = [...existing, ...fresh].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  // เขียนทับทั้งแท็บ (ข้อความยาวเกิน 45K ตัวอักษรตัดทิ้งท้าย — ข้อจำกัดช่องของชีต)
  await clearRange(`'${KB_CHAT_TAB}'!A2:E`);
  const rows = all.map((m) => [m.date, m.time, m.source, m.sender, m.text.slice(0, 45000)]);
  for (let i = 0; i < rows.length; i += 1500) await appendRows(`'${KB_CHAT_TAB}'!A1`, rows.slice(i, i + 1500));
  bust("knowledge");
  resetCorpus();
  return { parsed: msgs.length, added: fresh.length, total: all.length, from: all[0]?.date ?? "", to: all.at(-1)?.date ?? "" };
}
