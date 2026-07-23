// เครื่องยนต์ broadcast — สร้างข้อความ, หาผู้รับ, ส่ง (test/จริง), log, อัปเดตสถานะ
import { messagingApi } from "@line/bot-sdk";
import { multicastTo, pushTo, messageQuota } from "@/lib/line";
import { broadcastFlex } from "@/lib/line-cards";
import { readTab, appendRecord, patchRecord, nowISO } from "@/lib/bc/sheets";
import { appendRows } from "@/lib/google-sheets";
import { TABS, Broadcast, Member } from "@/lib/bc/types";
import { segmentRecipients } from "@/lib/bc/status";

type Msg = messagingApi.Message;

export async function readBroadcasts(): Promise<Broadcast[]> {
  return readTab<Broadcast>(TABS.broadcasts);
}
export async function getBroadcast(id: string): Promise<Broadcast | null> {
  return (await readBroadcasts()).find((b) => b.id === id) ?? null;
}

// personalize {name}/{nickname} ต่อผู้รับ
function personalize(text: string, m?: Member): string {
  if (!m) return text;
  return (text ?? "")
    .replace(/\{name\}/g, m.display_name || m.claimed_name || "เพื่อน")
    .replace(/\{nickname\}/g, m.display_name || "เพื่อน");
}
export function hasPersonalization(b: Broadcast): boolean {
  return /\{name\}|\{nickname\}/.test(`${b.body_text} ${b.title}`);
}

// สร้าง message objects จาก broadcast (+ member ถ้า personalize)
export function buildMessages(b: Broadcast, m?: Member): Msg[] {
  const body = personalize(b.body_text, m);
  const title = personalize(b.title, m);
  if (b.message_type === "image") {
    const url = (b.image_url ?? "").trim();
    const msgs: Msg[] = [];
    if (url) msgs.push({ type: "image", originalContentUrl: url, previewImageUrl: url });
    // ข้อความประกอบ (แคปชัน) ส่งเป็นข้อความต่อจากรูป ถ้ามี
    if (body) msgs.push({ type: "text", text: body });
    return msgs.length ? msgs : [{ type: "text", text: title || " " }];
  }
  if (b.message_type === "flex") {
    return [broadcastFlex({
      title,
      body,
      headerColor: b.header_color,
      buttonLabel: b.button_label,
      buttonAction: b.button_action,
      buttonValue: b.button_value,
    })];
  }
  return [{ type: "text", text: body || title || " " }];
}

// นับผู้รับ (ไม่ส่ง) — สำหรับ UI
export async function estimateRecipients(b: Broadcast): Promise<Member[]> {
  return segmentRecipients(b.segment_form_id, b.segment_condition);
}

export interface SendResult { ok: boolean; count: number; testMode: boolean; error?: string; blocked?: string }

// ส่ง broadcast จริง (เรียกตอน approve+send now หรือจาก cron)
export async function sendBroadcast(
  b: Broadcast,
  adminIds: string[],
  round = 1,
  markSent = true
): Promise<SendResult> {
  const testMode = b.test_mode === "1";
  // รูปภาพต้องเป็น https (ข้อกำหนดของ LINE)
  if (b.message_type === "image") {
    const url = (b.image_url ?? "").trim();
    if (!/^https:\/\//i.test(url)) {
      return { ok: false, count: 0, testMode, blocked: "รูปภาพต้องเป็นลิงก์ https:// ที่เปิดดูได้ (เช่นจาก Google Drive แบบแชร์รูปตรง หรือ imgur)" };
    }
  }
  let recipients: Member[];
  if (testMode) {
    // โหมดทดสอบ: ส่งหาแอดมินเท่านั้น
    recipients = adminIds.map((id) => ({ line_user_id: id } as Member));
  } else {
    recipients = await estimateRecipients(b);
  }
  const userIds = recipients.map((r) => r.line_user_id).filter(Boolean);
  if (userIds.length === 0) return { ok: false, count: 0, testMode, error: "no_recipients" };

  // guard โควตา (เฉพาะโหมดจริง)
  if (!testMode) {
    const q = await messageQuota();
    if (q.remaining !== null && userIds.length > q.remaining) {
      return { ok: false, count: 0, testMode, blocked: `quota: ต้องใช้ ${userIds.length} แต่เหลือ ${q.remaining}` };
    }
  }

  try {
    if (hasPersonalization(b)) {
      for (const m of recipients) {
        if (!m.line_user_id) continue;
        await pushTo(m.line_user_id, buildMessages(b, m));
      }
    } else {
      await multicastTo(userIds, buildMessages(b));
    }
  } catch (err) {
    return { ok: false, count: 0, testMode, error: String(err) };
  }

  // log ผู้รับ (audit + reminder cap) — ข้ามในโหมดทดสอบ
  if (!testMode) {
    const rows = recipients
      .filter((r) => r.line_user_id)
      .map((r) => [b.id, r.matched_student_id ?? "", r.line_user_id, String(round), nowISO()]);
    if (rows.length) await appendRows(`'${TABS.sendLog}'!A1`, rows);
  }

  if (b.__row && markSent) {
    await patchRecord("broadcasts", b.__row, b as never, {
      status: "sent",
      sent_at: nowISO(),
      result_json: JSON.stringify({ count: userIds.length, testMode, round }),
    });
  }
  return { ok: true, count: userIds.length, testMode };
}

// สร้าง broadcast ใหม่ (draft)
export async function createBroadcast(input: Partial<Broadcast>): Promise<string> {
  const id = `B-${Date.now().toString(36).toUpperCase()}`;
  await appendRecord("broadcasts", {
    id,
    title: input.title ?? "",
    message_type: input.message_type ?? "text",
    template_id: input.template_id ?? "",
    body_text: input.body_text ?? "",
    header_color: input.header_color ?? "#06C755",
    button_label: input.button_label ?? "",
    button_action: input.button_action ?? "",
    button_value: input.button_value ?? "",
    segment_form_id: input.segment_form_id ?? "",
    segment_condition: input.segment_condition ?? "undone",
    status: input.status ?? "draft",
    schedule_at: input.schedule_at ?? "",
    recurring: input.recurring ?? "",
    test_mode: input.test_mode ?? "1",
    created_by: input.created_by ?? "admin",
    approved_by: "",
    created_at: nowISO(),
    sent_at: "",
    result_json: "",
    image_url: input.image_url ?? "",
  });
  return id;
}

export async function patchBroadcast(b: Broadcast, patch: Partial<Broadcast>): Promise<void> {
  if (!b.__row) return;
  await patchRecord("broadcasts", b.__row, b as never, patch as Record<string, string>);
}
