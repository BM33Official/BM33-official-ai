// เครื่องมือค้นข้อมูลอัจฉริยะ (hybrid retrieval)
// flow: ค้น current ก่อน -> ถ้าเจอชัด ตอบเลย (fast path, ประหยัด Gemini)
//       -> ถ้าไม่เจอ ใช้ keyword router เลือก archive -> ค้นเฉพาะแถวที่เกี่ยว
//       -> ambiguous จริง ๆ ค่อยใช้ Gemini router (ปิด/เปิดด้วย USE_GEMINI_ROUTER)
// สิทธิ์การเข้าถึงตัดสินด้วย "โค้ด" เสมอ ไม่ปล่อยให้ Gemini ตัดสิน

import { batchGet, resolveTitle } from "@/lib/google-sheets";
import {
  SOURCES,
  SourceId,
  PUBLIC_ARCHIVE_IDS,
  canAccess,
  isAdmin,
} from "@/lib/sources";
import { routeWithGemini } from "@/lib/gemini";
import { log } from "@/lib/logger";

export interface SheetRecord {
  sourceId: SourceId;
  rowNumber: number; // เลขแถวจริงในชีต
  header: string[];
  cells: string[];
}

export interface ScoredRecord extends SheetRecord {
  score: number;
  coverage: number; // สัดส่วน token ที่ match (0..1)
  dateISO: string; // yyyy-mm-dd ถ้าหาได้ ("" ถ้าไม่มี)
}

export interface RetrievalResult {
  records: ScoredRecord[];
  usedSources: SourceId[];
  deniedSources: SourceId[];
  intent: string;
  fastPath: boolean;
  selfLookup: { source: SourceId; matched: boolean } | null;
  cacheState: Partial<Record<SourceId, "hit" | "miss" | "stale">>;
  sheetsMs: number;
}

// ── normalization (Unicode-safe, รองรับไทย/อังกฤษ, คงเลข/วันที่/URL) ──────────
export function normalize(s: string): string {
  return (s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”"'`()[\]{}<>|]/g, " ")
    .replace(/[!?.,;:！？。，、…•·—–\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// token สำหรับ query: split ช่องว่าง + คงคำยาว >=2, ตัด particle ไทยที่พบบ่อย
const STOP = new Set([
  "ครับ","ค่ะ","คะ","นะ","น่ะ","จ๊ะ","จ้า","อ่ะ","อะ","เลย","ด้วย","แล้ว","ยัง",
  "ไหม","มั้ย","หรอ","เหรอ","ที่","ของ","ให้","ได้","เป็น","คือ","และ","กับ","จะ",
  "the","a","an","is","are","to","of","in","on","for","do","i",
]);
function tokenize(q: string): string[] {
  return normalize(q)
    .split(" ")
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

// header ไหนควรถ่วงน้ำหนักสูง (คำถาม/คำค้น/หัวข้อ/หมวด/ภาพรวม)
function colWeight(header: string): number {
  const h = normalize(header);
  if (/(คำถาม|คำค้น|คำสำคัญ|หัวข้อ|ภาพรวม|หมวด)/.test(h)) return 3;
  if (/(คำตอบ|ข้อความ|ประกาศ|url|ลิงก์|บริบท)/.test(h)) return 2;
  return 1;
}
function isDateHeader(header: string): boolean {
  return /(วันที่|วันเวลา|กำหนด|เดดไลน์|created)/.test(normalize(header));
}

function extractISO(s: string): string {
  const m = normalize(s).match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// ── query spec: n-gram (แก้ปัญหาภาษาไทยไม่มีช่องว่าง) + token + phrase ───────
// ภาษาไทยตัดคำด้วยช่องว่างไม่ได้ -> ใช้ character n-gram (3-gram) วัดความคล้าย
// เช่น "เงินรุ่นเดือนกรกฎาคมเท่าไหร่" จะ match "เงินรุ่นเดือนกรกฎาคมเท่าไร"
// ผ่าน 3-gram ที่ทับกันเยอะ แม้ท้ายคำต่างกันเล็กน้อย
const NGRAM = 3;
function ngrams(norm: string): string[] {
  const t = norm.replace(/\s+/g, "");
  if (t.length < NGRAM) return t ? [t] : [];
  const out: string[] = [];
  for (let i = 0; i + NGRAM <= t.length; i++) out.push(t.slice(i, i + NGRAM));
  return out;
}

export interface QuerySpec {
  grams: string[]; // 3-gram (unique) ของคำถาม
  tokens: string[]; // คำที่เว้นวรรค (อังกฤษ/เลข/คำเฉพาะ)
  phrase: string; // คำถามทั้งก้อน (ตัดช่องว่าง)
}
export function buildQuery(q: string): QuerySpec {
  const norm = normalize(q);
  return {
    grams: Array.from(new Set(ngrams(norm))),
    tokens: tokenize(q),
    phrase: norm.replace(/\s+/g, ""),
  };
}

// ── scoring ราย record ─────────────────────────────────────────────────────
function scoreRecord(rec: SheetRecord, qs: QuerySpec): ScoredRecord {
  let score = 0;
  let dateISO = "";
  const matchedGrams = new Set<string>();
  const colNoSpace = rec.cells.map((c) => normalize(c).replace(/\s+/g, ""));

  for (let i = 0; i < rec.cells.length; i++) {
    const header = rec.header[i] ?? "";
    if (!dateISO && isDateHeader(header)) dateISO = extractISO(rec.cells[i]);
    const text = colNoSpace[i];
    if (!text) continue;
    const w = colWeight(header);

    // phrase ทั้งก้อน = โบนัสสูง
    if (qs.phrase.length >= 4 && text.includes(qs.phrase)) score += 10 * w;

    // gram overlap ในคอลัมน์นี้
    let g = 0;
    for (const gram of qs.grams) {
      if (text.includes(gram)) { g++; matchedGrams.add(gram); }
    }
    if (qs.grams.length) score += (g / qs.grams.length) * w * 6;

    // token อังกฤษ/คำเฉพาะ (เช่น genetics, url)
    for (const tok of qs.tokens) if (tok.length >= 2 && text.includes(tok)) score += w * 0.5;
  }

  if (!dateISO) {
    for (let i = 0; i < rec.cells.length; i++) {
      const iso = extractISO(rec.cells[i]);
      if (iso) { dateISO = iso; break; }
    }
  }
  // recency tiebreak เล็กน้อย (ข้อมูลใหม่กว่าชนะเมื่อคะแนนเท่ากัน)
  if (dateISO) score += Math.min(0.9, (Number(dateISO.replace(/-/g, "")) - 20250000) / 1e7);

  const coverage = qs.grams.length ? matchedGrams.size / qs.grams.length : 0;
  return { ...rec, score, coverage, dateISO };
}

// ── cache ราย source + stale fallback (สูงสุด 10 นาทีตอน Sheets ล่ม) ─────────
interface CacheEntry { title: string; rows: string[][]; at: number }
const cache = new Map<SourceId, CacheEntry>();
const STALE_MAX_MS = 600_000;

// ดึงหลาย source พร้อมกัน (batchGet เฉพาะตัวที่ cache หมดอายุ)
async function fetchSources(
  ids: SourceId[]
): Promise<{ recs: Map<SourceId, SheetRecord[]>; state: Partial<Record<SourceId, "hit" | "miss" | "stale">>; ms: number }> {
  const t0 = Date.now();
  const state: Partial<Record<SourceId, "hit" | "miss" | "stale">> = {};
  const need: SourceId[] = [];

  for (const id of ids) {
    const c = cache.get(id);
    if (c && Date.now() - c.at < SOURCES[id].cacheMs) state[id] = "hit";
    else need.push(id);
  }

  // resolve title + build range สำหรับตัวที่ต้อง fetch
  const ranges: string[] = [];
  const rangeIds: SourceId[] = [];
  await Promise.all(
    need.map(async (id) => {
      const src = SOURCES[id];
      const title = await resolveTitle(src.match);
      if (!title) {
        log.warn("source_tab_not_found", { source: id, label: src.label });
        return;
      }
      ranges.push(`'${title}'!A${src.headerRow}:${src.lastCol}${src.lastRow}`);
      rangeIds.push(id);
      cache.get(id) && (cache.get(id)!.title = title);
      if (!cache.has(id)) cache.set(id, { title, rows: [], at: 0 });
      else cache.get(id)!.title = title;
    })
  );

  if (ranges.length > 0) {
    try {
      const results = await batchGet(ranges);
      results.forEach((rows, i) => {
        const id = rangeIds[i];
        cache.set(id, { title: cache.get(id)?.title ?? "", rows, at: Date.now() });
        state[id] = "miss";
      });
    } catch (err) {
      // Sheets ล่ม -> ใช้ stale cache ถ้ายังไม่เกิน 10 นาที
      for (const id of rangeIds) {
        const c = cache.get(id);
        if (c && c.rows.length && Date.now() - c.at < STALE_MAX_MS) state[id] = "stale";
        else log.error("source_fetch_failed", { source: id, message: String(err) });
      }
    }
  }

  // แปลง rows -> records (แถวแรก = header, ข้ามแถวว่าง)
  const recs = new Map<SourceId, SheetRecord[]>();
  for (const id of ids) {
    const c = cache.get(id);
    if (!c || c.rows.length === 0) { recs.set(id, []); continue; }
    const header = c.rows[0] ?? [];
    const out: SheetRecord[] = [];
    for (let r = 1; r < c.rows.length; r++) {
      const cells = c.rows[r] ?? [];
      if (cells.every((v) => !String(v ?? "").trim())) continue;
      out.push({
        sourceId: id,
        rowNumber: SOURCES[id].headerRow + r, // เลขแถวจริงในชีต
        header,
        cells,
      });
    }
    recs.set(id, out);
  }
  return { recs, state, ms: Date.now() - t0 };
}

// ── keyword router (ไม่ใช้ LLM) — คืน intent + sourceIds + confident ────────
interface RouteDecision { intent: string; sourceIds: SourceId[]; confident: boolean }

function keywordRoute(q: string): RouteDecision {
  const n = normalize(q);
  const first = /(ฉัน|เรา|ผม|หนู|ดิฉัน|กู|ตัวเอง|ของฉัน|ของเรา|ของผม|ของหนู|my|i )/.test(n);

  if (/(คิวประกาศ|queue|คิว ประกาศ)/.test(n))
    return { intent: "admin_announcement_queue", sourceIds: ["announcementQueue"], confident: true };
  if (/(ข้อความดิบ|ข้อความทั้งหมด|raw message|chat log|log ข้อความ)/.test(n))
    return { intent: "admin_raw_messages", sourceIds: ["rawMessages"], confident: true };

  if (first && /(จ่าย|ชำระ|เงินรุ่น|ค้าง|ยอด|โอน|สลิป|หลักฐาน)/.test(n))
    return { intent: "self_finance", sourceIds: ["finance"], confident: true };
  if (first && /(ชื่ออะไร|คือใคร|โปรไฟล์|ข้อมูลสมาชิก|เลขที่|รหัสนักศึกษา|ในระบบ)/.test(n))
    return { intent: "self_member", sourceIds: ["members"], confident: true };

  if (/(ลิงก์|link|ฟอร์ม|form|แบบฟอร์ม|เอกสาร|ไฟล์|drive|สไลด์|slide|url)/.test(n))
    return { intent: "resource_link", sourceIds: ["linkArchive", "historyIndex"], confident: true };

  const pastTime =
    /(ปีที่แล้ว|ที่ผ่านมา|เมื่อ|ตอน|ก่อนหน้า|256[0-9]|20(1[5-9]|2[0-6])|ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?|มกรา|กุมภา|มีนา|เมษา|พฤษภา|มิถุนา|กรกฎา|สิงหา|กันยา|ตุลา|พฤศจิกา|ธันวา)/.test(n);
  const announcement = /(ประกาศ|เดดไลน์|กำหนดการ|deadline|วันสุดท้าย)/.test(n);

  if (announcement || pastTime)
    return {
      intent: announcement ? "historical_announcement" : "historical_knowledge",
      sourceIds: ["historyIndex", "announcementArchive", "knowledgeArchive"],
      confident: pastTime || announcement,
    };

  // ไม่ชัด — ให้ layer บนตัดสินใจ (Gemini router หรือ default archives)
  return { intent: "unknown", sourceIds: [], confident: false };
}

// เลือก top records: ≤8 ต่อ source, ≤12 รวม, เรียงตามคะแนน->ความใหม่
function topRecords(scored: ScoredRecord[], perSource = 8, total = 12): ScoredRecord[] {
  const bySource = new Map<SourceId, ScoredRecord[]>();
  for (const r of scored) {
    if (r.score <= 0) continue;
    const arr = bySource.get(r.sourceId) ?? [];
    arr.push(r);
    bySource.set(r.sourceId, arr);
  }
  const picked: ScoredRecord[] = [];
  for (const arr of bySource.values()) {
    arr.sort((a, b) => b.score - a.score || b.dateISO.localeCompare(a.dateISO));
    picked.push(...arr.slice(0, perSource));
  }
  picked.sort((a, b) => b.score - a.score || b.dateISO.localeCompare(a.dateISO));
  return picked.slice(0, total);
}

// ── main ────────────────────────────────────────────────────────────────────
export async function retrieve(
  question: string,
  userId: string | undefined
): Promise<RetrievalResult> {
  const qs = buildQuery(question);
  const admin = isAdmin(userId);
  const cacheState: Partial<Record<SourceId, "hit" | "miss" | "stale">> = {};
  let sheetsMs = 0;

  // 1) ค้น current ก่อนเสมอ (fast path)
  const cur = await fetchSources(["current"]);
  Object.assign(cacheState, cur.state);
  sheetsMs += cur.ms;
  const curScored = (cur.recs.get("current") ?? [])
    .map((r) => scoreRecord(r, qs))
    .sort((a, b) => b.score - a.score);
  const best = curScored[0];

  // 2) เลือก source ด้วย keyword router (ทำก่อน fast-path)
  // คำถามส่วนตัว/แอดมิน (self_/admin_) ต้องเข้าเส้นทาง routing เสมอ
  // ห้ามให้ current fast-path แย่งไปตอบด้วยข้อมูลทั่วไป (กันข้อมูลรั่ว/ตอบผิด)
  let decision = keywordRoute(question);
  const personalOrAdmin = /^(self_|admin_)/.test(decision.intent);

  // เจอชัดใน current -> ตอบจาก current เลย (เฉพาะคำถามทั่วไป)
  const strong = best && (best.coverage >= 0.55 || (best.score >= 6 && best.coverage >= 0.35));
  if (!personalOrAdmin && strong) {
    return {
      records: topRecords(curScored),
      usedSources: ["current"],
      deniedSources: [],
      intent: "current",
      fastPath: true,
      selfLookup: null,
      cacheState,
      sheetsMs,
    };
  }

  // 3) ambiguous จริง -> ใช้ Gemini router (ถ้าเปิด) มิฉะนั้น default archive
  if (!decision.confident) {
    if (process.env.USE_GEMINI_ROUTER !== "0") {
      try {
        const r = await routeWithGemini(question);
        if (r && r.sourceIds.length) {
          decision = { intent: r.intent, sourceIds: r.sourceIds as SourceId[], confident: true };
          log.info("gemini_router", { intent: r.intent, sources: r.sourceIds.join(",") });
        }
      } catch (err) {
        log.warn("gemini_router_failed", { message: String(err) });
      }
    }
    if (!decision.confident) {
      decision = { intent: "unknown", sourceIds: [...PUBLIC_ARCHIVE_IDS, "historyIndex"], confident: false };
    }
  }

  // 4) ตัดสิทธิ์ด้วยโค้ด (deterministic) — กันหลุด private tab
  const deniedSources: SourceId[] = [];
  const allowed = decision.sourceIds.filter((id) => {
    if (canAccess(id, userId)) return true;
    deniedSources.push(id);
    return false;
  });

  // self source (finance/members): ต้องมี userId ไม่งั้นถือว่ายังไม่เชื่อมบัญชี
  let selfLookup: { source: SourceId; matched: boolean } | null = null;

  const fetchIds = Array.from(new Set(allowed));
  const fetched = fetchIds.length ? await fetchSources(fetchIds) : { recs: new Map(), state: {}, ms: 0 };
  Object.assign(cacheState, fetched.state);
  sheetsMs += fetched.ms;

  // 5) ค้น + กรอง self ราย source
  // คำถามส่วนตัว/แอดมิน: ไม่เอา current มาปน (กันตอบด้วยข้อมูลทั่วไปที่ไม่เกี่ยว)
  let pool: ScoredRecord[] = personalOrAdmin ? [] : [...curScored.filter((r) => r.score > 0)];
  for (const id of fetchIds) {
    const src = SOURCES[id];
    let recs = (fetched.recs.get(id) ?? []) as SheetRecord[];
    if (src.access === "self") {
      // กรองเฉพาะแถวของเจ้าของ LINE user ID (ยกเว้นแอดมินเห็นทั้งหมด)
      if (!admin) {
        const col = src.selfIdCol ?? 2;
        recs = userId ? recs.filter((r) => (r.cells[col] ?? "").trim() === userId) : [];
      }
      selfLookup = { source: id, matched: recs.length > 0 };
    }
    for (const r of recs) pool.push(scoreRecord(r, qs));
  }

  return {
    records: topRecords(pool),
    usedSources: fetchIds.length ? ["current", ...fetchIds] : ["current"],
    deniedSources,
    intent: decision.intent,
    fastPath: false,
    selfLookup,
    cacheState,
    sheetsMs,
  };
}

// สร้าง context ให้ answer model (เฉพาะแถวที่ match, ไม่ส่งทั้งชีต)
export function buildContext(records: ScoredRecord[]): string {
  if (records.length === 0) return "(ไม่พบข้อมูลที่เกี่ยวข้อง)";
  return records
    .map((r, idx) => {
      const src = SOURCES[r.sourceId];
      const fields = r.header
        .map((h, i) => {
          const v = (r.cells[i] ?? "").toString().trim();
          return v ? `${h}: ${v}` : "";
        })
        .filter(Boolean)
        .join(" | ");
      return `[#${idx + 1} source=${src.label} date=${r.dateISO || "-"}] ${fields}`;
    })
    .join("\n");
}
