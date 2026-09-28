// "เตือนรวม" — แอดมินอนุมัติครั้งเดียว · เพื่อนแต่ละคนได้ข้อความเดียว (การ์ดเลื่อนได้ + ปุ่มลิงก์)
//   • ระบบเก็บ "เรื่องที่จะเตือน" ไว้ในรายการรออนุมัติรายการเดียว (BC_outbox kind=digest, messages = {keys})
//   • ทุกเช้า 08:00 ระบบเพิ่มเรื่องที่ใกล้ถึง + ส่ง LINE หาแอดมิน "ข้อความเดียว" สรุปทุกเรื่อง
//   • ปุ่ม "เตือน" รายเรื่อง (ประกาศ/ฟอร์ม) = เพิ่มเข้ารายการเดียวกัน ไม่แยกอนุมัติทีละเรื่อง
//   • แอดมินติ๊กเลือกเรื่องใน "รออนุมัติ" (หรือกด "ส่งทุกเรื่อง" / พิมพ์ approve 123 1 3 ใน LINE)
//     -> ตอนกดส่ง ระบบคำนวณสด: แต่ละคนเห็นเฉพาะเรื่องที่ "ยังไม่ได้ทำ" ของตัวเอง · ไม่มีอะไรค้าง = ไม่ได้รับ
import { messagingApi } from "@line/bot-sdk";
import { readAnnouncements, parseLinks } from "@/lib/bc/announcements";
import { readForms } from "@/lib/bc/forms";
import { statusForForm } from "@/lib/bc/status";
import { liveUniExams, examStart } from "@/lib/bc/schedule";
import { verifiedMembers } from "@/lib/bc/members";
import { readRoster } from "@/lib/bc/roster";
import { readOutbox, createOutbox, packMessages, unpackMessages } from "@/lib/bc/outbox";
import { patchRecord, nowISO } from "@/lib/bc/sheets";
import { approverIds, reminderPlan, getConfigValue, setConfig } from "@/lib/bc/config";
import { pushTo } from "@/lib/line";
import { OutboxItem } from "@/lib/bc/types";
import { bkkDayKey, bkkParts, dayDiff, thDateTime, relativeTh } from "@/lib/time";
import { log } from "@/lib/logger";

type Msg = messagingApi.Message;
const APP = "https://liff.line.me/2011755768-aSlCqo7l";
const digits = (s: string) => String(s ?? "").replace(/\D/g, "");

export interface DigestItem {
  key: string; // form:<id> | ann:<id> | exam:<id>
  kind: "form" | "deadline" | "exam" | "news";
  title: string;
  at: string; // ISO ("" = ไม่มีกำหนด)
  links: { label: string; url: string }[];
  forAll: boolean; // true = ทุกคน · false = เฉพาะคนที่ยังไม่ทำ (ฟอร์ม)
  undone?: Set<string>; // student ids ที่ยังไม่ทำ (เฉพาะ kind form)
  suggested: boolean; // อยู่ในรอบเตือน (เช่น ภายใน 1 วัน) -> ระบบเสนอให้เตือนเอง
}

export const KIND = {
  form: { em: "📝", color: "#E11D48", th: "ต้องกรอก" },
  deadline: { em: "⏰", color: "#D97706", th: "เดดไลน์" },
  exam: { em: "📚", color: "#4F46E5", th: "สอบ" },
  news: { em: "📢", color: "#1D4ED8", th: "ประกาศ" },
} as const;

// ทุกเรื่องที่ "เตือนได้" ตอนนี้ (ยังไม่หมดเวลา) — suggested = อยู่ในรอบเตือนอัตโนมัติ
export async function reminderCandidates(now = Date.now()): Promise<DigestItem[]> {
  const plan = await reminderPlan();
  const window = Math.max(1, ...plan);
  const alive = (iso: string) => { const t = new Date(iso).getTime(); return !isNaN(t) && t > now + 45 * 60_000; };
  const near = (iso: string) => !!iso && alive(iso) && dayDiff(iso, now) <= window;
  const items: DigestItem[] = [];

  const forms = (await readForms()).filter((f) => f.status !== "closed" && f.status !== "deleted" && (!f.deadline_at || alive(f.deadline_at)));
  const formAnn = new Set(forms.map((f) => f.announcement_id).filter(Boolean));
  for (const f of forms) {
    const st = await statusForForm(f).catch(() => []);
    // "claimed" (กดกรอกแล้ว รอตรวจ) นับว่าทำแล้ว — ไม่เตือนซ้ำ
    const undone = new Set(st.filter((s) => s.state === "none").map((s) => digits(s.member.matched_student_id)));
    items.push({ key: `form:${f.form_id}`, kind: "form", title: f.name, at: f.deadline_at ?? "", links: f.link ? [{ label: "เปิดฟอร์ม", url: f.link }] : [], forAll: false, undone, suggested: near(f.deadline_at ?? "") });
  }
  const recent = now - 7 * 86_400_000;
  for (const a of await readAnnouncements()) {
    if (a.status !== "live" || formAnn.has(a.id) || a.form_id) continue; // มีฟอร์มแล้ว = ใช้รายการฟอร์มแทน (รู้ว่าใครทำแล้ว)
    if (a.deadline_at && !alive(a.deadline_at)) continue;
    if (!a.deadline_at && new Date(a.created_at || 0).getTime() < recent) continue;
    const links = [...parseLinks(a.links).slice(0, 2), { label: "รายละเอียด", url: `${APP}?a=${encodeURIComponent(a.id)}` }];
    items.push({ key: `ann:${a.id}`, kind: a.deadline_at ? "deadline" : "news", title: a.title, at: a.deadline_at || "", links, forAll: true, suggested: near(a.deadline_at) });
  }
  for (const e of await liveUniExams()) {
    const at = examStart(e).toISOString();
    if (new Date(at).getTime() < now || dayDiff(at, now) > 7) continue;
    items.push({ key: `exam:${e.id}`, kind: "exam", title: e.name, at, links: [{ label: "ดูตารางสอบ", url: `${APP}?tab=schedule` }], forAll: true, suggested: dayDiff(at, now) <= 3 });
  }
  return items.sort((a, b) => (a.at || "9").localeCompare(b.at || "9"));
}

// ref เก่า (ann:<id>:d3 / form:<id>:manual-…) -> key มาตรฐาน · ประกาศที่ผูกฟอร์ม -> ใช้ key ของฟอร์ม
export async function normalizeKeys(keys: string[]): Promise<string[]> {
  const [anns, forms] = await Promise.all([readAnnouncements(), readForms()]);
  const formOfAnn = new Map<string, string>();
  for (const f of forms) if (f.announcement_id && f.status !== "deleted") formOfAnn.set(f.announcement_id, f.form_id);
  for (const a of anns) if (a.form_id) formOfAnn.set(a.id, a.form_id);
  const out: string[] = [];
  for (const raw of keys) {
    const [kind, id] = String(raw).split(":");
    if (!id || !["form", "ann", "exam"].includes(kind)) continue;
    const k = kind === "ann" && formOfAnn.has(id) ? `form:${formOfAnn.get(id)}` : `${kind}:${id}`;
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

function whenText(iso: string, now: number): string {
  if (!iso) return "";
  const d = dayDiff(iso, now);
  const t = thDateTime(iso);
  return d <= 0 ? `วันนี้! ${t.split(" ").slice(-2).join(" ")}` : d === 1 ? `พรุ่งนี้ · ${t}` : `อีก ${d} วัน · ${t}`;
}

// ข้อความของคนหนึ่งคน = LINE message "เดียว": การ์ดสรุป + การ์ดทีละเรื่อง (ปุ่มลิงก์) เลื่อนได้
export function digestMessages(nick: string, list: DigestItem[], now = Date.now()): Msg[] {
  const shown = list.slice(0, 10);
  const summary: messagingApi.FlexBubble = {
    type: "bubble", size: "kilo",
    header: { type: "box", layout: "vertical", backgroundColor: "#1D4ED8", paddingAll: "14px", contents: [
      { type: "text", text: `${nick || "เพื่อน"} จ๋า ⏰`, color: "#DBEAFE", size: "xs", weight: "bold" },
      { type: "text", text: `สิ่งที่ต้องทำ ${list.length} เรื่อง`, color: "#FFFFFF", size: "lg", weight: "bold", margin: "xs" },
    ] },
    body: { type: "box", layout: "vertical", spacing: "md", paddingAll: "14px", contents: [
      ...shown.map((it): messagingApi.FlexBox => ({
        type: "box", layout: "vertical", spacing: "xs", contents: [
          { type: "text", text: `${KIND[it.kind].em} ${it.title}`.slice(0, 90), size: "sm", weight: "bold", wrap: true, maxLines: 2, color: "#0F172A" },
          ...(it.at ? [{ type: "text", text: whenText(it.at, now), size: "xxs", color: KIND[it.kind].color, weight: "bold" } as messagingApi.FlexText] : []),
        ],
      })),
      { type: "text", text: "เลื่อนดูลิงก์ทีละเรื่อง → ทำแล้วติ๊กในแอป จะไม่ถูกเตือนเรื่องนั้นอีก 🙏", size: "xxs", color: "#64748B", wrap: true, margin: "lg" },
    ] },
    footer: { type: "box", layout: "vertical", paddingAll: "12px", contents: [
      { type: "button", style: "primary", height: "sm", color: "#1D4ED8", action: { type: "uri", label: "เปิดแอป BM33", uri: `${APP}?tab=home` } },
    ] },
  };
  const bubbles: messagingApi.FlexBubble[] = shown.map((it) => ({
    type: "bubble", size: "micro",
    header: { type: "box", layout: "vertical", backgroundColor: KIND[it.kind].color, paddingAll: "10px", contents: [{ type: "text", text: `${KIND[it.kind].em} ${KIND[it.kind].th}`, color: "#FFFFFF", size: "xs", weight: "bold" }] },
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", contents: [
      { type: "text", text: it.title.slice(0, 80), weight: "bold", size: "sm", wrap: true, maxLines: 3 },
      { type: "text", text: it.at ? relativeTh(it.at, now) : "ประกาศใหม่", size: "xs", color: KIND[it.kind].color, weight: "bold" },
    ] },
    footer: { type: "box", layout: "vertical", spacing: "xs", paddingAll: "10px", contents: (it.links.length ? it.links : [{ label: "เปิดแอป", url: `${APP}?tab=home` }]).slice(0, 2).map((l, i): messagingApi.FlexButton => ({
      type: "button", height: "sm", style: i === 0 ? "primary" : "secondary", color: i === 0 ? KIND[it.kind].color : undefined,
      action: { type: "uri", label: (l.label || "เปิด").slice(0, 20), uri: l.url },
    })) },
  }));
  return [{ type: "flex", altText: `${nick || "เพื่อน"} จ๋า มี ${list.length} เรื่องที่ต้องทำ: ${list.map((i) => i.title).join(" · ")}`.slice(0, 390), contents: { type: "carousel", contents: [summary, ...bubbles] } }];
}

export interface Compiled {
  items: DigestItem[]; // เรียงตาม keys ที่ขอ (เฉพาะที่ยังไม่หมดเวลา)
  per: Record<string, Msg[]>; // student id -> ข้อความ
  counts: Record<string, number>; // key -> จำนวนคนที่จะได้เรื่องนี้
  sample: { nick: string; titles: string[] } | null;
}

// ประกอบข้อความเฉพาะคนจากเรื่องที่เลือก (คำนวณสด ณ ตอนส่ง)
export async function compileBatch(keys: string[], now = Date.now()): Promise<Compiled> {
  const want = await normalizeKeys(keys);
  const all = await reminderCandidates(now);
  const byKey = new Map(all.map((i) => [i.key, i]));
  const items = want.map((k) => byKey.get(k)).filter(Boolean) as DigestItem[];
  const [members, roster] = await Promise.all([verifiedMembers(), readRoster()]);
  const nick = new Map(roster.map((r) => [r.student_id, r.nickname || r.full_name]));
  const per: Record<string, Msg[]> = {};
  const counts: Record<string, number> = {};
  let sample: Compiled["sample"] = null;
  for (const m of members) {
    const sid = digits(m.matched_student_id);
    if (!sid || !m.line_user_id) continue;
    const mine = items.filter((it) => it.forAll || it.undone?.has(sid));
    if (!mine.length) continue;
    per[sid] = digestMessages(nick.get(sid) ?? "", mine, now);
    for (const it of mine) counts[it.key] = (counts[it.key] ?? 0) + 1;
    if (!sample || mine.length > sample.titles.length) sample = { nick: nick.get(sid) ?? "", titles: mine.map((i) => i.title) };
  }
  return { items, per, counts, sample };
}

// ── รายการรออนุมัติ "เตือนรวม" (เปิดได้ทีละ 1 รายการ) ─────────────────────────
export function batchKeys(o: OutboxItem): string[] | null {
  if (o.kind !== "digest") return null;
  try {
    const v = unpackMessages(o.messages) as { keys?: string[] };
    return v && !Array.isArray(v) && Array.isArray(v.keys) ? v.keys : null;
  } catch { return null; }
}

export async function openBatch(): Promise<{ item: OutboxItem; keys: string[] } | null> {
  const rows = await readOutbox(true);
  for (const o of rows.slice().reverse()) {
    if (o.status !== "pending") continue;
    const keys = batchKeys(o);
    if (keys) return { item: o, keys };
  }
  return null;
}

function batchPreview(items: DigestItem[], counts: Record<string, number>, now: number): string {
  return items.map((it, i) => `${i + 1}. ${KIND[it.kind].em} ${it.title}${it.at ? ` — ${relativeTh(it.at, now)}` : ""} (${counts[it.key] ?? 0} คน)`).join("\n");
}

// เพิ่มเรื่องเข้า "เตือนรวม" (สร้างใหม่ถ้ายังไม่มี) · ดูดรายการเตือนรายเรื่องแบบเก่าที่ค้างอยู่เข้ามาด้วย
export async function addToBatch(add: string[], opts: { notify?: boolean; now?: number } = {}): Promise<{ item: OutboxItem; keys: string[]; people: number } | null> {
  const now = opts.now ?? Date.now();
  const rows = await readOutbox(true);
  // รายการเตือนเก่า (ทีละเรื่อง) ที่ยังรอ -> รวมเข้ามา แล้วปิดเป็น merged (ไม่ลบแถว)
  const legacy = rows.filter((o) => o.status === "pending" && o.kind === "deadline" && /^(ann|form):/.test(o.ref_id));
  const open = await openBatch();
  const cands = await reminderCandidates(now);
  const order = new Map(cands.map((c, i) => [c.key, i]));
  let keys = await normalizeKeys([...(open?.keys ?? []), ...add, ...legacy.map((o) => o.ref_id)]);
  keys = keys.filter((k) => order.has(k)).sort((a, b) => order.get(a)! - order.get(b)!);
  if (!keys.length && !open) {
    for (const o of legacy) if (o.__row) await patchRecord("outbox", o.__row, o as never, { status: "expired", decided_at: nowISO(), result: "หมดเวลา/รวมเข้าเตือนรวม" });
    return null;
  }
  const c = await compileBatch(keys, now);
  const people = Object.keys(c.per).length;
  const title = `เตือนรวม · ${c.items.length} เรื่อง · ${people} คน`;
  const preview = `ส่งเป็นข้อความเดียวต่อคน — แต่ละคนเห็นเฉพาะเรื่องที่ยังไม่ได้ทำ\n\n${batchPreview(c.items, c.counts, now)}`;
  let item: OutboxItem;
  if (open?.item.__row) {
    const patch = { messages: packMessages({ keys }), title, preview: preview.slice(0, 4000) };
    await patchRecord("outbox", open.item.__row, open.item as never, patch);
    item = { ...open.item, ...patch };
  } else {
    item = await createOutbox({ kind: "digest", ref_id: `batch:${bkkDayKey(now)}:${now}`, title, audience: "batch", messages: [], payload: { keys }, preview, notify: false });
  }
  for (const o of legacy) if (o.__row) await patchRecord("outbox", o.__row, o as never, { status: "merged", decided_at: nowISO(), result: `รวมเข้าเตือนรวม #${item.code}` });
  if (opts.notify) await notifyBatch(item, c, now).catch((err) => log.warn("batch_notify_failed", { message: String(err).slice(0, 200) }));
  return { item, keys, people };
}

// ทุก ~15 นาที (broadcast cron): รวมรายการเก่าที่ค้าง · ตั้งแต่ 08:00 เสนอเรื่องที่ใกล้ถึง + LINE หาแอดมิน "วันละครั้ง"
export async function runDailyBatch(now = Date.now()): Promise<number> {
  const day = bkkDayKey(now);
  const hour = bkkParts(now).hh;
  const due = hour >= 8 && hour < 21 && (await getConfigValue("digest_auto_day")) !== day;
  if (!due) {
    // นอกเวลา: แค่รวมรายการเตือนแบบเก่าที่ค้าง (ไม่ส่ง LINE)
    const legacy = (await readOutbox()).some((o) => o.status === "pending" && o.kind === "deadline" && /^(ann|form):/.test(o.ref_id));
    if (legacy) await addToBatch([], { now });
    return 0;
  }
  await setConfig("digest_auto_day", day, "เตือนรวมอัตโนมัติรอบล่าสุด");
  const cands = await reminderCandidates(now);
  const suggested = cands.filter((c) => c.suggested && (c.forAll || (c.undone?.size ?? 0) > 0)).map((c) => c.key);
  const open = await openBatch();
  if (!suggested.length && !open) { await addToBatch([], { now }); return 0; }
  const r = await addToBatch(suggested, { notify: true, now });
  return r ? 1 : 0;
}

function appBase(): string {
  return (process.env.PUBLIC_BASE_URL || "https://bm-33-official-ai.vercel.app").replace(/\/$/, "");
}

// LINE หาแอดมิน = "ข้อความเดียว" สรุปทุกเรื่อง + ปุ่ม ส่งทุกเรื่อง / เลือกเอง / ไม่ส่ง
export function batchFlex(item: OutboxItem, c: Compiled, now = Date.now()): messagingApi.FlexMessage {
  const people = Object.keys(c.per).length;
  const rows = c.items.slice(0, 12).map((it, i): messagingApi.FlexBox => ({
    type: "box", layout: "horizontal", spacing: "md", contents: [
      { type: "text", text: String(i + 1), size: "sm", weight: "bold", color: KIND[it.kind].color, flex: 0 },
      { type: "box", layout: "vertical", flex: 1, contents: [
        { type: "text", text: `${KIND[it.kind].em} ${it.title}`.slice(0, 80), size: "sm", weight: "bold", wrap: true, maxLines: 2, color: "#0F172A" },
        { type: "text", text: `${it.at ? `${relativeTh(it.at, now)} · ` : ""}${it.forAll ? "ทุกคน" : "ยังไม่ทำ"} ${c.counts[it.key] ?? 0} คน`, size: "xxs", color: "#64748B" },
      ] },
    ],
  }));
  return {
    type: "flex",
    altText: `เตือนรวม #${item.code}: ${c.items.length} เรื่อง ส่งถึง ${people} คน — กดส่งได้เลย`.slice(0, 390),
    contents: {
      type: "bubble",
      header: { type: "box", layout: "vertical", backgroundColor: "#1D4ED8", paddingAll: "14px", contents: [
        { type: "text", text: `เตือนรวมวันนี้ · #${item.code}`, color: "#DBEAFE", size: "xs", weight: "bold" },
        { type: "text", text: `${c.items.length} เรื่อง → ${people} คน`, color: "#FFFFFF", size: "lg", weight: "bold", margin: "sm" },
        { type: "text", text: "คนละ 1 ข้อความ · เห็นเฉพาะเรื่องที่ตัวเองยังไม่ทำ", color: "#BFDBFE", size: "xxs", wrap: true, margin: "xs" },
      ] },
      body: { type: "box", layout: "vertical", spacing: "md", contents: [
        ...(rows.length ? rows : [{ type: "text", text: "ยังไม่มีเรื่องที่ต้องเตือน", size: "sm", color: "#64748B" } as messagingApi.FlexText]),
        { type: "separator", margin: "lg" },
        { type: "text", text: `ส่งบางเรื่อง: พิมพ์ "approve ${item.code} 1 3" (เลขข้อ) · หรือเลือกในระบบ`, size: "xxs", color: "#94A3B8", wrap: true, margin: "md" },
      ] },
      footer: { type: "box", layout: "vertical", spacing: "sm", contents: [
        { type: "button", style: "primary", height: "sm", color: "#16A34A", action: { type: "postback", label: "ส่งทุกเรื่องเลย", data: `outbox:approve:${item.id}`, displayText: `approve ${item.code}` } },
        { type: "box", layout: "horizontal", spacing: "sm", contents: [
          { type: "button", style: "secondary", height: "sm", action: { type: "uri", label: "เลือกเอง", uri: `${appBase()}/admin/inbox` } },
          { type: "button", style: "secondary", height: "sm", action: { type: "postback", label: "ไม่ส่งรอบนี้", data: `outbox:reject:${item.id}`, displayText: `reject ${item.code}` } },
        ] },
      ] },
    },
  };
}

export async function notifyBatch(item: OutboxItem, c?: Compiled, now = Date.now()): Promise<void> {
  const ids = await approverIds();
  if (!ids.length) return;
  const compiled = c ?? await compileBatch(batchKeys(item) ?? [], now);
  if (!compiled.items.length) return;
  const msg = batchFlex(item, compiled, now);
  for (const id of ids) await pushTo(id, [msg]);
}
