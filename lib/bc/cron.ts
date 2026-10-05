// งานตามเวลา — ส่ง broadcast ที่ตั้งเวลา + จัดการเตือนซ้ำ (recurring)
// เรียกโดย GitHub Actions ทุก ~15-30 นาที ผ่าน /api/broadcast-cron
import { ensureBcTabs } from "@/lib/bc/sheets";
import { adminLineIds } from "@/lib/bc/auth";
import {
  readBroadcasts, sendBroadcast, estimateRecipients, patchBroadcast, createBroadcast,
} from "@/lib/bc/broadcast";
import { Broadcast } from "@/lib/bc/types";
import { runDueDocReminders } from "@/lib/bc/academic";
import { runDueSummaries } from "@/lib/bc/summary";
import { runReminderCron } from "@/lib/bc/reminders";
import { generateDaily } from "@/lib/bc/daily";
import { readDraws, drawPhase, markDrawNotified, drawIds } from "@/lib/bc/draws";
import { createOutbox, reminderMessages, approveAndSend } from "@/lib/bc/outbox";
import { bkkParts } from "@/lib/time";
import { log } from "@/lib/logger";

const DAY = 86_400_000;

function cloneContent(b: Broadcast): Partial<Broadcast> {
  return {
    title: b.title, message_type: b.message_type, template_id: b.template_id,
    body_text: b.body_text, header_color: b.header_color, button_label: b.button_label,
    button_action: b.button_action, button_value: b.button_value,
    segment_form_id: b.segment_form_id, segment_condition: b.segment_condition,
    test_mode: b.test_mode,
  };
}

// งานอัตโนมัติของแอปสมาชิก: สรุปประจำวัน (ตั้งแต่ 05:30 น.) + คิวเตือนเดดไลน์ + แจ้งผลสุ่ม (ทั้งหมดผ่านการอนุมัติ)
export async function runAppAutomation(now = Date.now()): Promise<{ daily: string; reminders: number; draws: number }> {
  let daily = "", reminders = 0, draws = 0;
  const p = bkkParts(now);
  if (p.hh > 5 || (p.hh === 5 && p.mm >= 30)) {
    try { const r = await generateDaily(); daily = r.skipped ?? r.id; } catch (err) { log.warn("daily_cron_failed", { message: String(err).slice(0, 200) }); }
  }
  try { reminders = await runReminderCron(now); } catch (err) { log.warn("reminder_cron_failed", { message: String(err).slice(0, 200) }); }
  try {
    for (const d of await readDraws(true)) {
      if (d.notified || drawPhase(d, now) !== "revealed") continue;
      if (now - new Date(d.reveal_at).getTime() > 3 * 86_400_000) continue;
      const pool = drawIds(d.pool_ids), sel = drawIds(d.selected_ids);
      const rest = pool.filter((x) => !sel.includes(x));
      const app = "https://liff.line.me/2011755768-aSlCqo7l?tab=me";
      if (sel.length) {
        const text = `🎯 ผลการสุ่มกิจกรรม "${d.activity}"\n\nคุณได้รับเลือกให้ร่วมกิจกรรมนี้นะ ขอบคุณที่ช่วยรุ่น 💙\nรายละเอียดเพิ่มเติมฝ่ายวิชาการจะแจ้งอีกครั้ง\n\n(ข้อความนี้ส่งถึงเฉพาะคุณ)`;
        const it = await createOutbox({ kind: "draw", ref_id: `draw:${d.id}:selected`, title: `แจ้งผู้ถูกเลือก: ${d.activity} (${sel.length} คน)`, audience: `ids:${sel.join(",")}`, messages: reminderMessages({ text, title: d.activity, links: [{ label: "ดูในแอป BM33", url: app }] }), preview: text, notify: false });
        // การสุ่มเป็นงานของฝ่ายวิชาการ -> ส่งผลทันที ไม่ต้องรอแอดมิน (แถวใน outbox = ประวัติ)
        await approveAndSend(it.id, "academic:สุ่ม").catch((err) => log.warn("draw_send_failed", { message: String(err).slice(0, 200) }));
      }
      if (rest.length) {
        const text = `🍀 ผลการสุ่มกิจกรรม "${d.activity}"\n\nรอบนี้คุณไม่ได้ถูกเลือกนะ แต่อย่าลืมทยอยจำข้อสอบให้ครบน้า 📘\n\n(ข้อความนี้ส่งถึงเฉพาะคุณ)`;
        const it = await createOutbox({ kind: "draw", ref_id: `draw:${d.id}:rest`, title: `แจ้งผู้ไม่ถูกเลือก: ${d.activity} (${rest.length} คน)`, audience: `ids:${rest.join(",")}`, messages: reminderMessages({ text, title: d.activity, links: [{ label: "ดูในแอป BM33", url: app }] }), preview: text, notify: false });
        await approveAndSend(it.id, "academic:สุ่ม").catch((err) => log.warn("draw_send_failed", { message: String(err).slice(0, 200) }));
      }
      await markDrawNotified(d.id, "sent");
      draws++;
    }
  } catch (err) { log.warn("draw_cron_failed", { message: String(err).slice(0, 200) }); }
  return { daily, reminders, draws };
}

export async function runBroadcastCron(now = Date.now()): Promise<{ sent: number; queued: number; done: number; docReminders: number; summaries: number; app?: unknown }> {
  await ensureBcTabs();
  const admin = adminLineIds();
  const list = await readBroadcasts();
  let sent = 0, queued = 0, done = 0;

  for (const b of list) {
    if (!["scheduled", "approved"].includes(b.status)) continue;
    if (!b.schedule_at || new Date(b.schedule_at).getTime() > now) continue;

    const recurring = b.recurring ? safeJSON(b.recurring) : null;

    // ── ตั้งเวลาแบบครั้งเดียว ──
    if (!recurring) {
      const r = await sendBroadcast(b, admin); // markSent -> status sent
      if (r.ok) sent++;
      else log.warn("cron_send_failed", { id: b.id, error: r.error || r.blocked });
      continue;
    }

    // ── เตือนซ้ำ ──
    const res = b.result_json ? safeJSON(b.result_json) : {};
    const rounds = Number(res.rounds ?? 0);
    const undone = (await estimateRecipients(b)).length;

    if (undone === 0 || rounds >= Number(recurring.cap ?? 1)) {
      await patchBroadcast(b, { status: "sent", result_json: JSON.stringify({ ...res, rounds, finished: true }) });
      done++;
      continue;
    }

    const nextAt = new Date(now + Number(recurring.cadenceDays ?? 3) * DAY).toISOString();
    if (recurring.autoSend) {
      const r = await sendBroadcast(b, admin, rounds + 1, false); // ไม่ปิดแคมเปญ
      await patchBroadcast(b, { schedule_at: nextAt, result_json: JSON.stringify({ rounds: rounds + 1, lastCount: r.count }) });
      sent++;
    } else {
      // เข้าคิวรออนุมัติ (โคลนเนื้อหา, ไม่ recurring)
      await createBroadcast({ ...cloneContent(b), status: "pending" });
      await patchBroadcast(b, { schedule_at: nextAt, result_json: JSON.stringify({ rounds: rounds + 1 }) });
      queued++;
    }
  }

  // ── งานตามเวลาอื่น ๆ: เตือนกรอกเอกสาร (วิชาการ) + สรุปที่ตั้งเวลาไว้ ──
  let docReminders = 0, summaries = 0;
  try { docReminders = await runDueDocReminders(admin, now); } catch (err) { log.warn("due_doc_reminders_failed", { message: String(err) }); }
  try { summaries = await runDueSummaries(admin, now); } catch (err) { log.warn("due_summaries_failed", { message: String(err) }); }

  const app = await runAppAutomation(now).catch((err) => ({ error: String(err).slice(0, 200) }));
  log.info("broadcast_cron", { sent, queued, done, docReminders, summaries });
  return { sent, queued, done, docReminders, summaries, app };
}

function safeJSON(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return {}; }
}
