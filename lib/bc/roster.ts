// จับคู่สิ่งที่ผู้ใช้พิมพ์ (ชื่อ + 3 หลักท้ายรหัส นศ.) กับทะเบียนรุ่น BC_roster
//
// BC_roster ถูกกรอกมือ หัวคอลัมน์ไม่ตรงกับเนื้อหาจริง (เช่นคอลัมน์ "full_name" เก็บคำนำหน้า "นางสาว")
// จึง "ดูเนื้อหา" ของแต่ละคอลัมน์เพื่อตัดสินบทบาท: รหัส / คำนำหน้า / ชื่อไทย / ชื่ออังกฤษ /
// ชื่อเล่นไทย / ชื่อเล่นอังกฤษ / LINE ID / Instagram
import { SheetRow } from "@/lib/google-sheets";
import { RosterEntry } from "@/lib/bc/types";
import { readKey, readKeyFresh } from "@/lib/bc/sheets";

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
export function nameSim(a: string, b: string): number {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

const digits = (s: string) => String(s ?? "").replace(/\D/g, "");
const PREFIX = /^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|ms\.?|mrs\.?|miss)$/i;
const THAI = /[฀-๿]/;

type Role = "sid" | "prefix" | "th" | "en" | "nickTh" | "nickEn" | "line" | "ig" | "notes";

// ตัดสินบทบาทของแต่ละคอลัมน์จาก header + เนื้อหา (ทำครั้งเดียวต่อทั้งตาราง)
function detectColumns(rows: SheetRow[]): Map<string, Role> {
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r).filter((k) => k !== "__row"))));
  const roles = new Map<string, Role>();
  const vals = (h: string) => rows.map((r) => String(r[h] ?? "").trim()).filter(Boolean);
  const share = (h: string, fn: (v: string) => boolean) => {
    const v = vals(h);
    return v.length ? v.filter(fn).length / v.length : 0;
  };
  const taken = new Set<Role>();
  const assign = (h: string, role: Role) => { if (!roles.has(h) && !taken.has(role)) { roles.set(h, role); taken.add(role); } };

  // 1) ชัดจากเนื้อหา/หัว
  for (const h of headers) if (/student.?id|รหัส/i.test(h) || share(h, (v) => /^\d{8,12}$/.test(digits(v)) && digits(v).length === v.replace(/\s/g, "").length) > 0.8) assign(h, "sid");
  for (const h of headers) if (share(h, (v) => PREFIX.test(v)) > 0.8) assign(h, "prefix");
  for (const h of headers) if (/nick.*(thai|th\b)|ชื่อเล่น/i.test(h)) assign(h, "nickTh");
  for (const h of headers) if (/nick.*(eng|en\b)/i.test(h)) assign(h, "nickEn");
  for (const h of headers) if (/line/i.test(h)) assign(h, "line");
  for (const h of headers) if (/insta|^ig$/i.test(h)) assign(h, "ig");
  // 2) ชื่อเต็ม: ส่วนใหญ่มีช่องว่าง (ชื่อ + นามสกุล)
  for (const h of headers) if (!roles.has(h) && share(h, (v) => THAI.test(v) && /\S\s+\S/.test(v)) > 0.7) assign(h, "th");
  for (const h of headers) if (!roles.has(h) && share(h, (v) => /^[A-Za-z.'\- ]+$/.test(v) && /\S\s+\S/.test(v)) > 0.7) assign(h, "en");
  // 3) ชื่อเล่นที่หัวเขียนแค่ "nickname" (คำเดียว)
  for (const h of headers) if (!roles.has(h) && /nick|เล่น/i.test(h) && share(h, (v) => !/\s/.test(v)) > 0.7) assign(h, THAI.test(vals(h)[0] ?? "") ? "nickTh" : "nickEn");
  for (const h of headers) if (!roles.has(h) && /note|หมายเหตุ/i.test(h)) assign(h, "notes");
  return roles;
}

export function toEntries(raw: SheetRow[]): RosterEntry[] {
  const roles = detectColumns(raw);
  const col = (role: Role) => Array.from(roles.entries()).find(([, r]) => r === role)?.[0];
  const get = (row: SheetRow, role: Role) => { const h = col(role); return h ? String(row[h] ?? "").trim() : ""; };
  return raw
    .map((row) => {
      const th = get(row, "th");
      const en = get(row, "en");
      const nickTh = get(row, "nickTh");
      const nickEn = get(row, "nickEn");
      return {
        __row: row.__row,
        student_id: digits(get(row, "sid")),
        full_name: th || en,
        nickname: nickTh || nickEn || (th ? th.split(/\s+/)[0] : ""),
        notes: get(row, "notes"),
        prefix: get(row, "prefix"),
        name_en: en,
        nickname_en: nickEn,
        line_id: get(row, "line"),
        instagram: get(row, "ig"),
      };
    })
    .filter((e) => e.student_id);
}

export async function readRoster(force = false): Promise<RosterEntry[]> {
  const raw = force ? await readKeyFresh("roster") : await readKey("roster");
  return toEntries(raw);
}

export async function rosterById(): Promise<Map<string, RosterEntry>> {
  return new Map((await readRoster()).map((r) => [r.student_id, r]));
}

// ชื่อที่ใช้เรียก (ชื่อเล่น > ชื่อจริง > รหัส)
export function displayOf(r: RosterEntry | undefined, fallback = ""): string {
  return r?.nickname || r?.full_name || fallback;
}

export interface MatchResult {
  match: RosterEntry | null;
  candidates: RosterEntry[];
  ambiguous: boolean;
}

export async function matchRoster(claimedName: string, last3: string): Promise<MatchResult> {
  const roster = await readRoster();
  const l3 = last3.replace(/\D/g, "").slice(-3);
  const candidates = roster.filter((r) => r.student_id.slice(-3) === l3);

  if (candidates.length === 0) return { match: null, candidates: [], ambiguous: false };
  if (candidates.length === 1) return { match: candidates[0], candidates, ambiguous: false };

  // 3 หลักซ้ำ — ใช้ชื่อช่วยแยก (เทียบทุกชื่อ ไทย/อังกฤษ/เล่น)
  const names = (r: RosterEntry) => [r.full_name, r.name_en, r.nickname, r.nickname_en].filter(Boolean) as string[];
  const scored = candidates
    .map((entry) => ({ entry, sim: Math.max(0, ...names(entry).map((n) => nameSim(claimedName, n))) }))
    .sort((a, b) => b.sim - a.sim);
  const top = scored[0], second = scored[1];
  if (top.sim >= 0.4 && (!second || top.sim - second.sim >= 0.15)) {
    return { match: top.entry, candidates, ambiguous: false };
  }
  return { match: null, candidates, ambiguous: true };
}
