// สรุปเตือนประจำวัน "ฉบับเดียว" — แทนการเตือนทีละเรื่อง
//   • วันละ 1 รายการใน "รออนุมัติ" (แอดมินกดทีเดียว) · เพื่อนได้ข้อความเดียว (+ การ์ดลิงก์)
//   • แต่ละคนเห็นเฉพาะเรื่องที่ "ยังไม่ได้ทำ" ของตัวเอง (กด "กรอกแล้ว"/ระบบเห็นว่ากรอกแล้ว = ไม่อยู่ในรายการ)
//   • ใครไม่มีอะไรค้าง = ไม่ได้รับข้อความ
import { messagingApi } from "@line/bot-sdk";
import { liveAnnouncements, parseLinks } from "@/lib/bc/announcements";
import { readForms } from "@/lib/bc/forms";
import { statusForForm } from "@/lib/bc/status";
import { liveUniExams, examStart } from "@/lib/bc/schedule";
import { verifiedMembers } from "@/lib/bc/members";
import { readRoster } from "@/lib/bc/roster";
import { createOutbox } from "@/lib/bc/outbox";
import { reminderPlan } from "@/lib/bc/config";
import { OutboxItem } from "@/lib/bc/types";
import { bkkDayKey, dayDiff, thDateTime, relativeTh } from "@/lib/time";

type Msg = messagingApi.Message;
const APP = "https://liff.line.me/2011755768-aSlCqo7l";
const digits = (s: string) => String(s ?? "").replace(/\D/g, "");

export interface DigestItem {
  key: string;
  kind: "form" | "deadline" | "exam";
  title: string;
  at: string; // ISO
  links: { label: string; url: string }[];
  forAll: boolean; // true = ทุกคน (สอบ/งานที่ไม่มีฟอร์มให้เช็ก) · false = เฉพาะคนที่ยังไม่ทำ
  undone?: Set<string>; // student ids ที่ยังไม่ทำ (เฉพาะ kind form)
}

const KIND = {
  form: { em: "📝", color: "#E11D48", th: "ต้องกรอก" },
  deadline: { em: "⏰", color: "#D97706", th: "เดดไลน์" },
  exam: { em: "📚", color: "#4F46E5", th: "สอบ" },
} as const;

// รายการที่ใกล้ถึง (ภายในรอบเตือนที่ไกลสุด เช่น 3 วัน) และยังเหลือเวลา > 45 นาที
export async function digestItems(now = Date.now()): Promise<DigestItem[]> {
  const plan = await reminderPlan();
  const window = Math.max(1, ...plan);
  const near = (iso: string) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return !isNaN(t) && t > now + 45 * 60_000 && dayDiff(iso, now) <= window;
  };
  const items: DigestItem[] = [];
  const forms = (await readForms()).filter((f) => f.status !== "closed" && f.status !== "deleted" && near(f.deadline_at ?? ""));
  const formAnn = new Set(forms.map((f) => f.announcement_id).filter(Boolean));
  for (const f of forms) {
    const st = await statusForForm(f).catch(() => []);
    // "claimed" (กดกรอกแล้ว รอตรวจ) นับว่าทำแล้ว — ไม่เตือนซ้ำ
    const undone = new Set(st.filter((s) => s.state === "none").map((s) => digits(s.member.matched_student_id)));
    items.push({ key: `form:${f.form_id}`, kind: "form", title: f.name, at: f.deadline_at!, links: f.link ? [{ label: "เปิดฟอร์ม", url: f.link }] : [], forAll: false, undone });
  }
  for (const a of await liveAnnouncements()) {
    if (!near(a.deadline_at) || formAnn.has(a.id) || a.form_id) continue; // มีฟอร์มแล้ว = ใช้รายการฟอร์มแทน (รู้ว่าใครทำแล้ว)
    items.push({ key: `ann:${a.id}`, kind: "deadline", title: a.title, at: a.deadline_at, links: [...parseLinks(a.links).slice(0, 2), { label: "รายละเอียด", url: `${APP}?a=${encodeURIComponent(a.id)}` }], forAll: true });
  }
  for (const e of await liveUniExams()) {
    const at = examStart(e).toISOString();
    const d = dayDiff(at, now);
    if (new Date(at).getTime() < now || d > 3) continue;
    items.push({ key: `exam:${e.id}`, kind: "exam", title: e.name, at, links: [{ label: "ดูตารางสอบ", url: `${APP}?tab=schedule` }], forAll: true });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

function whenText(iso: string, now: number): string {
  const d = dayDiff(iso, now);
  const t = thDateTime(iso);
  return d <= 0 ? `วันนี้! ${t.split(" ").slice(-2).join(" ")}` : d === 1 ? `พรุ่งนี้ · ${t}` : `อีก ${d} วัน · ${t}`;
}

// ข้อความของคนหนึ่งคน: 1 ข้อความรวม + การ์ดลิงก์เลื่อนได้ (สูงสุด 10 ใบ)
export function digestMessages(nick: string, list: DigestItem[], now = Date.now()): Msg[] {
  const lines = list.map((it, i) => `${i + 1}. ${KIND[it.kind].em} ${it.title}\n    ${whenText(it.at, now)}`);
  const text = `${nick || "เพื่อน"} จ๋า ⏰ สรุปสิ่งที่ใกล้ถึงของเธอ (${list.length} เรื่อง)\n\n${lines.join("\n")}\n\nทำแล้วกด “กรอกแล้ว” ในแอปได้เลย พรุ่งนี้จะไม่เตือนเรื่องนั้นอีก 🙏`;
  const bubbles: messagingApi.FlexBubble[] = list.slice(0, 9).map((it) => ({
    type: "bubble", size: "micro",
    header: { type: "box", layout: "vertical", backgroundColor: KIND[it.kind].color, paddingAll: "10px", contents: [{ type: "text", text: `${KIND[it.kind].em} ${KIND[it.kind].th}`, color: "#FFFFFF", size: "xs", weight: "bold" }] },
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", contents: [
      { type: "text", text: it.title.slice(0, 80), weight: "bold", size: "sm", wrap: true, maxLines: 3 },
      { type: "text", text: relativeTh(it.at, now), size: "xs", color: KIND[it.kind].color, weight: "bold" },
    ] },
    footer: { type: "box", layout: "vertical", spacing: "xs", paddingAll: "10px", contents: (it.links.length ? it.links : [{ label: "เปิดแอป", url: `${APP}?tab=home` }]).slice(0, 2).map((l, i): messagingApi.FlexButton => ({
      type: "button", height: "sm", style: i === 0 ? "primary" : "secondary", color: i === 0 ? KIND[it.kind].color : undefined,
      action: { type: "uri", label: (l.label || "เปิด").slice(0, 20), uri: l.url },
    })) },
  }));
  bubbles.push({
    type: "bubble", size: "micro",
    body: { type: "box", layout: "vertical", justifyContent: "center", paddingAll: "14px", spacing: "md", contents: [
      { type: "text", text: "ดูทุกอย่างในแอป BM33", weight: "bold", size: "sm", wrap: true, align: "center" },
      { type: "button", style: "primary", height: "sm", color: "#1D4ED8", action: { type: "uri", label: "เปิดแอป", uri: `${APP}?tab=home` } },
    ] },
  });
  return [{ type: "text", text: text.slice(0, 4900) }, { type: "flex", altText: `สรุปสิ่งที่ใกล้ถึง ${list.length} เรื่อง`, contents: { type: "carousel", contents: bubbles } }];
}

// สร้าง "สรุปเตือนวันนี้" 1 รายการ (ซ้ำในวันเดียวกันไม่ได้ — ref_id ต่อวัน)
export async function queueDailyDigest(now = Date.now(), opts: { force?: boolean } = {}): Promise<{ item: OutboxItem | null; people: number; items: number }> {
  const items = await digestItems(now);
  if (!items.length) return { item: null, people: 0, items: 0 };
  const [members, roster] = await Promise.all([verifiedMembers(), readRoster()]);
  const nick = new Map(roster.map((r) => [r.student_id, r.nickname || r.full_name]));
  const per: Record<string, Msg[]> = {};
  const counts = new Map<string, number>();
  for (const m of members) {
    const sid = digits(m.matched_student_id);
    if (!sid) continue;
    const mine = items.filter((it) => it.forAll || it.undone?.has(sid));
    if (!mine.length) continue;
    per[sid] = digestMessages(nick.get(sid) ?? "", mine, now);
    for (const it of mine) counts.set(it.key, (counts.get(it.key) ?? 0) + 1);
  }
  const ids = Object.keys(per);
  if (!ids.length) return { item: null, people: 0, items: items.length };
  const day = bkkDayKey(now);
  const sample = (per[ids[0]][0] as { text?: string }).text ?? "";
  const summary = items.map((it) => `• ${KIND[it.kind].em} ${it.title} — ${relativeTh(it.at, now)} (${counts.get(it.key) ?? 0} คน)`).join("\n");
  const item = await createOutbox({
    kind: "digest",
    ref_id: opts.force ? `digest:${day}:${now}` : `digest:${day}`,
    title: `สรุปเตือนวันนี้ · ${items.length} เรื่อง · ${ids.length} คน`,
    audience: `ids:${ids.join(",")}`, messages: [], perRecipient: per,
    preview: `ส่งเป็นข้อความเดียวต่อคน — แต่ละคนเห็นเฉพาะเรื่องที่ยังไม่ได้ทำ\n\n${summary}\n\n— ตัวอย่างที่ ${nick.get(ids[0]) ?? ""} จะได้รับ —\n${sample}`,
    expires_at: new Date(new Date(`${day}T23:59:00+07:00`).getTime()).toISOString(),
  });
  return { item, people: ids.length, items: items.length };
}
