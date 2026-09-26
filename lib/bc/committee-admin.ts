// บันทึกรายชื่อกรรมการจากหน้า "ตั้งค่า" (เขียนทับทั้งตารางแบบไม่ลบแถว: แถวเกินจะถูกล้างค่า)
import { readKeyFresh, appendRecords, nowISO, digits } from "@/lib/bc/sheets";
import { batchUpdateRanges, colLetter } from "@/lib/google-sheets";
import { TABS, HEADERS, CommitteeRec } from "@/lib/bc/types";
import { bust } from "@/lib/cache";

export async function saveCommittee(rows: { student_id: string; nickname: string; role: string; contact_url: string }[]): Promise<number> {
  const clean = rows
    .map((r, i) => ({
      student_id: digits(r.student_id),
      nickname: String(r.nickname ?? "").trim(),
      role: String(r.role ?? "").trim(),
      contact_url: String(r.contact_url ?? "").trim(),
      sort: String(i + 1),
      updated_at: nowISO(),
    }))
    .filter((r) => r.nickname || r.student_id);
  const existing = await readKeyFresh<CommitteeRec>("committee");
  const headers = HEADERS.committee;
  const last = colLetter(headers.length);
  const updates: { range: string; values: string[][] }[] = [];
  existing.forEach((e, i) => {
    const rec = clean[i];
    updates.push({
      range: `'${TABS.committee}'!A${e.__row}:${last}${e.__row}`,
      values: [headers.map((h) => (rec ? (rec as Record<string, string>)[h] ?? "" : ""))],
    });
  });
  await batchUpdateRanges(updates);
  if (clean.length > existing.length) await appendRecords("committee", clean.slice(existing.length));
  bust("bc");
  return clean.length;
}
