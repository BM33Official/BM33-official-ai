// ความคืบหน้าเซียมซีของแต่ละคน (BC_fortunes) — การสุ่มทำในเครื่อง (ลื่น ไม่รอเน็ต)
// แอปซิงก์เป็นระยะ: รวมสมุดสะสมแบบ OR (ไม่มีทางหายแม้เปลี่ยนเครื่อง)
import { readKey, readKeyFresh, upsertWhere, nowISO, digits } from "@/lib/bc/sheets";
import { FortuneRec } from "@/lib/bc/types";
import { decodeBits, encodeBits, orBits, countBits, TIER_RANK, TierKey } from "@/lib/fortunes/data";

export interface FortuneState {
  pulls: number;
  collected: string;
  streak: number;
  last_day: string;
  best: string;
  pity: number;
  jackpot_at: string;
  jackpots: number;
}

function toState(r?: FortuneRec | null): FortuneState {
  return {
    pulls: Number(r?.pulls) || 0,
    collected: r?.collected || "",
    streak: Number(r?.streak) || 0,
    last_day: r?.last_day || "",
    best: r?.best || "",
    pity: Number(r?.pity) || 0,
    jackpot_at: r?.jackpot_at || "",
    jackpots: Number(r?.jackpots) || 0,
  };
}

export async function getFortune(studentId: string): Promise<FortuneState> {
  const sid = digits(studentId);
  const r = (await readKey<FortuneRec>("fortunes")).find((x) => digits(x.student_id) === sid);
  return toState(r);
}

export async function syncFortune(studentId: string, client: Partial<FortuneState>): Promise<FortuneState> {
  const sid = digits(studentId);
  if (!sid) throw new Error("no student");
  const cur = toState((await readKeyFresh<FortuneRec>("fortunes")).find((x) => digits(x.student_id) === sid));
  const bits = orBits(decodeBits(cur.collected), decodeBits(String(client.collected ?? "")));
  const clientNewer = String(client.last_day ?? "") >= cur.last_day;
  const bestOf = (a: string, b: string) =>
    (TIER_RANK[a as TierKey] ?? -1) >= (TIER_RANK[b as TierKey] ?? -1) ? a : b;
  const merged: FortuneState = {
    pulls: Math.max(cur.pulls, Math.min(1_000_000, Number(client.pulls) || 0)),
    collected: encodeBits(bits),
    streak: clientNewer ? Math.min(3650, Number(client.streak) || 0) : cur.streak,
    last_day: clientNewer ? String(client.last_day ?? "") : cur.last_day,
    best: bestOf(cur.best, String(client.best ?? "")),
    pity: clientNewer ? Math.max(0, Number(client.pity) || 0) : cur.pity,
    jackpot_at: String(client.jackpot_at ?? "") > cur.jackpot_at && !isNaN(Date.parse(String(client.jackpot_at))) && Date.parse(String(client.jackpot_at)) <= Date.now() + 60_000 ? String(client.jackpot_at) : cur.jackpot_at,
    jackpots: Math.max(cur.jackpots, Math.min(10_000, Number(client.jackpots) || 0)),
  };
  const newJackpot = merged.jackpot_at !== cur.jackpot_at;
  const unchanged = !newJackpot && merged.pulls === cur.pulls && merged.collected === cur.collected && merged.streak === cur.streak && merged.last_day === cur.last_day;
  if (!unchanged) {
    await upsertWhere("fortunes", (r) => digits(r.student_id) === sid, {
      student_id: sid,
      pulls: String(merged.pulls),
      collected: merged.collected,
      streak: String(merged.streak),
      last_day: merged.last_day,
      best: merged.best,
      pity: String(merged.pity),
      updated_at: nowISO(),
      jackpot_at: merged.jackpot_at,
      jackpots: String(merged.jackpots),
    });
  }
  // แจ็กพอตใหม่ -> รีเซ็ต Jackpot Pool (ยอดสะสมทั้งรุ่นเริ่มนับใหม่)
  if (newJackpot) {
    const total = (await readKeyFresh<FortuneRec>("fortunes")).reduce((a, r) => a + (Number(r.pulls) || 0), 0);
    const { setConfig } = await import("@/lib/bc/config");
    await setConfig("fortune_pool_base", String(total), `jackpot ${sid}`).catch(() => {});
  }
  return merged;
}

// สถิติรวมของรุ่น (ไม่ระบุตัวตน) — ให้หน้าเซียมซีมี "บรรยากาศร่วม"
export async function fortuneStats(): Promise<{ players: number; pulls: number; topCollected: number }> {
  const rows = await readKey<FortuneRec>("fortunes");
  let pulls = 0, top = 0;
  for (const r of rows) {
    pulls += Number(r.pulls) || 0;
    top = Math.max(top, countBits(decodeBits(r.collected)));
  }
  return { players: rows.length, pulls, topCollected: top };
}

// หอเกียรติยศวันนี้ + Jackpot Pool (สาธารณะในรุ่น: ชื่อเล่นคนแตกแจ็กพอตวันนี้ ตามที่ผู้ใช้ขอ)
export async function fortuneBoard(today: string, nickOf: (sid: string) => string, poolBase: number) {
  const rows = await readKey<FortuneRec>("fortunes");
  const dayOf = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const jackpots = rows
    .filter((r) => r.jackpot_at && dayOf(r.jackpot_at) === today)
    .map((r) => ({ name: nickOf(digits(r.student_id)), at: r.jackpot_at! }))
    .sort((a, b) => b.at.localeCompare(a.at));
  const total = rows.reduce((a, r) => a + (Number(r.pulls) || 0), 0);
  return { jackpots, pool: Math.max(0, total - poolBase), players: rows.length, total };
}
