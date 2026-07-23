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

export async function runBroadcastCron(now = Date.now()): Promise<{ sent: number; queued: number; done: number; docReminders: number; summaries: number }> {
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

  log.info("broadcast_cron", { sent, queued, done, docReminders, summaries });
  return { sent, queued, done, docReminders, summaries };
}

function safeJSON(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return {}; }
}
