// "ความรู้ทั้งหมด" ที่ AI อ่านทุกคำถาม — ไม่มีการค้นแบบเลือกแถวอีกต่อไป (เคยทำให้ตอบพลาด)
// ประกอบด้วย:
//   1) คลังความรู้สาธารณะจากชีต (AI_บริบทล่าสุด, ดัชนีประวัติ, 01, 02, 03) — อัดให้กระชับ + ตัดซ้ำด้วยรหัสข้อความ
//   2) ข้อมูลสดจากแอป (ประกาศ ฟอร์ม ตารางเรียน สอบ เงินรุ่นรายเดือน กรรมการ ทำเนียบรุ่น)
// ส่วนที่ 1 ถูกวางไว้ "ก่อน" คำถามเสมอ และเปลี่ยนไม่บ่อย -> Gemini implicit cache ลดค่าใช้จ่าย
import { batchGet, resolveTitle } from "@/lib/google-sheets";
import { SOURCES, SourceId } from "@/lib/sources";
import { cached } from "@/lib/cache";
import { liveAnnouncements, parseLinks } from "@/lib/bc/announcements";
import { readForms } from "@/lib/bc/forms";
import { liveSchedule, liveUniExams, examStart } from "@/lib/bc/schedule";
import { readFeeMonths } from "@/lib/bc/fees";
import { readCommittee } from "@/lib/bc/committee";
import { readRoster } from "@/lib/bc/roster";
import { getConfig } from "@/lib/bc/config";
import { currentDaily, parseItems } from "@/lib/bc/daily";
import { thDateTime, bkkDayKey, dayDiff } from "@/lib/time";

const clean = (s: unknown) => String(s ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

function rowsOf(grid: string[][]): { header: string[]; rows: string[][] } {
  const header = (grid[0] ?? []).map((h) => clean(h));
  const rows = grid.slice(1).filter((r) => r.some((c) => clean(c)));
  return { header, rows };
}
function col(header: string[], re: RegExp): number {
  return header.findIndex((h) => re.test(h));
}

// ── 1) คลังความรู้สาธารณะ ───────────────────────────────────────────────────
async function readPublicGrids(): Promise<Partial<Record<SourceId, string[][]>>> {
  const ids: SourceId[] = ["current", "historyIndex", "knowledgeArchive", "announcementArchive", "linkArchive"];
  const ranges: string[] = [];
  const used: SourceId[] = [];
  for (const id of ids) {
    const src = SOURCES[id];
    const title = await resolveTitle(src.match);
    if (!title) continue;
    // อ่าน "ทั้งแท็บ" (ไม่จำกัดแถว) — ต้องไม่ตกหล่นแม้ข้อมูลโตขึ้น
    ranges.push(`'${title}'!A${src.headerRow}:${src.lastCol}`);
    used.push(id);
  }
  const grids = await batchGet(ranges);
  const out: Partial<Record<SourceId, string[][]>> = {};
  used.forEach((id, i) => { out[id] = grids[i] ?? []; });
  return out;
}

export interface PackStats { chars: number; sections: Record<string, number> }

export async function buildArchivePack(): Promise<{ text: string; stats: PackStats }> {
  const g = await readPublicGrids();
  const sections: Record<string, number> = {};
  const parts: string[] = [];
  const seenMsg = new Set<string>();
  const seenText = new Set<string>();

  // AI_บริบทล่าสุด — สำคัญที่สุด (สรุปสถานะล่าสุดที่คนตรวจแล้ว)
  if (g.current) {
    const { header, rows } = rowsOf(g.current);
    const lines = rows.map((r) => header.map((h, i) => (clean(r[i]) && !/รหัสต้นทาง/.test(h) ? `${h}: ${clean(r[i])}` : "")).filter(Boolean).join(" | "));
    parts.push(`### บริบทล่าสุดที่ตรวจแล้ว (สถานะ ณ วันที่ระบุ — ใหม่กว่าคลังย้อนหลัง)\n${lines.join("\n")}`);
    sections.current = rows.length;
  }
  if (g.historyIndex) {
    const { header, rows } = rowsOf(g.historyIndex);
    parts.push(`### ดัชนีประวัติรุ่นตั้งแต่วันแรก\n${rows.map((r) => header.map((h, i) => clean(r[i]) ? `${h}: ${clean(r[i])}` : "").filter(Boolean).join(" | ")).join("\n")}`);
    sections.historyIndex = rows.length;
  }

  // 01 ฐานความรู้ — เก็บข้อความต้นทางเต็ม ตัดคอลัมน์ซ้ำซ้อน (คำถามที่คาด/คำค้น/สถานะ boilerplate)
  const entries: { date: string; text: string }[] = [];
  if (g.knowledgeArchive) {
    const { header, rows } = rowsOf(g.knowledgeArchive);
    const c = {
      cat: col(header, /^หมวด/), title: col(header, /^หัวข้อ/), body: col(header, /คำตอบ|ข้อความต้นทาง/),
      due: col(header, /กำหนดเวลา/), link: col(header, /^ลิงก์/), who: col(header, /ผู้ประกาศ|ผู้ติดต่อ/),
      date: col(header, /วันที่ต้นทาง|^วันที่/), time: col(header, /^เวลา/), msg: col(header, /รหัสข้อความ/),
    };
    for (const r of rows) {
      const body = clean(r[c.body]);
      if (!body) continue;
      const key = body.replace(/\s+/g, "").slice(0, 160);
      if (seenText.has(key)) continue;
      seenText.add(key);
      for (const m of clean(r[c.msg]).split(/[,\s]+/).filter(Boolean)) seenMsg.add(m);
      const head = [clean(r[c.date]), clean(r[c.time])].filter(Boolean).join(" ");
      const meta = [clean(r[c.cat]), clean(r[c.who]) && `โดย ${clean(r[c.who])}`, clean(r[c.due]) && `กำหนด: ${clean(r[c.due])}`].filter(Boolean).join(" · ");
      const title = clean(r[c.title]);
      const showTitle = title && !body.replace(/\s+/g, "").startsWith(title.replace(/\s+/g, "").slice(0, 30));
      const link = clean(r[c.link]);
      entries.push({
        date: clean(r[c.date]),
        text: `[${head || "ไม่ทราบวันที่"}] ${meta}${showTitle ? ` · ${title}` : ""}\n${body}${link && !body.includes(link) ? `\nลิงก์: ${link}` : ""}`,
      });
    }
    sections.knowledge = entries.length;
  }
  // 02 ประกาศ — ข้ามที่ซ้ำกับ 01 (รหัสข้อความเดียวกัน/ข้อความเดียวกัน)
  if (g.announcementArchive) {
    const { header, rows } = rowsOf(g.announcementArchive);
    const c = {
      cat: col(header, /^หมวด/), body: col(header, /ข้อความประกาศ/), date: col(header, /^วันที่/), time: col(header, /^เวลา/),
      who: col(header, /ผู้ประกาศ/), due: col(header, /กำหนดเวลา/), link: col(header, /^ลิงก์/), msg: col(header, /รหัสข้อความ/),
    };
    let added = 0;
    for (const r of rows) {
      const body = clean(r[c.body]);
      if (!body) continue;
      const msgs = clean(r[c.msg]).split(/[,\s]+/).filter(Boolean);
      const key = body.replace(/\s+/g, "").slice(0, 160);
      if (msgs.some((m) => seenMsg.has(m)) || seenText.has(key)) continue;
      seenText.add(key);
      msgs.forEach((m) => seenMsg.add(m));
      const link = clean(r[c.link]);
      entries.push({
        date: clean(r[c.date]),
        text: `[${[clean(r[c.date]), clean(r[c.time])].filter(Boolean).join(" ") || "ไม่ทราบวันที่"}] ประกาศ · ${clean(r[c.cat])}${clean(r[c.who]) ? ` · โดย ${clean(r[c.who])}` : ""}${clean(r[c.due]) ? ` · กำหนด: ${clean(r[c.due])}` : ""}\n${body}${link && !body.includes(link) ? `\nลิงก์: ${link}` : ""}`,
      });
      added++;
    }
    sections.announcements = added;
  }
  // เรียงใหม่ -> เก่า (ข้อมูลใหม่อยู่บน ช่วย AI ให้น้ำหนักความใหม่)
  entries.sort((a, b) => b.date.localeCompare(a.date));
  parts.push(`### คลังข้อความ/ประกาศ/ความรู้ของรุ่นทั้งหมด (เรียงใหม่ -> เก่า) — ${entries.length} รายการ\n${entries.map((e) => e.text).join("\n---\n")}`);

  // 03 ลิงก์ — เฉพาะลิงก์ที่ยังไม่ปรากฏในข้อความข้างบน
  if (g.linkArchive) {
    const all = parts.join("\n");
    const { header, rows } = rowsOf(g.linkArchive);
    const c = { url: col(header, /^URL/i), ctx: col(header, /หัวข้อ|บริบท/), type: col(header, /ประเภท/), date: col(header, /^วันที่/), who: col(header, /ผู้ส่ง/) };
    const lines: string[] = [];
    const seenUrl = new Set<string>();
    for (const r of rows) {
      const url = clean(r[c.url]);
      if (!url || all.includes(url) || seenUrl.has(url)) continue;
      seenUrl.add(url);
      lines.push(`- ${clean(r[c.date])} ${clean(r[c.type])}: ${url} — ${clean(r[c.ctx]).slice(0, 140)}${clean(r[c.who]) ? ` (โดย ${clean(r[c.who])})` : ""}`);
    }
    parts.push(`### ลิงก์/ทรัพยากรอื่น ๆ\n${lines.join("\n")}`);
    sections.links = lines.length;
  }

  const text = parts.join("\n\n");
  return { text, stats: { chars: text.length, sections } };
}

// cache 10 นาที แชร์ข้าม instance (หลายคนถามพร้อมกันก็อ่านชีตครั้งเดียว)
export async function archivePack(): Promise<{ text: string; stats: PackStats }> {
  return cached("ai:archive-pack:v2", ["knowledge"], 600, buildArchivePack);
}

// ── 2) ข้อมูลสดจากแอป (สาธารณะในรุ่น) ─────────────────────────────────────────
export async function livePack(opts: { includeDirectory: boolean }): Promise<string> {
  const now = Date.now();
  const [ann, forms, sched, exams, fees, committee, roster, cfg, daily] = await Promise.all([
    liveAnnouncements(), readForms(), liveSchedule(), liveUniExams(), readFeeMonths(),
    readCommittee(), opts.includeDirectory ? readRoster() : Promise.resolve([]), getConfig(), currentDaily(),
  ]);
  const out: string[] = [];

  out.push(`### ประกาศบนแอปตอนนี้ (ล่าสุด ข้อมูลทางการ ใหม่กว่าคลังเสมอ)\n${ann.length ? ann.map((a) => {
    const links = parseLinks(a.links).map((l) => `${l.label}: ${l.url}`).join(" ; ");
    return `- ${a.title} [${a.category}] โดย ${a.author || "-"}${a.author_role ? ` (${a.author_role})` : ""} · โพสต์ ${thDateTime(a.created_at)}${a.deadline_at ? ` · เดดไลน์ ${thDateTime(a.deadline_at)}` : ""}${a.event_at ? ` · วันงาน ${thDateTime(a.event_at)}` : ""}${a.location ? ` · สถานที่ ${a.location}` : ""}\n  สรุป: ${a.summary}\n  ต้นฉบับ: ${clean(a.body).slice(0, 2500)}${links ? `\n  ลิงก์: ${links}` : ""}`;
  }).join("\n") : "- (ยังไม่มี)"}`);

  const openForms = forms.filter((f) => f.status !== "closed");
  if (openForms.length) {
    out.push(`### ฟอร์ม/งานที่ติดตามอยู่\n${openForms.map((f) => `- ${f.name}${f.deadline_at ? ` · ปิด ${thDateTime(f.deadline_at)}${new Date(f.deadline_at).getTime() < now ? " (ปิดไปแล้ว)" : ""}` : ""}${f.link ? ` · ลิงก์ ${f.link}` : ""}${f.description ? ` · ${f.description}` : ""}`).join("\n")}`);
  }

  const today = bkkDayKey(now);
  const upcoming = sched.filter((s) => dayDiff(s.date + "T12:00:00+07:00", now) >= -7 && dayDiff(s.date + "T12:00:00+07:00", now) <= 60);
  out.push(`### ตารางเรียน (วันนี้ ${today}; แสดง 7 วันก่อน ถึง 60 วันข้างหน้า)\n${upcoming.length ? upcoming.map((s) => `- ${s.date} ${s.start}-${s.end} · ${s.subject}${s.topic ? ` — ${s.topic}` : ""}${s.lecturer ? ` · อ.${s.lecturer}` : ""} · ${[s.building, s.room].filter(Boolean).join(" ห้อง ") || "ไม่ระบุสถานที่"}${s.kind !== "lecture" ? ` (${s.kind})` : ""}`).join("\n") : "- (ยังไม่มีตารางในระบบ)"}`);

  out.push(`### สอบของมหาวิทยาลัย\n${exams.length ? exams.map((e) => `- ${e.name} · ${thDateTime(examStart(e))}${e.end ? `-${e.end}` : ""} · ${[e.building, e.room].filter(Boolean).join(" ห้อง ") || "ไม่ระบุสถานที่"}${examStart(e).getTime() < now ? " (สอบไปแล้ว)" : ""}`).join("\n") : "- (ยังไม่มีในระบบ)"}`);

  if (fees.length) {
    out.push(`### เงินรุ่นรายเดือน (ยอดแต่ละเดือนต่างกันได้)\n${fees.map((m) => `- ${m.label || m.month}: ${m.amount} บาท${m.due_date ? ` · ครบกำหนด ${m.due_date}` : ""}${m.note ? ` · ${m.note}` : ""}`).join("\n")}${cfg.payment_info ? `\nวิธีจ่าย: ${cfg.payment_info}` : ""}${cfg.payment_link ? `\nลิงก์จ่าย/แจ้งโอน: ${cfg.payment_link}` : ""}`);
  }

  if (daily) {
    out.push(`### สรุปประจำวันบนแอป (${daily.date})\n${daily.headline}\n${parseItems(daily.items).map((i) => `- ${i.text}`).join("\n")}`);
  }

  out.push(`### กรรมการรุ่น / ผู้ติดต่อ\n${committee.map((c) => `- ${c.role}: ${c.nickname}${c.contact_url ? ` (${c.contact_url})` : ""}`).join("\n")}`);

  if (opts.includeDirectory && roster.length) {
    out.push(`### ทำเนียบรุ่น BM33 (${roster.length} คน — ข้อมูลภายในรุ่น)\n${roster.map((r) => `- เลขที่ ${Number(r.student_id.slice(-3))} (รหัส ${r.student_id}) · ${r.prefix ?? ""}${r.full_name}${r.nickname ? ` (${r.nickname})` : ""}${r.name_en ? ` · ${r.name_en}${r.nickname_en ? ` (${r.nickname_en})` : ""}` : ""}${r.line_id ? ` · LINE: ${r.line_id}` : ""}${r.instagram ? ` · IG: ${r.instagram}` : ""}`).join("\n")}`);
  }
  return out.join("\n\n");
}
