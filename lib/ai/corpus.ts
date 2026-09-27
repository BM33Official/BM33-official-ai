// คลังความรู้แบบ "ค้นก่อนแล้วค่อยส่งให้ AI" — แทนการยัดทั้งชีต (~105K token) ทุกคำถาม
// 1) แตกทุกแหล่ง (บริบทล่าสุด, ดัชนี, 01, 02, 03, คลังแชตที่นำเข้า, buffer 07) เป็นชิ้นเล็ก ๆ พร้อมวันที่
// 2) ค้นด้วย BM25 บน "ตัวอักษรไทยทีละ 3 ตัว" (ภาษาไทยไม่มีช่องว่าง) + คำภาษาอังกฤษ/ตัวเลข
// 3) ให้คะแนนเพิ่มกับข้อมูลใหม่/ข้อมูลที่ตรวจแล้ว -> ส่งให้ AI แค่ ~3K token ที่เกี่ยวจริง
// ค่าใช้จ่ายการค้น = 0 บาท (ทำในเครื่อง) และทดสอบได้โดยไม่ต้องมี Gemini key
import { batchGet, resolveTitle } from "@/lib/google-sheets";
import { SOURCES } from "@/lib/sources";
import { readPublicGrids, rowsOf, col, clean } from "@/lib/ai/knowledge";
import { log } from "@/lib/logger";

export type ChunkSrc = "current" | "index" | "kb" | "ann" | "link" | "chat" | "buffer" | "dir";
export interface Chunk { id: string; src: ChunkSrc; date: string; text: string }

export const KB_CHAT_TAB = "KB_แชตรุ่น";
export const KB_CHAT_HEADERS = ["วันที่", "เวลา", "แหล่ง", "ผู้ส่ง", "ข้อความ"];

const MAX_CHUNK = 1100;

function isoDate(s: string): string {
  const m = String(s ?? "").match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
}

// ── แตกแหล่งข้อมูลเป็นชิ้น ────────────────────────────────────────────────────
async function buildChunks(): Promise<Chunk[]> {
  const out: Chunk[] = [];
  const g = await readPublicGrids();
  let n = 0;
  const add = (src: ChunkSrc, date: string, text: string) => {
    const t = clean(text);
    if (t.length < 8) return;
    // ชิ้นยาวเกิน -> ตัดเป็นหลายชิ้น (หัวข้อ/วันที่ติดไปทุกชิ้น)
    const head = t.match(/^\[[^\]]*\][^\n]*\n/)?.[0] ?? "";
    for (let i = 0; i < t.length; i += MAX_CHUNK) {
      out.push({ id: `${src}${n++}`, src, date, text: i === 0 ? t.slice(0, MAX_CHUNK) : head + "…" + t.slice(i, i + MAX_CHUNK) });
    }
  };

  if (g.current) {
    const { header, rows } = rowsOf(g.current);
    for (const r of rows) {
      const line = header.map((h, i) => (clean(r[i]) && !/รหัสต้นทาง/.test(h) ? `${h}: ${clean(r[i])}` : "")).filter(Boolean).join(" | ");
      add("current", isoDate(line.match(/สถานะ ณ ([^|]+)/)?.[1] ?? "") || "", `[บริบทล่าสุดที่ตรวจแล้ว] ${line}`);
    }
  }
  if (g.historyIndex) {
    const { header, rows } = rowsOf(g.historyIndex);
    for (const r of rows) add("index", "", `[ดัชนีประวัติรุ่น] ${header.map((h, i) => (clean(r[i]) ? `${h}: ${clean(r[i])}` : "")).filter(Boolean).join(" | ")}`);
  }
  const seen = new Set<string>();
  const key = (t: string) => t.replace(/\s+/g, "").slice(0, 140);
  if (g.knowledgeArchive) {
    const { header, rows } = rowsOf(g.knowledgeArchive);
    const c = {
      cat: col(header, /^หมวด/), title: col(header, /^หัวข้อ/), body: col(header, /คำตอบ|ข้อความต้นทาง/),
      due: col(header, /กำหนดเวลา/), link: col(header, /^ลิงก์/), who: col(header, /ผู้ประกาศ|ผู้ติดต่อ/),
      date: col(header, /วันที่ต้นทาง|^วันที่/), time: col(header, /^เวลา/), q: col(header, /คำถาม/), kw: col(header, /คำค้น|คำสำคัญ/),
    };
    for (const r of rows) {
      const body = clean(r[c.body]);
      if (!body || seen.has(key(body))) continue;
      seen.add(key(body));
      const link = clean(r[c.link]);
      const meta = [clean(r[c.cat]), clean(r[c.who]) && `โดย ${clean(r[c.who])}`, clean(r[c.due]) && `กำหนด: ${clean(r[c.due])}`].filter(Boolean).join(" · ");
      add("kb", isoDate(clean(r[c.date])), `[${[clean(r[c.date]), clean(r[c.time])].filter(Boolean).join(" ") || "ไม่ทราบวันที่"}] ${meta} · ${clean(r[c.title])}\n${body}${link && !body.includes(link) ? `\nลิงก์: ${link}` : ""}${c.q >= 0 && clean(r[c.q]) ? `\n(คำถามที่เกี่ยว: ${clean(r[c.q]).slice(0, 160)})` : ""}${c.kw >= 0 && clean(r[c.kw]) ? `\n(คำค้น: ${clean(r[c.kw]).slice(0, 120)})` : ""}`);
    }
  }
  if (g.announcementArchive) {
    const { header, rows } = rowsOf(g.announcementArchive);
    const c = { cat: col(header, /^หมวด/), body: col(header, /ข้อความประกาศ/), date: col(header, /^วันที่/), time: col(header, /^เวลา/), who: col(header, /ผู้ประกาศ/), due: col(header, /กำหนดเวลา/), link: col(header, /^ลิงก์/) };
    for (const r of rows) {
      const body = clean(r[c.body]);
      if (!body || seen.has(key(body))) continue;
      seen.add(key(body));
      const link = clean(r[c.link]);
      add("ann", isoDate(clean(r[c.date])), `[${[clean(r[c.date]), clean(r[c.time])].filter(Boolean).join(" ")}] ประกาศ · ${clean(r[c.cat])}${clean(r[c.who]) ? ` · โดย ${clean(r[c.who])}` : ""}${clean(r[c.due]) ? ` · กำหนด: ${clean(r[c.due])}` : ""}\n${body}${link && !body.includes(link) ? `\nลิงก์: ${link}` : ""}`);
    }
  }
  if (g.linkArchive) {
    const { header, rows } = rowsOf(g.linkArchive);
    const c = { url: col(header, /^URL/i), ctx: col(header, /หัวข้อ|บริบท/), type: col(header, /ประเภท/), date: col(header, /^วันที่/), who: col(header, /ผู้ส่ง/) };
    for (const r of rows) {
      const url = clean(r[c.url]);
      if (!url) continue;
      add("link", isoDate(clean(r[c.date])), `[${clean(r[c.date])}] ลิงก์ ${clean(r[c.type])}: ${url}\n${clean(r[c.ctx]).slice(0, 300)}${clean(r[c.who]) ? ` (โดย ${clean(r[c.who])})` : ""}`);
    }
  }

  // คลังแชตที่นำเข้า + buffer ข้อความล่าสุดจาก webhook
  const [chatRows, bufRows] = await Promise.all([readChatTab(), readBuffer()]);
  const msgs = [...chatRows, ...bufRows].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  for (const w of windows(msgs)) {
    if (seen.has(key(w.text.split("\n").slice(1).join("")))) continue;
    add(w.src, w.date, w.text);
  }
  return out;
}

interface RawMsg { date: string; time: string; source: string; sender: string; text: string; src: ChunkSrc }

async function readChatTab(): Promise<RawMsg[]> {
  const title = await resolveTitle((t) => t === KB_CHAT_TAB);
  if (!title) return [];
  const [grid] = await batchGet([`'${title}'!A2:E`]);
  return (grid ?? []).filter((r) => r[4]).map((r) => ({ date: r[0], time: r[1], source: r[2], sender: r[3], text: r[4], src: "chat" as ChunkSrc }));
}

// buffer 07: ข้อความกลุ่มที่บอทได้ยินหลังนำเข้าไฟล์ (ยังไม่ถูกกลั่น) — 90 วันล่าสุด
async function readBuffer(): Promise<RawMsg[]> {
  try {
    const title = await resolveTitle(SOURCES.rawMessages.match);
    if (!title) return [];
    const [grid] = await batchGet([`'${title}'!A2:G`]);
    const since = Date.now() - 90 * 86_400_000;
    const out: RawMsg[] = [];
    for (const r of grid ?? []) {
      const t = new Date(r[1] ?? "").getTime();
      if (!t || t < since || !r[6]) continue;
      const d = new Date(t + 7 * 3600_000).toISOString();
      out.push({ date: d.slice(0, 10), time: d.slice(11, 16), source: "group", sender: r[4] ?? "", text: r[6], src: "buffer" });
    }
    return out;
  } catch {
    return [];
  }
}

// รวมข้อความต่อเนื่องเป็นหน้าต่างบทสนทนา (วันเดียวกัน ห่างกัน ≤ 30 นาที) — ข้อความยาวอยู่เดี่ยว ๆ
function windows(msgs: RawMsg[]): { src: ChunkSrc; date: string; text: string }[] {
  const out: { src: ChunkSrc; date: string; text: string }[] = [];
  let cur: { src: ChunkSrc; date: string; lines: string[]; len: number; last: number } | null = null;
  const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const flush = () => {
    if (cur && cur.lines.length) out.push({ src: cur.src, date: cur.date, text: `[แชต ${cur.date}]\n${cur.lines.join("\n")}` });
    cur = null;
  };
  for (const m of msgs) {
    const line = `${m.time} ${m.sender}: ${m.text.trim()}`;
    const long = m.text.length >= 220;
    if (long) {
      flush();
      out.push({ src: m.src, date: m.date, text: `[${m.date} ${m.time}] ${m.source === "openchat" ? "OpenChat" : "กลุ่มรุ่น"} · โดย ${m.sender}\n${m.text.trim()}` });
      continue;
    }
    if (!cur || cur.date !== m.date || mins(m.time) - cur.last > 30 || cur.len + line.length > 800) {
      flush();
      cur = { src: m.src, date: m.date, lines: [], len: 0, last: mins(m.time) };
    }
    cur.lines.push(line);
    cur.len += line.length;
    cur.last = mins(m.time);
  }
  flush();
  return out;
}

// ── ดัชนี BM25 ────────────────────────────────────────────────────────────────
const TONE = /[็-๎]/g; // วรรณยุกต์/การันต์ — ตัดออกให้ทนต่อการพิมพ์ผิด
function norm(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(TONE, "");
}
export function terms(s: string): string[] {
  const t = norm(s);
  const out: string[] = [];
  for (const w of t.match(/[a-z0-9]+/g) ?? []) if (w.length >= 2 || /\d/.test(w)) out.push(w);
  for (const run of t.match(/[ก-ๆ]+/g) ?? []) {
    if (run.length < 3) { out.push(run); continue; }
    for (let i = 0; i + 3 <= run.length; i++) out.push(run.slice(i, i + 3));
  }
  return out;
}

interface Index { chunks: Chunk[]; tf: Map<string, number>[]; len: number[]; df: Map<string, number>; avg: number }
function buildIndex(chunks: Chunk[]): Index {
  const df = new Map<string, number>();
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  for (const c of chunks) {
    const m = new Map<string, number>();
    const ts = terms(c.text);
    for (const t of ts) m.set(t, (m.get(t) ?? 0) + 1);
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    tf.push(m);
    len.push(ts.length);
  }
  return { chunks, tf, len, df, avg: len.reduce((a, b) => a + b, 0) / Math.max(1, len.length) };
}

// คำฟุ่มเฟือยในคำถาม (ไม่ช่วยค้น)
const FILLER = /(ครับ|คับ|ค่ะ|คะ|นะคะ|นะครับ|น้า|นะ|จ้า|จ้ะ|อ่ะ|อะ|หน่อย|ไหม|มั้ย|หรอ|เหรอ|หรือเปล่า|รึเปล่า|บ้าง|อะไร|ยังไง|อย่างไร|เท่าไหร่|เท่าไร|ที่ไหน|เมื่อไหร่|เมื่อไร|ขอ|อยากรู้|รู้ไหม|ช่วย|บอท|เพื่อน|เรา|ผม|หนู|ฉัน|เค้า|ได้ไหม|ได้มั้ย)/g;

// คำพ้อง/คำเรียกต่างกันที่เจอบ่อยในรุ่น
const SYNONYMS: [RegExp, string][] = [
  [/เงินรุ่น|ค่ารุ่น|ค้างจ่าย|จ่ายเงิน|โอนเงิน|รายปี|เหมาจ่าย/, "เงินรุ่น จัดเก็บเงิน ค่าสนับสนุนรุ่น ฝ่ายการเงิน ฟอร์มจัดเก็บ"],
  [/สอบ|exam|midterm|final|ไฟนอล|มิดเทอม/i, "สอบ exam sum midterm final ตารางสอบ"],
  [/จำข้อสอบ|recall/, "จำข้อสอบ ฝ่ายวิชาการ docs เลขที่"],
  [/ตาราง|คาบ|เรียนวัน|เรียนพรุ่งนี้|เรียนวันนี้/, "ตารางสอน ตารางเรียน block บล็อก"],
  [/ฟอร์ม|กรอก|form/i, "ฟอร์ม แบบฟอร์ม กรอก google form"],
  [/ไดรฟ์|drive|linktree|ลิงก์|ลิ้งค์|ลิงค์/i, "drive ไดรฟ์ linktree ลิงก์"],
  [/วัคซีน|ฉีด/, "วัคซีน ฉีดวัคซีน ศูนย์ตรวจสุขภาพ"],
  [/เสื้อ|hoodie|ฮู้ด|ร่ม/i, "เสื้อ hoodie ร่ม pre-order"],
  [/ค่าย|first ?meet|เฟิร์สมีท/i, "ค่ายฉันจะไปเป็นหมอ first meet สตาฟ"],
  [/ติว/, "ติว ฝ่ายวิชาการ meet"],
  [/ประธาน|กรรมการ|ติดต่อ/, "ประธานรุ่น กรรมการรุ่น ฝ่าย ติดต่อ"],
  [/กรอส|gross|อาจารย์ใหญ่/i, "gross anatomy กรอส อาจารย์ใหญ่ โต๊ะ"],
  [/syringe|ไซริ้ง/i, "syringe game ไซริ้ง กีฬา"],
  [/ไหว้ครู/, "พิธีไหว้ครู"],
  [/น้ำท่วม|อุทกภัย/, "น้ำท่วม อุทกภัย ทุนฉุกเฉิน ออนไลน์"],
];

export function expandQuery(q: string): string {
  let x = q.replace(FILLER, " ");
  for (const [re, add] of SYNONYMS) if (re.test(q)) x += " " + add;
  return x;
}

const SRC_WEIGHT: Record<ChunkSrc, number> = { current: 1.35, index: 0.7, kb: 1.15, ann: 1.1, link: 0.9, chat: 1.0, buffer: 1.05, dir: 1.2 };

export interface Hit { chunk: Chunk; score: number }

export function search(ix: Index, query: string, opts: { now?: number; k?: number } = {}): Hit[] {
  const now = opts.now ?? Date.now();
  const q = terms(expandQuery(query));
  const uniq = Array.from(new Set(q));
  if (!uniq.length) return [];
  const N = ix.chunks.length;
  const k1 = 1.2, b = 0.75;
  const idf = new Map(uniq.map((t) => { const d = ix.df.get(t) ?? 0; return [t, Math.log(1 + (N - d + 0.5) / (d + 0.5))]; }));
  const hits: Hit[] = [];
  for (let i = 0; i < N; i++) {
    const m = ix.tf[i];
    let s = 0, matched = 0;
    for (const t of uniq) {
      const f = m.get(t);
      if (!f) continue;
      matched++;
      s += idf.get(t)! * (f * (k1 + 1)) / (f + k1 * (1 - b + b * ix.len[i] / ix.avg));
    }
    if (!s) continue;
    const c = ix.chunks[i];
    const cover = matched / uniq.length; // ครอบคลุมคำถามกี่ส่วน
    const age = c.date ? (now - new Date(c.date + "T12:00:00+07:00").getTime()) / 86_400_000 : 400;
    const fresh = 1 + 1.1 * Math.exp(-Math.max(0, age) / 60);
    hits.push({ chunk: c, score: s * (0.55 + cover) * fresh * SRC_WEIGHT[c.src] });
  }
  hits.sort((x, y) => y.score - x.score);
  return hits.slice(0, opts.k ?? 60);
}

// เลือกชิ้นจนเต็มงบตัวอักษร (ตัดชิ้นที่เนื้อหาซ้ำ) แล้วเรียงตามวันที่ใหม่ -> เก่า
export function pick(hits: Hit[], budgetChars: number): Chunk[] {
  const out: Chunk[] = [];
  const seen = new Set<string>();
  let used = 0;
  const top = hits[0]?.score ?? 0;
  for (const h of hits) {
    if (h.score < top * 0.12) break; // ไกลจากคำถามเกินไป
    const k = norm(h.chunk.text).replace(/\s+/g, "").slice(0, 120);
    if (seen.has(k)) continue;
    if (used + h.chunk.text.length > budgetChars && out.length) continue;
    seen.add(k);
    out.push(h.chunk);
    used += h.chunk.text.length;
    if (used >= budgetChars) break;
  }
  return out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

// ── cache ต่อ instance (คลังรวม > 2MB ใส่ Data Cache ของ Vercel ไม่ได้) ─────────
let _ix: { at: number; ix: Index } | null = null;
let _building: Promise<Index> | null = null;
const TTL = 15 * 60_000;

export async function corpusIndex(force = false): Promise<Index> {
  if (!force && _ix && Date.now() - _ix.at < TTL) return _ix.ix;
  if (_building) return _building;
  _building = (async () => {
    const t0 = Date.now();
    try {
      const chunks = await buildChunks();
      const ix = buildIndex(chunks);
      _ix = { at: Date.now(), ix };
      log.info("corpus_built", { chunks: chunks.length, ms: Date.now() - t0 });
      return ix;
    } catch (err) {
      if (_ix) return _ix.ix; // ชีตล่มชั่วคราว -> ใช้ของเดิม
      throw err;
    } finally {
      _building = null;
    }
  })();
  return _building;
}
export function resetCorpus(): void { _ix = null; }

export function corpusStats(ix: Index) {
  const by: Record<string, number> = {};
  let chars = 0;
  for (const c of ix.chunks) { by[c.src] = (by[c.src] ?? 0) + 1; chars += c.text.length; }
  return { chunks: ix.chunks.length, chars, by };
}

export function buildDirectoryIndex(lines: string[]): Index {
  return buildIndex(lines.map((t, i) => ({ id: `dir${i}`, src: "dir" as ChunkSrc, date: "", text: t })));
}
export type { Index };
