// มิเตอร์ค่าใช้จ่าย AI + งบรายเดือน — ทุกการเรียก Gemini ถูกบันทึกลง BC_usage
// โหมด: normal (< 80% ของงบ) · lean (80–100%: ค้นแคบลง ไม่ถามซ้ำ ไม่บรรยายรูป) · off (≥ 100%: ตอบเฉพาะแบบไม่ใช้ AI + การ์ดติดต่อ)
import { appendRows, readTable } from "@/lib/google-sheets";
import { TABS } from "@/lib/bc/types";
import { ensureBcTabs } from "@/lib/bc/sheets";
import { cached, bust } from "@/lib/cache";
import { getConfig } from "@/lib/bc/config";
import { bkkDayKey } from "@/lib/time";
import { log } from "@/lib/logger";

export interface Price { in: number; cached: number; out: number } // USD / 1M tokens
export const DEFAULT_PRICE: Price = { in: 0.5, cached: 0.05, out: 3 };

export async function price(): Promise<Price> {
  try {
    const raw = (await getConfig()).ai_price_json;
    if (raw) { const p = JSON.parse(raw); if (p.in >= 0 && p.out >= 0) return { in: +p.in, cached: +(p.cached ?? p.in / 10), out: +p.out }; }
  } catch { /* ใช้ค่าเริ่มต้น */ }
  return DEFAULT_PRICE;
}

export function costOf(p: Price, prompt: number, cachedTok: number, output: number): number {
  const fresh = Math.max(0, prompt - cachedTok);
  return (fresh * p.in + cachedTok * p.cached + output * p.out) / 1e6;
}

export async function recordUsage(u: { feature: string; model?: string; prompt?: number; cached?: number; output?: number; who?: string }): Promise<void> {
  try {
    const p = await price();
    const usd = costOf(p, u.prompt ?? 0, u.cached ?? 0, u.output ?? 0);
    await ensureBcTabs();
    await appendRows(`'${TABS.usage}'!A1`, [[new Date().toISOString(), u.feature, u.model ?? "", u.prompt ?? 0, u.cached ?? 0, u.output ?? 0, usd.toFixed(6), u.who ?? ""]]);
    bust("usage");
  } catch (err) {
    log.warn("usage_record_failed", { message: String(err).slice(0, 160) });
  }
}

export interface UsageRow { ts: string; feature: string; model: string; prompt: number; cached: number; output: number; usd: number; who: string }

// ข้อมูลเดือนนี้ (cache 90 วิ)
export async function monthUsage(): Promise<UsageRow[]> {
  return cached("ai:usage:month", ["usage"], 90, async () => {
    await ensureBcTabs();
    const month = bkkDayKey().slice(0, 7);
    const rows = await readTable(TABS.usage, "H");
    return rows
      .map((r) => ({ ts: String(r.ts), feature: String(r.feature), model: String(r.model), prompt: +r.prompt || 0, cached: +r.cached || 0, output: +r.output || 0, usd: +r.usd || 0, who: String(r.who ?? "") }))
      .filter((r) => bkkDayKey(new Date(r.ts).getTime()).slice(0, 7) === month);
  });
}

export type BudgetMode = "normal" | "lean" | "off";
export interface BudgetState {
  budget: number; spent: number; pct: number; mode: BudgetMode; projected: number;
  today: number; calls: number; byFeature: Record<string, { usd: number; calls: number }>; byDay: { day: string; usd: number }[];
  avgAnswer: number; cap: number;
}

export async function budgetState(): Promise<BudgetState> {
  const [rows, cfg] = await Promise.all([monthUsage().catch(() => [] as UsageRow[]), getConfig().catch(() => ({} as Record<string, string>))]);
  const budget = Number(cfg.ai_budget_usd) > 0 ? Number(cfg.ai_budget_usd) : 10;
  const cap = Number(cfg.ai_user_daily_cap) > 0 ? Number(cfg.ai_user_daily_cap) : 30;
  const spent = rows.reduce((a, r) => a + r.usd, 0);
  const todayKey = bkkDayKey();
  const byFeature: Record<string, { usd: number; calls: number }> = {};
  const byDayMap = new Map<string, number>();
  for (const r of rows) {
    const f = (byFeature[r.feature] ??= { usd: 0, calls: 0 });
    f.usd += r.usd; f.calls++;
    const d = bkkDayKey(new Date(r.ts).getTime());
    byDayMap.set(d, (byDayMap.get(d) ?? 0) + r.usd);
  }
  const now = new Date(Date.now() + 7 * 3600_000);
  const day = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const projected = day > 0 ? (spent / day) * daysInMonth : spent;
  const pct = budget ? spent / budget : 0;
  const mode: BudgetMode = pct >= 1 ? "off" : pct >= 0.8 ? "lean" : "normal";
  const ans = byFeature.answer;
  return {
    budget, spent, pct, mode, projected, today: byDayMap.get(todayKey) ?? 0, calls: rows.length, byFeature,
    byDay: [...byDayMap].sort((a, b) => a[0].localeCompare(b[0])).map(([d, usd]) => ({ day: d, usd })),
    avgAnswer: ans ? ans.usd / ans.calls : 0, cap,
  };
}

// คำถามของคนนี้วันนี้ (กันคนเดียวใช้งบหมด)
export async function userCallsToday(who: string): Promise<number> {
  if (!who) return 0;
  const today = bkkDayKey();
  return (await monthUsage().catch(() => [])).filter((r) => r.who === who && r.feature === "answer" && bkkDayKey(new Date(r.ts).getTime()) === today).length;
}
