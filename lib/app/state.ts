// ข้อมูลทั้งหมดที่แอปสมาชิกต้องใช้ใน 1 คำขอ
//   board = สาธารณะในรุ่น (cache แชร์ 15 วิ -> 100 คนเปิดพร้อมกันก็ไม่ยิงชีตเพิ่ม)
//   mine  = เฉพาะของคนที่ล็อกอิน (คำนวณจาก snapshot ใน memory; ไม่มีข้อมูลคนอื่นเลย)
import { createHash } from "crypto";
import { cached } from "@/lib/cache";
import { liveAnnouncements, parseLinks } from "@/lib/bc/announcements";
import { readForms, formVisible, formEndedAt, announcementVisible } from "@/lib/bc/forms";
import { readExams } from "@/lib/bc/academic";
import { liveSchedule, liveUniExams, examStart } from "@/lib/bc/schedule";
import { currentDaily, parseItems } from "@/lib/bc/daily";
import { readCommittee } from "@/lib/bc/committee";
import { getConfig } from "@/lib/bc/config";
import { readRoster } from "@/lib/bc/roster";
import { feeStatusFor } from "@/lib/bc/fees";
import { formStatesFor } from "@/lib/bc/status";
import { ranking, pendingExams, ZONE_RED } from "@/lib/bc/academic";
import { drawsForStudent, readDraws, drawPhase, drawIds } from "@/lib/bc/draws";
import { getFortune, fortuneBoard } from "@/lib/bc/fortune";
import { dayDiff, bkkDayKey } from "@/lib/time";
import { fixtureEnabled, applyFixture } from "@/lib/app/fixture";
import { signCal } from "@/lib/app/session";

export interface BoardAnnouncement {
  id: string; title: string; summary: string; body: string; author: string; author_role: string;
  category: string; deadline_at: string; event_at: string; location: string;
  links: { label: string; url: string }[]; pinned: boolean; created_at: string; updated_at: string; form_id: string;
  cal: string; // ลายเซ็นลิงก์ไฟล์ปฏิทิน /api/cal/<id>?s=<cal> ("" = ไม่มีวันเวลา)
  group: string; // ชุดประกาศที่แอดมินจัดไว้ ("" = ไม่มี)
  order: number; // ลำดับที่แอดมินจัด (0 = ไม่ได้จัด)
}

// ประกาศที่ไม่มีวันเวลาเลย: อยู่หน้าหลัก 21 วัน แล้วย้ายไป "ที่ผ่านมาแล้ว" (ปักหมุด = อยู่ตลอด)
const UNDATED_DAYS = 21;

async function buildBoard() {
  const now = Date.now();
  const [ann, forms, sched, exams, daily, committee, cfg, draws, rosterRows] = await Promise.all([
    liveAnnouncements(), readForms(), liveSchedule(), liveUniExams(), currentDaily(), readCommittee(), getConfig(), readDraws(), readRoster(),
  ]);
  // ผ่านเดดไลน์/วันงาน -> โชว์ต่ออีก 1 วัน แล้วย้ายไป "ที่ผ่านมาแล้ว" (หน้าหลักไม่รก แต่ย้อนดูได้)
  const toBoard = (a: (typeof ann)[number]): BoardAnnouncement => ({
    id: a.id, title: a.title, summary: a.summary, body: a.body, author: a.author, author_role: a.author_role,
    category: a.category, deadline_at: a.deadline_at, event_at: a.event_at, location: a.location,
    links: parseLinks(a.links), pinned: a.pinned === "1", created_at: a.created_at, updated_at: a.updated_at, form_id: a.form_id,
    cal: a.event_at || a.deadline_at ? signCal(a.id) : "",
    group: (a.group_name ?? "").trim(), order: Number(a.sort_order) || 0,
  });
  const stale = (a: (typeof ann)[number]) => a.pinned !== "1" && !a.deadline_at && !a.event_at && now - new Date(a.created_at || 0).getTime() > UNDATED_DAYS * 86_400_000;
  const current = ann.filter((a) => announcementVisible(a, forms, now) && !stale(a));
  const announcements: BoardAnnouncement[] = current.map(toBoard);
  const pastCut = now - 75 * 86_400_000;
  const past: BoardAnnouncement[] = ann
    .filter((a) => !current.includes(a) && new Date(a.deadline_at || a.event_at || a.created_at || 0).getTime() > pastCut)
    .sort((a, b) => (b.deadline_at || b.event_at || b.created_at || "").localeCompare(a.deadline_at || a.event_at || a.created_at || ""))
    .slice(0, 40).map(toBoard);
  // ตาราง: 14 วันที่แล้ว ถึง 120 วันข้างหน้า (พอสำหรับปฏิทินรายเดือน)
  const schedule = sched
    .filter((s) => { const d = dayDiff(s.date + "T12:00:00+07:00", now); return d >= -14 && d <= 120; })
    .map((s) => ({ id: s.id, date: s.date, start: s.start, end: s.end, subject: s.subject, topic: s.topic, lecturer: s.lecturer, building: s.building, room: s.room, kind: s.kind, note: s.note, block: s.block }));
  const uniExams = exams.map((e) => ({ id: e.id, name: e.name, date: e.date, start: e.start, end: e.end, building: e.building, room: e.room, block: e.block, note: e.note.replace(/\[upload:[^\]]+\]/, "").trim(), at: examStart(e).toISOString() }));
  // การสุ่ม (ไม่มีรายชื่อใคร) — ให้ทุกคนเห็นหน้าต่าง "กำลังสุ่ม"
  const publicDraws = draws
    .filter((d) => d.status !== "canceled")
    .map((d) => ({ id: d.id, activity: d.activity, need: Number(d.need) || 0, poolSize: drawIds(d.pool_ids).length, phase: drawPhase(d, now), show_at: d.show_at, reveal_at: d.reveal_at }))
    .filter((d) => { const show = new Date(d.show_at).getTime(); const rev = new Date(d.reveal_at).getTime(); return now > show - 30 * 60_000 && now < rev + 3 * 86_400_000; });
  return {
    announcements,
    past,
    forms: forms.filter((f) => formVisible(f, now)).map((f) => ({ id: f.form_id, name: f.name, deadline_at: f.deadline_at ?? "", link: f.link ?? "", description: f.description ?? "", type: f.type, closed: formEndedAt(f, now) !== null })),
    schedule,
    exams: uniExams,
    daily: daily ? { id: daily.id, date: daily.date, headline: daily.headline, items: parseItems(daily.items), updated_at: daily.updated_at } : null,
    committee: committee.map((c) => ({ nickname: c.nickname, role: c.role, contact_url: c.contact_url })),
    notice: cfg.portal_notice ?? "",
    payment: { info: cfg.payment_info ?? "", link: cfg.payment_link ?? "" },
    semester: cfg.semester_label ?? "",
    draws: publicDraws,
    fortune: await fortuneBoard(bkkDayKey(now), (sid) => { const r = rosterRows.find((x) => x.student_id === sid); return r?.nickname || r?.full_name || "เพื่อน"; }, Number(cfg.fortune_pool_base) || 0).catch(() => ({ jackpots: [], pool: 0, players: 0, total: 0 })),
  };
}

export async function publicBoard() {
  return cached("app:board:v1", ["bc", "knowledge"], 15, buildBoard);
}

const GREEN_COPY = { title: "Green Zone", text: "ทุกคนเริ่มต้นใหม่ สะอาดหมดจด ✨ แตะดูประวัติการเรียกเก็บเงินรุ่นและงานวิชาการได้" };

const ZONE_COPY: Record<string, { title: string; text: string }> = {
  safe: { title: "ปลอดภัย", text: "ไม่มีอะไรค้างเลย เก่งมาก ✨" },
  watch: { title: "เฝ้าระวัง", text: "ค้างอยู่ 1 อย่าง เคลียร์ให้หมดก่อนจะกลายเป็น 3 นะ" },
  close: { title: "ใกล้ Red Zone", text: "ค้าง 2 อย่างแล้ว อีกอย่างเดียวจะเข้า Red Zone ขอแรงอีกนิด" },
  red: { title: "อยู่ใน Red Zone", text: "ค้างตั้งแต่ 3 อย่างขึ้นไป ค่อย ๆ เคลียร์ทีละอย่าง เดี๋ยวก็หลุดโซน 💪" },
};

export async function personalState(sid: string) {
  const [roster, fees, forms, rank, draws, fortune, committee, slips, pend, exams] = await Promise.all([
    readRoster(), feeStatusFor(sid), formStatesFor(sid), ranking(), drawsForStudent(sid), getFortune(sid), readCommittee(),
    import("@/lib/bc/slips").then((m) => m.readSlips()).catch(() => []),
    pendingExams().catch(() => new Map()),
    readExams().catch(() => []),
  ]);
  const me = roster.find((r) => r.student_id === sid);
  const r = rank.rows.find((x) => x.student_id === sid);
  const role = committee.find((c) => c.student_id === sid)?.role ?? "";
  const level = r?.level ?? "safe";
  return {
    me: {
      sid, nickname: me?.nickname || me?.full_name || sid, fullName: `${me?.prefix ?? ""}${me?.full_name ?? ""}`,
      nameEn: me?.name_en ?? "", number: Number(sid.slice(-3)), role,
    },
    fees,
    forms: forms.map((f) => ({ id: f.form.form_id, state: f.state, undo: f.undo })),
    zone: {
      level,
      misses: r?.misses ?? 0,
      missedExams: r?.missedExams ?? [],
      feeMisses: r?.feeMisses ?? 0,
      feeMonths: r?.feeMonths ?? [],
      strikes: (r?.misses ?? 0) + (r?.feeMisses ?? 0),
      // ข้อสอบที่ยังไม่ได้กรอก (เฉพาะของฉัน) + ลิงก์ไปกรอก + สถานะ "ยอมโดน"
      exams: ((pend.get(sid) ?? []) as { exam_id: string; name: string; link: string; date: string; accepted: boolean }[]).map((e) => ({ id: e.exam_id, name: e.name, link: e.link, date: e.date, accepted: e.accepted })),
      // สเกล 0-1 สำหรับเกจ (ค้างครบ 3 = เต็ม — ไม่บอกอันดับหรือชื่อใคร)
      gauge: Math.min(1, ((r?.misses ?? 0) + (r?.feeMisses ?? 0)) / ZONE_RED),
      enabled: rank.enabled,
      ...(rank.enabled ? ZONE_COPY[level] : GREEN_COPY),
    },
    // ประวัติ (ของฉันเท่านั้น): รายการเรียกเก็บเงินรุ่น + งานวิชาการ ใหม่ -> เก่า
    history: buildHistory(sid, fees.months, exams),
    draws,
    fortune,
    // สลิปของฉันที่ยังรอฝ่ายการเงิน (ไม่ส่งรูปกลับ)
    slips: slips.filter((x) => x.student_id === sid && x.status === "pending").map((x) => ({ id: x.id, month: x.month, amount: x.amount, created_at: x.created_at })),
  };
}

type Hist = { kind: "fee" | "exam"; id: string; title: string; at: string; state: string; amount: number; due: string; link: string; link_label: string };
function buildHistory(sid: string, months: Awaited<ReturnType<typeof feeStatusFor>>["months"], exams: Awaited<ReturnType<typeof readExams>>): Hist[] {
  const ids = (s: string) => String(s ?? "").split(",").map((x) => x.replace(/\D/g, "")).filter(Boolean);
  const fee: Hist[] = months.map((m) => ({
    kind: "fee", id: m.month, title: m.label, at: m.created_at || m.due || `${m.month.slice(0, 7)}-01T00:00:00+07:00`,
    state: m.state, amount: m.amount, due: m.due, link: m.link, link_label: m.link_label,
  }));
  const ex: Hist[] = exams.map((e) => {
    const missing = ids(e.not_memorized_ids).includes(sid);
    const checked = !!(e.check_at || ids(e.not_memorized_ids).length);
    return {
      kind: "exam", id: e.exam_id, title: e.name, at: e.exam_date || e.created_at,
      state: missing ? (ids(e.accepted_ids ?? "").includes(sid) ? "accepted" : "missing") : checked ? "ok" : "open",
      amount: 0, due: e.exam_date || "", link: e.doc_link || "", link_label: "เอกสาร",
    };
  });
  return [...fee, ...ex].sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}

export async function appState(sid: string, opts: { fixtureDraw?: string } = {}) {
  const [board, mine] = await Promise.all([publicBoard(), personalState(sid)]);
  let payload = { board, mine };
  // โหมดข้อมูลตัวอย่าง (เฉพาะเครื่อง dev) — ไม่มีผลบน production
  if (fixtureEnabled()) payload = applyFixture(JSON.parse(JSON.stringify(payload)), { draw: opts.fixtureDraw });
  const version = createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
  return { ...payload, version, serverTime: Date.now() };
}
