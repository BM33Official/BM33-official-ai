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
