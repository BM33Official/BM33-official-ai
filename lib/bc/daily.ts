// สรุปประจำวันบนแอป (BC_daily) — AI ร่างใหม่ทุกเช้า (05:30 น.) แอดมินแก้ได้ทุกเมื่อ
// รายการที่มีวันเวลาเก็บ "at" เป็น ISO -> แอปคำนวณ "อีกกี่วัน/วันนี้กี่โมง" แบบสด (ไม่ล้าสมัย)
import { z } from "zod";
import { readKey, readKeyFresh, appendRecord, patchRecord, nowISO, newId } from "@/lib/bc/sheets";
import { Daily, DailyItem } from "@/lib/bc/types";
import { liveAnnouncements, parseLinks } from "@/lib/bc/announcements";
import { readForms } from "@/lib/bc/forms";
import { liveSchedule, liveUniExams, examStart } from "@/lib/bc/schedule";
import { readFeeMonths } from "@/lib/bc/fees";
import { generateJSON, Type } from "@/lib/gemini";
import { bkkDayKey, bkkDate, nowContextTh, thDateTime, dayDiff, normalizeISO } from "@/lib/time";
import { log } from "@/lib/logger";

export function parseItems(s: string): DailyItem[] {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v.filter((x) => x && x.text).map((x) => ({
      emoji: String(x.emoji || "•"), text: String(x.text), at: x.at ? String(x.at) : undefined,
      ref: x.ref ? String(x.ref) : undefined, tone: ["urgent", "normal", "good"].includes(x.tone) ? x.tone : "normal",
    })) : [];
  } catch {
    return [];
  }
}

export async function readDailies(force = false): Promise<Daily[]> {
  return force ? readKeyFresh<Daily>("daily") : readKey<Daily>("daily");
}

// สรุปที่กำลังแสดงอยู่ (วันนี้ ถ้าไม่มีใช้ล่าสุดที่ live)
export async function currentDaily(): Promise<Daily | null> {
  const today = bkkDayKey();
  const live = (await readDailies()).filter((d) => d.status === "live" && d.date <= today)
    .sort((a, b) => (b.date + b.updated_at).localeCompare(a.date + a.updated_at));
  return live[0] ?? null;
}

// ── ข้อมูลดิบสำหรับร่างสรุป ────────────────────────────────────────────────
export async function dailyContext(now = Date.now()): Promise<{ text: string; refs: Map<string, string> }> {
  const [ann, forms, sched, exams, fees] = await Promise.all([
    liveAnnouncements(), readForms(), liveSchedule(), liveUniExams(), readFeeMonths(),
  ]);
  const today = bkkDayKey(now);
  const tomorrow = bkkDayKey(now + 86_400_000);
  const refs = new Map<string, string>();
  const lines: string[] = [];

  const upcoming = ann.filter((a) => {
    const dl = a.deadline_at || a.event_at;
    const fresh = now - new Date(a.created_at).getTime() < 4 * 86_400_000;
    return (dl && new Date(dl).getTime() > now - 86_400_000 && dayDiff(dl, now) <= 21) || fresh;
  });
  lines.push("## ประกาศที่ยังเกี่ยวข้อง");
  for (const a of upcoming.slice(0, 25)) {
    refs.set(a.id, a.deadline_at || a.event_at || "");
    lines.push(`- [ref=${a.id}] ${a.title} — ${a.summary}${a.deadline_at ? ` | เดดไลน์ ${thDateTime(a.deadline_at)} (ISO ${a.deadline_at})` : ""}${a.event_at ? ` | วันงาน ${thDateTime(a.event_at)} (ISO ${a.event_at})` : ""}${parseLinks(a.links).length ? " | มีลิงก์" : ""}`);
  }
  const openForms = forms.filter((f) => f.status !== "closed" && (!f.deadline_at || new Date(f.deadline_at).getTime() > now));
  if (openForms.length) {
    lines.push("## ฟอร์มที่เปิดอยู่");
    for (const f of openForms) {
      refs.set(f.form_id, f.deadline_at || "");
      lines.push(`- [ref=${f.form_id}] ${f.name}${f.deadline_at ? ` | ปิด ${thDateTime(f.deadline_at)} (ISO ${f.deadline_at})` : ""}`);
    }
  }
  const todays = sched.filter((s) => s.date === today);
  const tomorrows = sched.filter((s) => s.date === tomorrow);
  lines.push(`## ตารางเรียนวันนี้ (${today})`);
  lines.push(todays.length ? todays.map((s) => `- ${s.start}-${s.end} ${s.subject} ${s.topic} @${s.building} ${s.room}`).join("\n") : "- ไม่มีคาบ");
  lines.push(`## ตารางเรียนพรุ่งนี้ (${tomorrow})`);
  lines.push(tomorrows.length ? tomorrows.map((s) => `- ${s.start}-${s.end} ${s.subject} ${s.topic} @${s.building} ${s.room}`).join("\n") : "- ไม่มีคาบ");
  const nextExams = exams.filter((e) => examStart(e).getTime() > now).slice(0, 3);
  if (nextExams.length) {
    lines.push("## สอบที่ใกล้ที่สุด");
    for (const e of nextExams) {
      const iso = examStart(e).toISOString();
      refs.set(e.id, iso);
      lines.push(`- [ref=${e.id}] ${e.name} ${thDateTime(iso)} (ISO ${iso}) @${e.building} ${e.room}`);
    }
  }
  const month = today.slice(0, 7);
  const fee = fees.find((m) => m.month === month);
  if (fee) {
    const due = /^\d{4}-\d{2}-\d{2}$/.test(fee.due_date) ? bkkDate(fee.due_date, "23:59").toISOString() : "";
    refs.set(`fee:${month}`, due);
    lines.push(`## เงินรุ่นเดือนนี้\n- [ref=fee:${month}] ${fee.amount} บาท${due ? ` ครบกำหนด ${thDateTime(due)} (ISO ${due})` : ""}`);
  }
  return { text: lines.join("\n"), refs };
}

const DailyZ = z.object({
  headline: z.string().default(""),
  items: z.array(z.object({
    emoji: z.string().default("•"),
    text: z.string().default(""),
    at: z.string().default(""),
    ref: z.string().default(""),
    tone: z.string().default("normal"),
  })).default([]),
});

const DAILY_SYSTEM = `คุณคือผู้ช่วยทำ "สรุปประจำวัน" บนแอปของรุ่น BM33 (นักศึกษาแพทย์ปี 2)
- headline: ประโยคทักทายสั้น ๆ อบอุ่น 1 ประโยค (≤ 60 ตัวอักษร) สะท้อนภาพรวมของวัน
- items: 3–7 รายการที่สำคัญที่สุด เรียงจากเร่งด่วนสุด แต่ละรายการ:
  · emoji 1 ตัว · text ≤ 90 ตัวอักษร บอกชัดว่า "อะไร + ต้องทำอะไร + เมื่อไร" (เขียนวันที่แบบไทยให้ชัด เช่น "พฤ. 2 ต.ค. 23:59 น.")
  · at = ISO ของเดดไลน์/เวลานั้น (คัดลอกจาก ISO ในข้อมูลเท่านั้น ถ้าไม่มีให้ "")
  · ref = ค่า ref จากข้อมูล (ถ้ามี) · tone = urgent (ภายใน 2 วัน) | good (ข่าวดี/ไม่มีงาน) | normal
- ถ้าวันนี้ว่าง ให้ใส่ item กำลังใจสั้น ๆ 1 รายการ
ห้ามแต่งข้อมูลที่ไม่มีในข้อมูล ห้ามใช้ markdown`;

export async function generateDaily(opts: { force?: boolean } = {}): Promise<{ id: string; skipped?: string }> {
  const today = bkkDayKey();
  const existing = (await readDailies(true)).filter((d) => d.date === today && d.status !== "deleted");
  // แอดมินแก้ของวันนี้ไปแล้ว -> ไม่ทับ (เว้นแต่สั่งสร้างใหม่เอง)
  if (!opts.force && existing.some((d) => d.source === "edited")) return { id: existing[0].id, skipped: "edited_today" };
  if (!opts.force && existing.length) return { id: existing[0].id, skipped: "exists" };

  const { text, refs } = await dailyContext();
  let headline = "";
  let items: DailyItem[] = [];
  try {
    const { data } = await generateJSON(
      DAILY_SYSTEM,
      `ตอนนี้: ${nowContextTh()}\n<ข้อมูล>\n${text}\n</ข้อมูล>`,
      {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                emoji: { type: Type.STRING }, text: { type: Type.STRING }, at: { type: Type.STRING },
                ref: { type: Type.STRING }, tone: { type: Type.STRING },
              },
              required: ["emoji", "text"],
            },
          },
        },
        required: ["headline", "items"],
      },
      DailyZ as unknown as z.ZodType<z.infer<typeof DailyZ>>,
      { timeoutMs: 40_000, temperature: 0.7, thinking: "LOW", maxOutputTokens: 4096 }
    );
    if (data) {
      headline = data.headline.slice(0, 120);
      items = data.items.filter((i) => i.text).slice(0, 8).map((i) => {
        // ยึด ISO จากข้อมูลจริงเมื่อมี ref (กัน AI พิมพ์วันผิด)
        const at = (i.ref && refs.get(i.ref)) || normalizeISO(i.at) || undefined;
        return { emoji: i.emoji || "•", text: i.text.slice(0, 140), at: at || undefined, ref: i.ref || undefined, tone: (["urgent", "good"].includes(i.tone) ? i.tone : "normal") as DailyItem["tone"] };
      });
    }
  } catch (err) {
    log.warn("daily_ai_failed", { message: String(err).slice(0, 200) });
  }
  if (!items.length) items = fallbackItems(text);
  if (!headline) headline = "สวัสดีตอนเช้า BM33 วันนี้มีอะไรบ้าง มาดูกัน ☀️";

  const payload = { date: today, headline, items: JSON.stringify(items), status: "live", source: "ai", updated_at: nowISO() };
  if (existing[0]?.__row) {
    await patchRecord("daily", existing[0].__row, existing[0] as never, payload);
    return { id: existing[0].id };
  }
  const id = newId("DY");
  await appendRecord("daily", { id, ...payload, created_at: nowISO() });
  return { id };
}

// ถ้า AI ล่ม — สรุปแบบกำหนดเอง (ยังดีกว่าไม่มี)
function fallbackItems(text: string): DailyItem[] {
  const out: DailyItem[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^- \[ref=([^\]]+)\] (.+?)(?: \| (?:เดดไลน์|ปิด|ครบกำหนด) .*?\(ISO ([^)]+)\))?/);
    if (m) out.push({ emoji: "📌", text: m[2].slice(0, 120), ref: m[1], at: m[3], tone: "normal" });
    if (out.length >= 6) break;
  }
  return out.length ? out : [{ emoji: "🌤️", text: "วันนี้ยังไม่มีงานด่วน พักให้พอ แล้วค่อยลุยต่อนะ", tone: "good" }];
}

export async function updateDaily(id: string, patch: { headline?: string; items?: DailyItem[]; status?: string }): Promise<boolean> {
  const d = (await readDailies(true)).find((x) => x.id === id);
  if (!d?.__row) return false;
  await patchRecord("daily", d.__row, d as never, {
    ...(patch.headline != null ? { headline: patch.headline } : {}),
    ...(patch.items ? { items: JSON.stringify(patch.items) } : {}),
    ...(patch.status ? { status: patch.status } : {}),
    source: "edited",
    updated_at: nowISO(),
  });
  return true;
}
