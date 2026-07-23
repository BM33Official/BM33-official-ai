// จับคู่สิ่งที่ผู้ใช้พิมพ์ (ชื่อ + 3 หลักท้ายรหัส นศ.) กับทะเบียนรุ่น BC_roster
// รองรับหัวคอลัมน์หลายแบบ: student_id, full_name (thai/eng), nickname (thai/eng)
import { readTable, SheetRow } from "@/lib/google-sheets";
import { RosterEntry } from "@/lib/bc/types";

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
function nameSim(a: string, b: string): number {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

const digits = (s: string) => String(s ?? "").replace(/\D/g, "");

// ดึงค่าจาก row ตาม regex ของชื่อหัวคอลัมน์ (ยืดหยุ่นกับหัวไทย/อังกฤษ)
function pick(row: SheetRow, re: RegExp): string {
  for (const k of Object.keys(row)) if (k !== "__row" && re.test(k)) {
    const v = String(row[k] ?? "").trim();
    if (v) return v;
  }
  return "";
}
// ค่าทุกคอลัมน์ที่เป็น "ชื่อ" (ไทย/อังกฤษ/ชื่อเล่น) สำหรับการจับคู่
function allNames(row: SheetRow): string[] {
  return Object.keys(row)
    .filter((k) => k !== "__row" && /name|ชื่อ|nickname|เล่น/i.test(k))
    .map((k) => String(row[k] ?? "").trim())
    .filter(Boolean);
}

function toEntry(row: SheetRow): RosterEntry {
  return {
    __row: row.__row,
    student_id: pick(row, /^student_id$|student.?id|รหัส/i) || String(row.student_id ?? ""),
    full_name: pick(row, /full.?name.*thai|ชื่อ.?-?.?สกุล|^full_name$/i) || pick(row, /full.?name/i),
    nickname: pick(row, /nickname.*thai|ชื่อเล่น/i) || pick(row, /nickname/i),
    notes: pick(row, /notes|หมายเหตุ/i),
  };
}

// roster เปลี่ยนน้อยมาก + ถูกอ่านหลายรอบต่อ render (ranking + หน้า) → cache สั้น กัน rate-limit
let _rosterCache: { rows: RosterEntry[]; at: number } | null = null;
export async function readRoster(): Promise<RosterEntry[]> {
  if (_rosterCache && Date.now() - _rosterCache.at < 30_000) return _rosterCache.rows;
  const raw = await readTable("BC_roster");
  const rows = raw.map(toEntry);
  _rosterCache = { rows, at: Date.now() };
  return rows;
}

export interface MatchResult {
  match: RosterEntry | null;
  candidates: RosterEntry[];
  ambiguous: boolean;
}

export async function matchRoster(claimedName: string, last3: string): Promise<MatchResult> {
  const raw = await readTable("BC_roster");
  const l3 = last3.replace(/\D/g, "").slice(-3);
  const rawCands = raw.filter((r) => digits(pick(r, /^student_id$|student.?id|รหัส/i) || String(r.student_id ?? "")).slice(-3) === l3);
  const candidates = rawCands.map(toEntry);

  if (candidates.length === 0) return { match: null, candidates: [], ambiguous: false };
  if (candidates.length === 1) return { match: candidates[0], candidates, ambiguous: false };

  // 3 หลักซ้ำ — ใช้ชื่อช่วยแยก (เทียบทุกคอลัมน์ชื่อ ไทย/อังกฤษ/เล่น)
  const scored = rawCands
    .map((r, i) => ({ entry: candidates[i], sim: Math.max(0, ...allNames(r).map((n) => nameSim(claimedName, n))) }))
    .sort((a, b) => b.sim - a.sim);
  const top = scored[0], second = scored[1];
  if (top.sim >= 0.4 && (!second || top.sim - second.sim >= 0.15)) {
    return { match: top.entry, candidates, ambiguous: false };
  }
  return { match: null, candidates, ambiguous: true };
}
