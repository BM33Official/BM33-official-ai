// คิวข้อความขาออกที่ต้องอนุมัติ (BC_outbox) — "ไม่มีอะไรถึงเพื่อน ๆ โดยไม่ผ่านคน"
// ระบบ (เตือนเดดไลน์/สรุป/ผลสุ่ม) สร้างรายการ -> DM หาผู้อนุมัติ (เจ้าของ) พร้อมพรีวิว
// -> ผู้อนุมัติพิมพ์ "approve" / "approve 123" ใน LINE หรือกดปุ่มในกล่องรอตรวจ -> ระบบส่ง
import { messagingApi } from "@line/bot-sdk";
import { readKey, readKeyFresh, appendRecord, patchRecord, nowISO, newId, digits } from "@/lib/bc/sheets";
import { OutboxItem, Member } from "@/lib/bc/types";
import { verifiedMembers } from "@/lib/bc/members";
import { segmentRecipients } from "@/lib/bc/status";
import { approverIds } from "@/lib/bc/config";
import { multicastTo, pushTo, messageQuota } from "@/lib/line";
import { log } from "@/lib/logger";

type Msg = messagingApi.Message;

export async function readOutbox(force = false): Promise<OutboxItem[]> {
  const rows = force ? await readKeyFresh<OutboxItem>("outbox") : await readKey<OutboxItem>("outbox");
  return rows.filter((o) => o.id);
}
export async function pendingOutbox(force = false): Promise<OutboxItem[]> {
  const now = Date.now();
  return (await readOutbox(force)).filter((o) => o.status === "pending" && !(o.expires_at && new Date(o.expires_at).getTime() < now));
}

async function nextCode(): Promise<string> {
  const used = new Set((await readOutbox(true)).filter((o) => o.status === "pending").map((o) => o.code));
  for (let i = 0; i < 50; i++) {
    const c = String(100 + Math.floor(Math.random() * 900));
    if (!used.has(c)) return c;
  }
  return String(Date.now() % 1000);
}

export async function resolveAudience(audience: string): Promise<Member[]> {
  const [kind, arg = ""] = audience.split(":");
  if (kind === "undone") return segmentRecipients(arg, "undone");
  if (kind === "ids") {
    const set = new Set(arg.split(",").map(digits).filter(Boolean));
    return (await verifiedMembers()).filter((m) => set.has(digits(m.matched_student_id)));
  }
  if (kind === "admins") return (await approverIds()).map((id) => ({ line_user_id: id } as Member));
  return verifiedMembers(); // all
}

export function audienceLabel(audience: string): string {
  const [kind, arg = ""] = audience.split(":");
  if (kind === "undone") return "เฉพาะคนที่ยังไม่ทำฟอร์ม";
  if (kind === "ids") return `เฉพาะ ${arg.split(",").filter(Boolean).length} คนที่เกี่ยวข้อง`;
  if (kind === "admins") return "เฉพาะแอดมิน";
  return "ทุกคนที่ลงทะเบียน";
}

// ช่องในชีตเก็บได้ ≤ 50,000 ตัวอักษร — ข้อความเฉพาะคน 100 คนเกินแน่ ๆ -> gzip+base64 เมื่อยาว
export function packMessages(v: unknown): string {
  const raw = JSON.stringify(v);
  if (raw.length < 40_000) return raw;
  const { gzipSync } = require("node:zlib") as typeof import("node:zlib");
  const packed = JSON.stringify({ gz: gzipSync(Buffer.from(raw, "utf8"), { level: 9 }).toString("base64") });
  if (packed.length > 49_000) throw new Error(`ข้อความยาวเกินเก็บได้ (${packed.length} ตัวอักษรหลังบีบอัด)`);
  return packed;
}
export function unpackMessages(s: string): unknown {
  const v = JSON.parse(s || "[]");
  if (v && typeof v === "object" && !Array.isArray(v) && typeof v.gz === "string") {
    const { gunzipSync } = require("node:zlib") as typeof import("node:zlib");
    return JSON.parse(gunzipSync(Buffer.from(v.gz, "base64")).toString("utf8"));
  }
  return v;
}

export async function createOutbox(input: {
  kind: string; ref_id?: string; title: string; audience: string; messages: Msg[]; preview: string; expires_at?: string; notify?: boolean;
  // ข้อความเฉพาะคน (key = student id) — เช่น เตือน red zone / เงินค้างที่ใส่ยอดของแต่ละคน
  perRecipient?: Record<string, Msg[]>;
}): Promise<OutboxItem> {
  // กันซ้ำ: ref เดียวกันที่ยังรออยู่ ไม่สร้างใหม่
  if (input.ref_id) {
    const dup = (await readOutbox(true)).find((o) => o.ref_id === input.ref_id && ["pending", "approved", "sent"].includes(o.status));
    if (dup) return dup;
  }
  const item: OutboxItem = {
    id: newId("OB"),
    kind: input.kind,
    ref_id: input.ref_id ?? "",
    title: input.title,
    audience: input.audience,
    messages: input.perRecipient ? packMessages({ per: input.perRecipient }) : packMessages(input.messages.slice(0, 5)),
    preview: input.preview.slice(0, 4000),
    status: "pending",
    code: await nextCode(),
    created_at: nowISO(),
    decided_at: "",
    sent_at: "",
    result: "",
    expires_at: input.expires_at ?? "",
  };
  await appendRecord("outbox", item as unknown as Record<string, string>);
  if (input.notify !== false) await notifyApprovers(item).catch((err) => log.warn("outbox_notify_failed", { message: String(err) }));
  return item;
}

function appBase(): string {
  return (process.env.PUBLIC_BASE_URL || "https://bm-33-official-ai.vercel.app").replace(/\/$/, "");
}

// การ์ดขออนุมัติ (ส่งหาเจ้าของเท่านั้น)
export function approvalFlex(item: OutboxItem, count: number): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: `รออนุมัติ #${item.code}: ${item.title}`.slice(0, 390),
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#1D4ED8", paddingAll: "14px",
        contents: [
          { type: "text", text: `รออนุมัติส่ง · #${item.code}`, color: "#DBEAFE", size: "xs", weight: "bold" },
          { type: "text", text: item.title.slice(0, 80) || "ข้อความ", color: "#FFFFFF", size: "md", weight: "bold", wrap: true, margin: "sm" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: `ส่งถึง: ${audienceLabel(item.audience)} (${count} คน)`, size: "xs", color: "#64748B", wrap: true },
          { type: "separator", margin: "md" },
          { type: "text", text: item.preview.slice(0, 900) || "-", size: "sm", color: "#0F172A", wrap: true, margin: "md" },
          { type: "text", text: `พิมพ์ "approve ${item.code}" เพื่อส่ง หรือ "reject ${item.code}" เพื่อยกเลิก`, size: "xxs", color: "#94A3B8", wrap: true, margin: "lg" },
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "box", layout: "horizontal", spacing: "sm", contents: [
            { type: "button", style: "secondary", height: "sm", action: { type: "postback", label: "ไม่ส่ง", data: `outbox:reject:${item.id}`, displayText: `reject ${item.code}` } },
            { type: "button", style: "primary", height: "sm", color: "#1D4ED8", action: { type: "postback", label: "อนุมัติส่ง", data: `outbox:approve:${item.id}`, displayText: `approve ${item.code}` } },
          ] },
          { type: "button", style: "link", height: "sm", action: { type: "uri", label: "แก้ไขในกล่องรอตรวจ", uri: `${appBase()}/admin/inbox` } },
        ],
      },
    },
  };
}

export async function notifyApprovers(item: OutboxItem): Promise<void> {
  const ids = await approverIds();
  if (!ids.length) return;
  const count = (await resolveAudience(item.audience)).length;
  for (const id of ids) await pushTo(id, [approvalFlex(item, count)]);
}

export interface SendOutcome { ok: boolean; count: number; error?: string; item?: OutboxItem }

// อนุมัติ + ส่งจริง
export async function approveAndSend(idOrCode: string, by: string): Promise<SendOutcome> {
  const all = await readOutbox(true);
  const item = all.find((o) => o.id === idOrCode) ?? all.find((o) => o.code === idOrCode && o.status === "pending");
  if (!item?.__row) return { ok: false, count: 0, error: "ไม่พบรายการนี้" };
  if (item.status !== "pending") return { ok: false, count: 0, error: `รายการนี้${item.status === "sent" ? "ส่งไปแล้ว" : "ถูกปิดไปแล้ว"}`, item };
  if (item.expires_at && new Date(item.expires_at).getTime() < Date.now()) {
    await patchRecord("outbox", item.__row, item as never, { status: "expired", decided_at: nowISO() });
    return { ok: false, count: 0, error: "หมดเวลาแล้ว (เลยเดดไลน์)", item };
  }
  let messages: Msg[] = [];
  let per: Record<string, Msg[]> | null = null;
  try {
    const v = unpackMessages(item.messages) as Msg[] | { per?: Record<string, Msg[]> };
    if (Array.isArray(v)) messages = v; else if (v && v.per) per = v.per;
  } catch { /* ignore */ }
  if (!messages.length && !per) return { ok: false, count: 0, error: "ไม่มีข้อความ", item };
  const members = await resolveAudience(item.audience);
  const recipients = members.map((m) => m.line_user_id).filter(Boolean);
  if (!recipients.length) {
    await patchRecord("outbox", item.__row, item as never, { status: "sent", decided_at: nowISO(), sent_at: nowISO(), result: "no_recipients" });
    return { ok: true, count: 0, item };
  }
  const q = await messageQuota();
  if (q.remaining !== null && recipients.length > q.remaining) {
    return { ok: false, count: 0, error: `โควตาไม่พอ (ต้องใช้ ${recipients.length} เหลือ ${q.remaining})`, item };
  }
  await patchRecord("outbox", item.__row, item as never, { status: "approved", decided_at: nowISO(), result: `by ${by}` });
  try {
    if (per) {
      for (const m of members) {
        const msgs = per[digits(m.matched_student_id)];
        if (m.line_user_id && msgs?.length) await pushTo(m.line_user_id, msgs.slice(0, 5));
      }
    } else {
      await multicastTo(recipients, messages);
    }
  } catch (err) {
    const fresh = (await readOutbox(true)).find((o) => o.id === item.id);
    if (fresh?.__row) await patchRecord("outbox", fresh.__row, fresh as never, { status: "failed", result: String(err).slice(0, 300) });
    return { ok: false, count: 0, error: String(err), item };
  }
  const fresh = (await readOutbox(true)).find((o) => o.id === item.id);
  if (fresh?.__row) await patchRecord("outbox", fresh.__row, fresh as never, { status: "sent", sent_at: nowISO(), result: `sent ${recipients.length} · by ${by}` });
  return { ok: true, count: recipients.length, item };
}

export async function rejectOutbox(idOrCode: string, by: string): Promise<boolean> {
  const all = await readOutbox(true);
  const item = all.find((o) => o.id === idOrCode) ?? all.find((o) => o.code === idOrCode && o.status === "pending");
  if (!item?.__row || item.status !== "pending") return false;
  await patchRecord("outbox", item.__row, item as never, { status: "rejected", decided_at: nowISO(), result: `by ${by}` });
  return true;
}

export async function updateOutboxText(id: string, preview: string, messages: Msg[]): Promise<boolean> {
  const item = (await readOutbox(true)).find((o) => o.id === id);
  if (!item?.__row || item.status !== "pending") return false;
  await patchRecord("outbox", item.__row, item as never, { preview, messages: JSON.stringify(messages.slice(0, 5)) });
  return true;
}

// ข้อความเตือนมาตรฐาน: ข้อความ + การ์ดปุ่มลิงก์ (ถ้ามี)
export function reminderMessages(opts: { text: string; title: string; links: { label: string; url: string }[]; color?: string }): Msg[] {
  const msgs: Msg[] = [{ type: "text", text: opts.text.slice(0, 4900) }];
  const links = opts.links.filter((l) => /^https?:\/\//.test(l.url)).slice(0, 4);
  if (links.length) {
    msgs.push({
      type: "flex",
      altText: `ลิงก์: ${opts.title}`.slice(0, 390),
      contents: {
        type: "bubble", size: "kilo",
        body: {
          type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px",
          contents: [
            { type: "text", text: opts.title.slice(0, 60) || "ลิงก์ที่เกี่ยวข้อง", weight: "bold", size: "sm", wrap: true, color: "#0F172A" },
            ...links.map((l, i): messagingApi.FlexButton => ({
              type: "button", style: i === 0 ? "primary" : "secondary", height: "sm", color: i === 0 ? (opts.color || "#1D4ED8") : undefined,
              action: { type: "uri", label: (l.label || "เปิดลิงก์").slice(0, 20), uri: l.url },
            })),
          ],
        },
      },
    });
  }
  return msgs;
}
