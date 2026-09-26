// LINE webhook: verify signature -> (ลงทะเบียน / คำสั่งแอดมิน / ประกาศ) -> AI อ่านข้อมูลทั้งหมด -> reply
// + บันทึกข้อความกลุ่มลง 07 (สำหรับ digest เรียนรู้เอง) + จับประกาศของกรรมการเข้าแอปอัตโนมัติ
// คืน 200 เสมอหลังจัดการ (กัน LINE retry ซ้ำ); 401 เฉพาะ signature ผิด

import { NextResponse } from "next/server";
import { validateSignature, webhook, messagingApi } from "@line/bot-sdk";
import { captionImage } from "@/lib/gemini";
import { logMessage } from "@/lib/message-log";
import { getMember } from "@/lib/bc/members";
import { handleFollow, handleOnboardingText, handleConfirm } from "@/lib/bc/onboarding";
import { handleVerifyClaim } from "@/lib/bc/verify";
import { log } from "@/lib/logger";
import { lineClient, getImageBase64, textMessage } from "@/lib/line";
import { isAdmin as isAdminUser } from "@/lib/sources";
import { answer, Asker } from "@/lib/ai/answer";
import { appendRows } from "@/lib/google-sheets";
import { TABS } from "@/lib/bc/types";
import { digits } from "@/lib/bc/sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!;
const LIFF_URL = "https://liff.line.me/2011755768-aSlCqo7l";

type Msg = messagingApi.Message;

function mask(id: string | undefined): string {
  return id ? `…${id.slice(-4)}` : "-";
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";

  if (!signature || !validateSignature(rawBody, CHANNEL_SECRET, signature)) {
    log.warn("invalid_signature");
    return new NextResponse("invalid signature", { status: 401 });
  }

  let events: webhook.Event[] = [];
  try {
    events = (JSON.parse(rawBody) as webhook.CallbackRequest).events ?? [];
  } catch {
    return NextResponse.json({ ok: true });
  }

  // จัดการทุก event พร้อมกัน (คนละคน ไม่ต้องรอกัน) — แต่ต้องเสร็จก่อนตอบ 200 (Vercel หยุด function หลังตอบ)
  await Promise.all(events.map((event) =>
    handleEvent(event).catch((err) => log.error("handle_event_error", { message: String(err) }))
  ));
  return NextResponse.json({ ok: true });
}

// กลุ่มที่อนุญาตให้บอทเรียนรู้ (ว่าง = ทุกกลุ่ม)
function learnGroups(): string[] {
  return (process.env.LEARN_GROUP_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
function shouldLearn(groupId: string | undefined): boolean {
  if (!groupId) return false;
  const gs = learnGroups();
  return gs.length === 0 || gs.includes(groupId);
}

async function handleEvent(event: webhook.Event): Promise<void> {
  if (event.type === "join") {
    const s = event.source;
    const gid = s?.type === "group" ? s.groupId : s?.type === "room" ? s.roomId : undefined;
    log.info("bot_joined_group", { groupId: gid ?? "-" });
    return;
  }

  // ── follow: เริ่มลงทะเบียนแบบสนทนา + ชวนเปิดแอป ─────────────────────────
  if (event.type === "follow") {
    const uid = event.source?.userId;
    if (uid && event.replyToken) {
      try {
        const msgs = await handleFollow(uid, await displayName(uid));
        await safeReply(event.replyToken, uid, [...msgs, appInviteFlex()].slice(0, 5));
      } catch (err) {
        log.error("follow_error", { message: String(err) });
      }
    }
    return;
  }

  if (event.type === "postback") {
    const uid = event.source?.userId;
    const data = event.postback?.data ?? "";
    if (uid && event.replyToken) await handlePostback(event.replyToken, uid, data);
    return;
  }

  if (event.type !== "message") return;
  const message = event.message;
  const source = event.source;
  const userId = source?.userId;
  const groupId =
    source?.type === "group" ? source.groupId : source?.type === "room" ? source.roomId : undefined;
  const isGroup = !!groupId;
  const replyToken = event.replyToken;

  // ── รูปภาพในกลุ่ม: เก็บคำบรรยาย (+ ถ้ากรรมการโพสต์ประกาศเป็นรูป -> เข้าแอป) ─────
  if (message.type === "image") {
    if (isGroup && shouldLearn(groupId) && process.env.LEARN_IMAGES !== "0") {
      await learnImage(message.id, groupId!, userId);
    }
    return;
  }

  if (message.type !== "text") return;
  const rawText = message.text ?? "";

  // ── DM ───────────────────────────────────────────────────────────────────
  if (!isGroup && replyToken && userId) {
    // คำสั่งผู้อนุมัติ: approve / reject
    if (await maybeHandleApproval(replyToken, userId, rawText)) return;
    // กรรมการส่งประกาศเข้าแอป: "ประกาศ <ข้อความ>"
    if (await maybeHandleAnnouncementDM(replyToken, userId, rawText)) return;
    const handled = await maybeHandleOnboarding(replyToken, userId, rawText);
    if (handled) return;
    if (/^(แอป|แอพ|app|เว็บ|เว็บรุ่น|เปิดแอป|portal)\s*$/i.test(rawText.trim())) {
      await safeReply(replyToken, userId, [appInviteFlex()]);
      return;
    }
    const tasks = await maybeHandlePersonalTasks(replyToken, userId, rawText);
    if (tasks) return;
  }

  if (isGroup) log.info("group_message", { groupId: groupId ?? "-" });

  // ── บันทึกข้อความกลุ่มลง buffer (await — กันหายตอน Vercel ปิด function) ──────
  if (isGroup && shouldLearn(groupId)) {
    const name = await groupDisplayName(groupId!, userId);
    await logMessage({
      messageId: message.id,
      tsISO: new Date(event.timestamp || Date.now()).toISOString(),
      groupId: groupId!,
      userId: userId ?? "",
      displayName: name,
      type: "text",
      content: rawText,
    }).catch((err) => log.warn("log_message_failed", { message: String(err) }));
    // ข้อความจากกรรมการ -> ให้ AI ตัดสินว่าเป็นประกาศไหม แล้วขึ้นแอปอัตโนมัติ
    await maybeCaptureAnnouncement(userId, name, rawText, message.id).catch((err) =>
      log.warn("capture_announcement_failed", { message: String(err) })
    );
  }

  // ── ในกลุ่ม: ตอบเฉพาะเมื่อถูก mention หรือขึ้นต้น /ถาม ─────────────────────
  const mentionedSelf =
    (message as { mention?: { mentionees?: Array<{ isSelf?: boolean }> } }).mention?.mentionees?.some(
      (m) => m.isSelf
    ) ?? false;
  const askCmd = /^\s*\/?ถาม\s+/.test(rawText);
  if (isGroup && !mentionedSelf && !askCmd) return;

  if (!replyToken) return;
  const question = rawText.replace(/^\s*\/?ถาม\s+/, "").replace(/@\S+/g, "").trim();
  if (!question) return;

  await answerQuestion(replyToken, question, userId, isGroup ? groupId : undefined);
}

// ── ข้อมูลผู้ใช้ ────────────────────────────────────────────────────────────
async function displayName(userId: string): Promise<string> {
  try {
    const p = await lineClient.getProfile(userId);
    return p.displayName ?? "";
  } catch {
    return "";
  }
}

const _profileCache = new Map<string, string>();
async function groupDisplayName(groupId: string, userId: string | undefined): Promise<string> {
  if (!userId) return "";
  const key = `${groupId}/${userId}`;
  const cached = _profileCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const p = await lineClient.getGroupMemberProfile(groupId, userId);
    const name = p.displayName ?? "";
    _profileCache.set(key, name);
    return name;
  } catch {
    return "";
  }
}

async function studentOf(userId: string | undefined): Promise<{ sid: string; nickname: string; verified: boolean }> {
  if (!userId) return { sid: "", nickname: "", verified: false };
  try {
    const m = await getMember(userId);
    if (!m || m.status !== "verified" || !m.matched_student_id) return { sid: "", nickname: "", verified: false };
    const sid = digits(m.matched_student_id);
    const { readRoster } = await import("@/lib/bc/roster");
    const r = (await readRoster()).find((x) => x.student_id === sid);
    return { sid, nickname: r?.nickname || m.claimed_name || "", verified: true };
  } catch {
    return { sid: "", nickname: "", verified: false };
  }
}

async function committeeRoleOf(userId: string | undefined): Promise<{ nickname: string; role: string } | null> {
  if (!userId) return null;
  const s = await studentOf(userId);
  if (s.sid) {
    const { committeeByStudent } = await import("@/lib/bc/committee");
    const c = (await committeeByStudent()).get(s.sid);
    if (c) return { nickname: c.nickname || s.nickname, role: c.role };
  }
  if (isAdminUser(userId)) return { nickname: s.nickname || "แอดมิน", role: "ผู้ดูแลระบบ" };
  return null;
}

// ── postback ────────────────────────────────────────────────────────────────
async function handlePostback(replyToken: string, userId: string, data: string): Promise<void> {
  try {
    if (data === "onboard_confirm:yes" || data === "onboard_confirm:no") {
      const member = await getMember(userId, true).catch(() => null);
      if (!member) return;
      const msgs = await handleConfirm(member, data.endsWith("yes"));
      if (data.endsWith("yes")) msgs.push(appInviteFlex());
      await safeReply(replyToken, userId, msgs.slice(0, 5));
    } else if (data.startsWith("verify:")) {
      await safeReply(replyToken, userId, await handleVerifyClaim(userId, data.slice(7)));
    } else if (data === "menu:ask") {
      await safeReply(replyToken, userId, [askMenuMessage()]);
    } else if (data.startsWith("outbox:")) {
      const [, act, id] = data.split(":");
      if (!(await isApprover(userId))) return;
      await safeReply(replyToken, userId, [textMessage(await runApproval(act === "approve" ? "approve" : "reject", id, userId))]);
    }
  } catch (err) {
    log.error("postback_error", { message: String(err) });
  }
}

// ── ผู้อนุมัติ: approve / reject ───────────────────────────────────────────────
async function isApprover(userId: string): Promise<boolean> {
  const { approverIds } = await import("@/lib/bc/config");
  return (await approverIds()).includes(userId);
}

async function runApproval(act: "approve" | "reject", idOrCode: string, userId: string): Promise<string> {
  const { approveAndSend, rejectOutbox } = await import("@/lib/bc/outbox");
  if (act === "reject") {
    return (await rejectOutbox(idOrCode, userId)) ? `ยกเลิกรายการ ${idOrCode} แล้ว ❌ (ไม่ส่ง)` : "ไม่พบรายการที่รออนุมัตินี้";
  }
  const r = await approveAndSend(idOrCode, userId);
  if (r.ok) return `ส่งแล้ว ✅ "${r.item?.title ?? ""}" ถึง ${r.count} คน`;
  return `ยังส่งไม่ได้: ${r.error ?? "ไม่ทราบสาเหตุ"}`;
}

async function maybeHandleApproval(replyToken: string, userId: string, rawText: string): Promise<boolean> {
  const m = rawText.trim().match(/^(approve|อนุมัติ|ok ส่ง|ส่งเลย|reject|ไม่ส่ง|ยกเลิกส่ง)\s*#?\s*(\w+)?\s*$/i);
  if (!m) return false;
  if (!(await isApprover(userId))) return false;
  const act = /^(reject|ไม่ส่ง|ยกเลิกส่ง)/i.test(m[1]) ? "reject" : "approve";
  const arg = (m[2] ?? "").trim();
  const { pendingOutbox } = await import("@/lib/bc/outbox");
  const pending = await pendingOutbox(true);
  let targets: string[] = [];
  if (/^(all|ทั้งหมด)$/i.test(arg)) targets = pending.map((p) => p.id);
  else if (arg) targets = [arg];
  else if (pending.length === 1) targets = [pending[0].id];
  if (!targets.length) {
    const list = pending.length
      ? pending.slice(0, 10).map((p) => `#${p.code} ${p.title}`).join("\n")
      : "ตอนนี้ไม่มีรายการรออนุมัติ 🎉";
    await safeReply(replyToken, userId, [{
      type: "text",
      text: pending.length ? `มีรายการรออนุมัติ ${pending.length} รายการ พิมพ์ "approve <เลข>" หรือ "approve all"\n\n${list}` : list,
      quickReply: pending.length ? {
        items: pending.slice(0, 12).map((p) => ({ type: "action" as const, action: { type: "message" as const, label: `approve ${p.code}`.slice(0, 20), text: `approve ${p.code}` } })),
      } : undefined,
    }]);
    return true;
  }
  const results: string[] = [];
  for (const t of targets) results.push(await runApproval(act, t, userId));
  await safeReply(replyToken, userId, [textMessage(results.join("\n"))]);
  return true;
}

// ── กรรมการส่งประกาศทาง DM: "ประกาศ <ข้อความ>" ────────────────────────────────
async function maybeHandleAnnouncementDM(replyToken: string, userId: string, rawText: string): Promise<boolean> {
  const m = rawText.match(/^\s*(?:#|\/)?ประกาศ[\s:：]+([\s\S]{8,})$/);
  if (!m) return false;
  const who = await committeeRoleOf(userId);
  if (!who) return false; // คนทั่วไปพิมพ์ "ประกาศ..." -> ให้ AI ตอบตามปกติ
  const { announcementFromText } = await import("@/lib/bc/announcements");
  const r = await announcementFromText({ text: m[1].trim(), author: who.nickname, authorRole: who.role, source: "forward", force: true });
  if (!r) {
    await safeReply(replyToken, userId, [textMessage("บันทึกประกาศไม่สำเร็จ ลองใหม่อีกครั้งนะ 🙏")]);
    return true;
  }
  const { thDateTime } = await import("@/lib/time");
  const p = r.parsed;
  await safeReply(replyToken, userId, [textMessage(
    `ขึ้นแอปแล้ว ✅\n\n📌 ${p.title}\n${p.summary}${p.deadline ? `\n⏰ เดดไลน์ ${thDateTime(p.deadline)}` : ""}${p.links.length ? `\n🔗 ${p.links.length} ลิงก์ (เป็นปุ่มในแอป)` : ""}\n\nแก้ไข/ซ่อนได้ที่ Control Center > ประกาศ`
  )]);
  return true;
}

// ── จับประกาศจากข้อความกลุ่มของกรรมการ ────────────────────────────────────────
async function maybeCaptureAnnouncement(userId: string | undefined, name: string, text: string, messageId: string): Promise<void> {
  const t = text.trim();
  // ข้อความสั้น ๆ/คุยเล่นไม่ต้องเรียก AI
  const looksLike = t.length >= 60 || /@all|ประกาศ|รบกวน|ฝาก|เดดไลน์|deadline|ภายใน|ก่อนวัน|https?:\/\//i.test(t);
  if (!looksLike || t.length < 20) return;
  const who = await committeeRoleOf(userId);
  if (!who) return;
  const { announcementFromText } = await import("@/lib/bc/announcements");
  const r = await announcementFromText({ text: t, author: who.nickname || name, authorRole: who.role, source: "group", sourceRef: messageId });
  if (r) log.info("announcement_captured", { id: r.id, by: mask(userId) });
}

// ── ลงทะเบียน ────────────────────────────────────────────────────────────────
async function maybeHandleOnboarding(replyToken: string, userId: string, rawText: string): Promise<boolean> {
  const t = rawText.trim();
  const registerCmd = /^(ลงทะเบียน|สมัคร|register|เริ่มลงทะเบียน)/i.test(t);

  let member: Awaited<ReturnType<typeof getMember>>;
  try {
    member = await getMember(userId, true);
  } catch {
    return false;
  }

  if (!member || member.onboarding_state === "") {
    await safeReply(replyToken, userId, await handleFollow(userId, await displayName(userId)));
    return true;
  }
  if (member.onboarding_state === "done") {
    if (registerCmd) {
      await safeReply(replyToken, userId, await handleFollow(userId, await displayName(userId)));
      return true;
    }
    return false;
  }

  if (member.onboarding_state === "awaiting_confirm") {
    if (/^(ใช่|yes|y|ยืนยัน|ถูก|ใช่ค่ะ|ใช่ครับ)/i.test(t)) {
      const msgs = await handleConfirm(member, true);
      await safeReply(replyToken, userId, [...msgs, appInviteFlex()].slice(0, 5));
      return true;
    }
    if (/^(ไม่|no|n|ผิด)/i.test(t)) { await safeReply(replyToken, userId, await handleConfirm(member, false)); return true; }
    await safeReply(replyToken, userId, await handleOnboardingText(member, rawText));
    return true;
  }

  await safeReply(replyToken, userId, await handleOnboardingText(member, rawText));
  return true;
}

async function maybeHandlePersonalTasks(replyToken: string, userId: string, rawText: string): Promise<boolean> {
  const t = rawText.trim();
  if (!/^(งานของฉัน|งานของเรา|งานค้าง|ค้างอะไร|ต้องทำอะไร(บ้าง)?|เช็คงาน|เช็กงาน|มีอะไรต้องทำ|to-?do)\s*[?？]?$/i.test(t)) return false;
  let member;
  try { member = await getMember(userId); } catch { return false; }
  if (!member || member.status !== "verified") return false;
  const { personalUndone } = await import("@/lib/bc/summary");
  await safeReply(replyToken, userId, [textMessage(await personalUndone(member)), appInviteFlex("ดูทั้งหมดในแอป BM33")]);
  return true;
}

// ── ตอบคำถาม ────────────────────────────────────────────────────────────────
async function answerQuestion(replyToken: string, question: string, userId: string | undefined, groupId?: string): Promise<void> {
  // แสดง "กำลังพิมพ์..." ระหว่าง AI อ่านข้อมูล (เฉพาะแชตส่วนตัว)
  if (!groupId && userId) {
    lineClient.showLoadingAnimation({ chatId: userId, loadingSeconds: 30 }).catch(() => {});
  }
  const s = await studentOf(userId);
  const asker: Asker = {
    lineUserId: userId,
    studentId: s.sid || undefined,
    nickname: s.nickname,
    verified: s.verified,
    admin: isAdminUser(userId),
    channel: groupId ? "group" : "dm",
  };
  const r = await answer(question, asker);
  await safeReply(replyToken, groupId ?? userId, r.messages);

  log.info("answer", {
    userId: mask(userId), kind: r.out.kind, topic: r.out.topic, model: r.model ?? "-", ms: r.ms,
    promptTokens: r.tokens ?? 0, cachedTokens: r.cached ?? 0, error: r.error ?? "",
  });
  // บันทึกถาม-ตอบ (แอดมินดูในหน้า AI) — ไม่ให้ล้มถ้าเขียนไม่ได้
  await appendRows(`'${TABS.chatlog}'!A1`, [[
    new Date().toISOString(), groupId ? "group" : "dm", s.sid, s.nickname, question.slice(0, 1000),
    r.out.kind, (r.out.reply || "").slice(0, 1500), r.model ?? "", String(r.ms), String(r.tokens ?? ""),
  ]]).catch(() => {});
}

// รูป: ดึง -> caption ด้วย Gemini vision -> log เป็น type image (+ ประกาศถ้าเป็นกรรมการ)
async function learnImage(messageId: string, groupId: string, userId: string | undefined): Promise<void> {
  try {
    const { base64, mimeType } = await getImageBase64(messageId);
    const cap = await captionImage(base64, mimeType);
    if (cap.finishReason === "MAX_TOKENS" || !cap.text) return;
    const name = await groupDisplayName(groupId, userId);
    await logMessage({
      messageId,
      tsISO: new Date().toISOString(),
      groupId,
      userId: userId ?? "",
      displayName: name,
      type: "image",
      content: cap.text,
      note: "caption by gemini vision",
    });
    if (!/รูปทั่วไป/.test(cap.text)) {
      await maybeCaptureAnnouncement(userId, name, `(โปสเตอร์/รูปประกาศ) ${cap.text}`, messageId).catch(() => {});
    }
    log.info("image_learned", { userId: mask(userId), chars: cap.text.length });
  } catch (err) {
    log.warn("learn_image_failed", { message: String(err) });
  }
}

// ── ปุ่มเมนู "ถามบอท": บอกวิธีถาม + คำถามยอดฮิตเป็น quick reply ──────────────
function askMenuMessage(): Msg {
  const qs = ["เงินรุ่นเดือนนี้เท่าไหร่", "พรุ่งนี้เรียนอะไร ตึกไหน", "มีงานอะไรค้างบ้าง", "สอบครั้งหน้าวันไหน", "ขอคุยกับกรรมการรุ่น"];
  return {
    type: "text",
    text: "พิมพ์ถามได้ทุกเรื่องของรุ่นเลย 💬\n\nบอทอ่านข้อมูลของรุ่นทั้งหมด (ประกาศ ตารางเรียน เงินรุ่น ฟอร์ม ลิงก์ต่าง ๆ) แล้วตอบให้ ถ้าเรื่องไหนไม่มีข้อมูล จะส่งต่อให้ประธานรุ่นทันที 🙏\n\nหรือแตะคำถามยอดฮิตด้านล่าง 👇",
    quickReply: { items: qs.map((q) => ({ type: "action" as const, action: { type: "message" as const, label: q.slice(0, 20), text: q } })) },
  };
}

// ── การ์ดชวนเปิดแอป ───────────────────────────────────────────────────────────
function appInviteFlex(label = "เปิดแอป BM33"): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: "เปิดแอป BM33 — ประกาศ ตารางเรียน เงินรุ่น เซียมซี",
    contents: {
      type: "bubble", size: "kilo",
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px", backgroundColor: "#0B1B4D",
        contents: [
          { type: "text", text: "BM33 App", color: "#93C5FD", size: "xs", weight: "bold" },
          { type: "text", text: "ทุกอย่างของรุ่นในที่เดียว", color: "#FFFFFF", size: "md", weight: "bold", wrap: true },
          { type: "text", text: "ประกาศ · ตารางเรียน · เงินรุ่น · งานค้าง · เซียมซี 🍀", color: "#BFDBFE", size: "xs", wrap: true, margin: "sm" },
          { type: "button", style: "primary", height: "sm", color: "#2563EB", margin: "md", action: { type: "uri", label, uri: LIFF_URL } },
        ],
      },
    },
  };
}

// reply ก่อน (ฟรี) — ถ้า reply token หมดอายุ (AI ใช้เวลานาน) ค่อย push แทน
async function safeReply(replyToken: string, to: string | undefined, messages: Msg[]): Promise<void> {
  try {
    await lineClient.replyMessage({ replyToken, messages: messages.slice(0, 5) });
  } catch (err) {
    log.warn("reply_failed", { message: String(err).slice(0, 200) });
    if (!to) return;
    try {
      await lineClient.pushMessage({ to, messages: messages.slice(0, 5) });
      log.info("push_fallback_ok", { to: mask(to) });
    } catch (e2) {
      log.error("push_fallback_failed", { message: String(e2).slice(0, 200) });
    }
  }
}
