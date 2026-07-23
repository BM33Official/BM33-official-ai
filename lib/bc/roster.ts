// จับคู่สิ่งที่ผู้ใช้พิมพ์ (ชื่อ + 3 หลักท้ายรหัส นศ.) กับทะเบียนรุ่น BC_roster
import { readTab } from "@/lib/bc/sheets";
import { TABS, RosterEntry } from "@/lib/bc/types";

function norm(s: string): string {
  return (s ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "").trim();
}
function trigrams(s: string): Set<string> {
  const t = norm(s);
  const g = new Set<string>();
  if (t.length < 3) { if (t) g.add(t); return g; }
  for (let i = 0; i + 3 <= t.length; i++) g.add(t.slice(i, i + 3));
  return g;
}
// ความคล้ายชื่อ 0..1 (Jaccard ของ trigram)
function nameSim(a: string, b: string): number {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

export async function readRoster(): Promise<RosterEntry[]> {
  return readTab<RosterEntry>(TABS.roster);
}

export interface MatchResult {
  match: RosterEntry | null; // เจอชัดตัวเดียว
  candidates: RosterEntry[]; // ตัวเลือกที่ 3 หลักท้ายตรง
  ambiguous: boolean; // 3 หลักตรงหลายคน + ชื่อแยกไม่ชัด
}

// หา 3 หลักท้ายตรงก่อน แล้วใช้ชื่อช่วยแยกถ้าซ้ำ
export async function matchRoster(claimedName: string, last3: string): Promise<MatchResult> {
  const roster = await readRoster();
  const l3 = last3.replace(/\D/g, "").slice(-3);
  const candidates = roster.filter((r) => {
    const id = String(r.student_id).replace(/\D/g, "");
    return id.slice(-3) === l3;
  });

  if (candidates.length === 0) return { match: null, candidates: [], ambiguous: false };
  if (candidates.length === 1) return { match: candidates[0], candidates, ambiguous: false };

  // หลายคน 3 หลักตรง — ใช้ชื่อช่วย
  const scored = candidates
    .map((r) => ({
      r,
      sim: Math.max(nameSim(claimedName, r.full_name), nameSim(claimedName, r.nickname)),
    }))
    .sort((a, b) => b.sim - a.sim);

  const top = scored[0];
  const second = scored[1];
  // ชัดเมื่อชื่อคล้ายพอ และห่างจากอันดับสองพอสมควร
  if (top.sim >= 0.4 && (!second || top.sim - second.sim >= 0.15)) {
    return { match: top.r, candidates, ambiguous: false };
  }
  return { match: null, candidates, ambiguous: true };
}
