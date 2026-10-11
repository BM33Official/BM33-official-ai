// helper รวม client + สร้าง message ต่าง ๆ ของ LINE
// verify แล้วกับ @line/bot-sdk v11.2.0:
//   - new messagingApi.MessagingApiClient({ channelAccessToken })
//   - client.replyMessage({ replyToken, messages })
// การ์ด handoff (Flex) อยู่ใน lib/line-cards.ts

import { messagingApi } from "@line/bot-sdk";

export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

// blob client — ใช้ดึงไฟล์รูป/ไฟล์แนบจาก LINE
export const lineBlobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

// ดึงรูปจาก message id -> base64 (สำหรับส่งเข้า Gemini vision)
export async function getImageBase64(
  messageId: string
): Promise<{ base64: string; mimeType: string }> {
  const res = (await lineBlobClient.getMessageContent(messageId)) as unknown;
  let buf: Buffer;
  if (res instanceof Buffer) {
    buf = res;
  } else if (res && typeof (res as { arrayBuffer?: unknown }).arrayBuffer === "function") {
    buf = Buffer.from(await (res as Blob).arrayBuffer());
  } else {
    // Readable stream
    const chunks: Buffer[] = [];
    for await (const c of res as AsyncIterable<Buffer>) chunks.push(Buffer.from(c));
    buf = Buffer.concat(chunks);
  }
  return { base64: buf.toString("base64"), mimeType: "image/jpeg" };
}

// ข้อความ fallback มาตรฐาน (ใช้เมื่อ Gemini ล้ม / MAX_TOKENS)
export const DEFAULT_REPLY =
  "ตอนนี้บอทตอบให้ไม่ได้ ลองพิมพ์ใหม่อีกทีนะ ถ้ายังไม่ได้ทักคนดูแลรุ่นได้เลย 🙏";

// ข้อความตอน Sheet ดึงไม่ได้และไม่มี cache
export const SHEET_UNAVAILABLE_REPLY =
  "ตอนนี้บอทดึงข้อมูลไม่ทัน ลองใหม่อีกทีนะ 🙏";

// self lookup ไม่พบ (บัญชี LINE ยังไม่เชื่อมกับข้อมูลสมาชิก/การเงิน)
export const NOT_LINKED_REPLY =
  "ตอนนี้ยังเช็กข้อมูลรายบุคคลให้ไม่ได้ เพราะบัญชี LINE นี้ยังไม่ได้เชื่อมกับข้อมูลสมาชิกที่ยืนยันแล้ว ลองทักฝ่ายการเงิน/ผู้ดูแลเพื่อยืนยันตัวตนก่อนนะ 🙏";

// ผู้ใช้ทั่วไปขอข้อมูลที่สงวนไว้ให้แอดมิน
export const ADMIN_ONLY_REPLY =
  "ข้อมูลส่วนนี้ขอสงวนไว้ให้ผู้ดูแลรุ่นเท่านั้นนะ ถ้าต้องการข้อมูลนี้ทักผู้ดูแลได้เลย 🙏";

// ข้อความปกติ (plain text)
export function textMessage(text: string): messagingApi.TextMessage {
  return { type: "text", text };
}

// ── ส่งข้อความแบบ "ไม่พังอีก" ────────────────────────────────────────────────
// ทุกการส่งผ่านที่นี่: (1) ทำความสะอาดข้อความตามกฎ LINE (2) ถาม LINE ว่าข้อความถูกไหม (validate — ไม่เสียโควตา)
// (3) ถ้า LINE ไม่รับ -> แปลงเป็นแบบง่ายที่ LINE รับแน่ ๆ อัตโนมัติ (4) ส่งทีละคน ใครส่งไม่ได้ข้ามไป ไม่ล้มทั้งชุด
type Msg = messagingApi.Message;
type AnyObj = Record<string, unknown>;

// ข้อความ error ที่อ่านรู้เรื่อง (LINE ส่งรายละเอียดมาใน body เช่น property ไหนผิด)
export function lineErrorText(err: unknown): string {
  const e = err as { status?: number; body?: string; message?: string };
  if (e && typeof e.body === "string" && e.body) {
    try {
      const j = JSON.parse(e.body) as { message?: string; details?: { message?: string; property?: string }[] };
      const d = (j.details ?? []).map((x) => `${x.property ?? ""} ${x.message ?? ""}`.trim()).filter(Boolean).slice(0, 3).join(" · ");
      return `LINE ${e.status ?? ""}: ${j.message ?? ""}${d ? ` (${d})` : ""}`.trim();
    } catch { return `LINE ${e.status ?? ""}: ${e.body.slice(0, 200)}`; }
  }
  return String(e?.message ?? err).slice(0, 300);
}

const chars = (s: string) => Array.from(s ?? "");
const clip = (s: unknown, n: number) => chars(String(s ?? "")).slice(0, n).join("");
// ลิงก์ที่ LINE รับ: http(s) / line / tel · ภาษาไทย/ช่องว่างต้อง encode
export function safeUri(u: unknown): string | null {
  let s = String(u ?? "").trim();
  if (!s) return null;
  if (/^(www\.|[a-z0-9-]+\.[a-z]{2,}\/)/i.test(s)) s = `https://${s}`;
  if (!/^(https?:\/\/|line:\/\/|tel:)/i.test(s)) return null;
  try { s = encodeURI(decodeURI(s)); } catch { s = encodeURI(s); }
  return s.length <= 1000 ? s : null;
}

// ทำความสะอาด flex/ข้อความทั้งก้อนตามกฎ LINE (ป้ายปุ่ม ≤20, ข้อความห้ามว่าง, ลิงก์ถูกต้อง, carousel ≤12, กล่องห้ามว่าง)
function cleanNode(n: unknown): unknown {
  if (Array.isArray(n)) return n.map(cleanNode).filter((x) => x !== null);
  if (!n || typeof n !== "object") return n;
  const o: AnyObj = {};
  for (const [k, v] of Object.entries(n as AnyObj)) if (v !== undefined && v !== null) o[k] = cleanNode(v);
  if (o.type === "uri" && "uri" in o) {
    const uri = safeUri(o.uri);
    if (!uri) return null;
    o.uri = uri;
    o.label = clip(String(o.label ?? "").trim() || "เปิด", 20);
  } else if ((o.type === "postback" || o.type === "message") && "label" in o) {
    o.label = clip(String(o.label ?? "").trim() || "เลือก", 20);
  }
  if (o.type === "button" && (!o.action || typeof o.action !== "object")) return null; // ลิงก์เสีย -> ตัดปุ่มทิ้ง
  if (o.type === "text" && "text" in o) {
    const t = String(o.text ?? "").replace(/\s+$/g, "");
    o.text = t.trim() ? clip(t, 2000) : "-";
  }
  if (o.type === "box") {
    const c = (o.contents as unknown[] | undefined) ?? [];
    if (!c.length) return null; // กล่องว่าง LINE ไม่รับ
    o.contents = c;
  }
  if (o.type === "carousel") o.contents = ((o.contents as unknown[]) ?? []).filter(Boolean).slice(0, 12);
  if (o.type === "bubble") {
    for (const part of ["header", "hero", "body", "footer"]) if (o[part] === null) delete o[part];
  }
  return o;
}
export function sanitizeMessages(msgs: Msg[]): Msg[] {
  const out: Msg[] = [];
  for (const m of msgs.slice(0, 5)) {
    const c = cleanNode(m) as AnyObj | null;
    if (!c) continue;
    if (c.type === "text") { const t = String(c.text ?? "").trim(); if (!t) continue; c.text = clip(t, 5000); }
    if (c.type === "flex") {
      c.altText = clip(String(c.altText ?? "").replace(/\s+/g, " ").trim() || "ข้อความจาก BM33", 400);
      if (!c.contents) continue;
    }
    out.push(c as unknown as Msg);
  }
  return out;
}

// แบบสำรองที่ LINE รับแน่ ๆ: ข้อความล้วน (สรุปจากการ์ด) + การ์ดปุ่มลิงก์ธรรมดา ≤4 ปุ่ม
export function simplifyMessages(msgs: Msg[]): Msg[] {
  const texts: string[] = [];
  const links: { label: string; uri: string }[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== "object") return;
    const o = n as AnyObj;
    if (o.type === "text" && typeof o.text === "string" && o.text.trim() && o.text !== "-") texts.push(o.text.trim());
    if (o.type === "uri" && typeof o.uri === "string") { const u = safeUri(o.uri); if (u && !links.some((l) => l.uri === u)) links.push({ label: clip(String(o.label || "เปิด"), 20), uri: u }); }
    for (const v of Object.values(o)) if (typeof v === "object") walk(v);
  };
  for (const m of msgs) {
    if (m.type === "text") texts.push(m.text);
    else if (m.type === "flex") { walk(m.contents); }
  }
  const body = Array.from(new Set(texts)).join("\n").slice(0, 4800) || "ข้อความจาก BM33";
  const out: Msg[] = [{ type: "text", text: body }];
  if (links.length) out.push({
    type: "flex", altText: "ลิงก์ที่เกี่ยวข้อง", contents: { type: "bubble", body: { type: "box", layout: "vertical", spacing: "sm", contents:
      links.slice(0, 4).map((l, i) => ({ type: "button", style: i === 0 ? "primary" : "secondary", height: "sm", action: { type: "uri", label: l.label, uri: l.uri } })) } },
  } as Msg);
  return out;
}

// ถาม LINE ว่าข้อความนี้ส่งได้ไหม (ไม่เสียโควตา) — null = ผ่าน · ถ้าเช็กไม่ได้ (เน็ต/ไม่มี token) ถือว่าผ่าน
export async function validateMessages(msgs: Msg[]): Promise<string | null> {
  try { await lineClient.validatePush({ messages: msgs }); return null; }
  catch (err) {
    const st = (err as { status?: number }).status;
    return st === 400 ? lineErrorText(err) : null;
  }
}

// เตรียมข้อความให้ส่งได้แน่ ๆ: clean -> validate -> (ไม่ผ่าน) แบบง่าย -> validate -> (ไม่ผ่าน) ข้อความล้วน
export async function ensureSendable(msgs: Msg[]): Promise<{ messages: Msg[]; note: string }> {
  const clean = sanitizeMessages(msgs);
  const e1 = await validateMessages(clean);
  if (!e1) return { messages: clean, note: "" };
  const simple = sanitizeMessages(simplifyMessages(clean));
  const e2 = await validateMessages(simple);
  if (!e2) return { messages: simple, note: `การ์ดเดิม LINE ไม่รับ (${e1}) → ส่งแบบข้อความ+ปุ่มแทน` };
  return { messages: [simple[0]], note: `LINE ไม่รับการ์ด (${e1}) → ส่งข้อความล้วน` };
}

export interface BulkResult { sent: number; failed: { to: string; error: string }[]; notes: string[] }

// ส่งข้อความเฉพาะคนหลายคน — ข้อความที่หน้าตาเหมือนกันเช็กกับ LINE ครั้งเดียว · ส่งพร้อมกันทีละ 6 · ลองใหม่เมื่อ LINE ยุ่ง (429/5xx)
export async function pushMany(jobs: { to: string; messages: Msg[] }[]): Promise<BulkResult> {
  const res: BulkResult = { sent: 0, failed: [], notes: [] };
  const ready: { to: string; messages: Msg[] }[] = [];
  const cache = new Map<string, Msg[]>();
  for (let i = 0; i < jobs.length; i += 8) {
    await Promise.all(jobs.slice(i, i + 8).map(async (j) => {
      const key = JSON.stringify(j.messages);
      let m = cache.get(key);
      if (!m) {
        const r = await ensureSendable(j.messages);
        m = r.messages; cache.set(key, m);
        if (r.note && !res.notes.includes(r.note)) res.notes.push(r.note);
      }
      ready.push({ to: j.to, messages: m });
    }));
  }
  for (let i = 0; i < ready.length; i += 6) {
    await Promise.all(ready.slice(i, i + 6).map(async (j) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await lineClient.pushMessage({ to: j.to, messages: j.messages }); res.sent++; return; }
        catch (err) {
          const st = (err as { status?: number }).status ?? 0;
          if ((st === 429 || st >= 500) && attempt < 2) { await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); continue; }
          res.failed.push({ to: j.to, error: lineErrorText(err) });
          return;
        }
      }
    }));
  }
  return res;
}

// ส่งหาหลายคน (ข้อความเดียวกัน) — multicast ทีละ 500 · ถ้า LINE ไม่รับทั้งก้อน ถอยไปส่งทีละคนเพื่อข้ามเฉพาะคนที่มีปัญหา
export async function multicastTo(
  userIds: string[],
  messages: messagingApi.Message[]
): Promise<number> {
  const r = await multicastSafe(userIds, messages);
  if (!r.sent && r.failed.length) throw new Error(r.failed[0].error);
  return r.sent;
}
export async function multicastSafe(userIds: string[], messages: Msg[]): Promise<BulkResult> {
  const { messages: m, note } = await ensureSendable(messages);
  const res: BulkResult = { sent: 0, failed: [], notes: note ? [note] : [] };
  for (let i = 0; i < userIds.length; i += 500) {
    const batch = userIds.slice(i, i + 500);
    if (!batch.length) continue;
    try { await lineClient.multicast({ to: batch, messages: m }); res.sent += batch.length; }
    catch {
      const r = await pushMany(batch.map((to) => ({ to, messages: m })));
      res.sent += r.sent; res.failed.push(...r.failed);
    }
  }
  return res;
}

// ส่งรายคน (ใช้ตอน personalize {name}) — ทำความสะอาด + ถ้า LINE ไม่รับ ลองแบบง่ายอัตโนมัติ
export async function pushTo(
  userId: string,
  messages: messagingApi.Message[]
): Promise<void> {
  const clean = sanitizeMessages(messages);
  try {
    await lineClient.pushMessage({ to: userId, messages: clean });
  } catch (err) {
    if ((err as { status?: number }).status !== 400) throw new Error(lineErrorText(err));
    const { messages: m } = await ensureSendable(clean);
    try { await lineClient.pushMessage({ to: userId, messages: m }); }
    catch (e2) { throw new Error(lineErrorText(e2)); }
  }
}

// โควตาข้อความคงเหลือของเดือนนี้ (LINE push quota)
export async function messageQuota(): Promise<{ limit: number | null; used: number; remaining: number | null }> {
  try {
    const q = await lineClient.getMessageQuota();
    const c = await lineClient.getMessageQuotaConsumption();
    const used = c.totalUsage ?? 0;
    const limit = q.type === "limited" ? (q.value ?? null) : null;
    return { limit, used, remaining: limit === null ? null : Math.max(0, limit - used) };
  } catch {
    return { limit: null, used: 0, remaining: null };
  }
}
