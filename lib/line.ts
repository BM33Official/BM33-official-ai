// helper รวม client + สร้าง message ต่าง ๆ ของ LINE
// verify แล้วกับ @line/bot-sdk v11.2.0:
//   - new messagingApi.MessagingApiClient({ channelAccessToken })
//   - client.replyMessage({ replyToken, messages })
// การ์ด handoff (Flex) อยู่ใน lib/line-cards.ts

import { messagingApi } from "@line/bot-sdk";

export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

// ข้อความ fallback มาตรฐาน (ใช้เมื่อ Gemini ล้ม / MAX_TOKENS)
export const DEFAULT_REPLY =
  "ตอนนี้บอทตอบให้ไม่ได้ ลองพิมพ์ใหม่อีกทีนะ ถ้ายังไม่ได้ทักคนดูแลรุ่นได้เลย 🙏";

// ข้อความตอน Sheet ดึงไม่ได้และไม่มี cache
export const SHEET_UNAVAILABLE_REPLY =
  "ตอนนี้บอทดึงข้อมูลไม่ทัน ลองใหม่อีกทีนะ 🙏";

// ข้อความปกติ (plain text)
export function textMessage(text: string): messagingApi.TextMessage {
  return { type: "text", text };
}
