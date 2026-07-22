// เรียก Gemini — คืน text + finishReason + usage
// verify กับ @google/genai v2.13.0:
//   - new GoogleGenAI({ apiKey }); ai.models.generateContent({ model, contents, config })
//   - structured output: config.responseMimeType="application/json" + responseSchema (Type enum)
//   - vision: parts มี inlineData { mimeType, data(base64) }
//
// โมเดลมาจาก env GEMINI_MODEL (ตอนนี้ใช้ flash-lite เพราะ free tier จำกัดจำนวน request)

import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { z } from "zod";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

let _ai: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return _ai;
}

export type GeminiResult = {
  text: string;
  finishReason?: string;
  thoughtsTokenCount?: number;
  candidatesTokenCount?: number;
};

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

// core: ตอบข้อความ (รองรับ vision ผ่าน extraParts)
export async function askGemini(
  systemInstruction: string,
  userContent: string,
  timeoutMs = 8000,
  extraParts: Part[] = []
): Promise<GeminiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await getAi().models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: userContent }, ...extraParts] }],
      config: {
        systemInstruction,
        temperature: 1.0, // อย่าลด — คุมโทน/ความเป็นธรรมชาติ
        maxOutputTokens: 1024, // thinking + output รวมกัน
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: controller.signal,
      },
    });
    const c = res.candidates?.[0];
    return {
      text: (res.text ?? "").trim(),
      finishReason: c?.finishReason,
      thoughtsTokenCount: res.usageMetadata?.thoughtsTokenCount,
      candidatesTokenCount: res.usageMetadata?.candidatesTokenCount,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── structured router (ใช้เฉพาะตอน keyword router ไม่ชัด) ────────────────────
const VALID_SOURCE_IDS = [
  "current","historyIndex","knowledgeArchive","announcementArchive",
  "linkArchive","members","finance","announcementQueue","rawMessages",
] as const;

const RouterSchema = z.object({
  intent: z.string(),
  sourceIds: z.array(z.enum(VALID_SOURCE_IDS)).max(4),
  searchTerms: z.array(z.string()).max(8).optional().default([]),
  reason: z.string().optional().default(""),
});
export type RouterOutput = z.infer<typeof RouterSchema>;

const ROUTER_SYSTEM = `คุณคือ "ตัวเลือกแหล่งข้อมูล" ของบอทรุ่น BM33 หน้าที่เดียวคือเลือกว่าคำถามควรค้นจากแท็บไหน
เลือกได้เฉพาะ source id ต่อไปนี้เท่านั้น (ห้ามคิดชื่อแท็บหรือช่วง A1 เอง):
- knowledgeArchive: ความรู้/เหตุการณ์ย้อนหลังแบบละเอียด
- announcementArchive: ประกาศเก่า วันที่ เดดไลน์
- linkArchive: ลิงก์ ฟอร์ม ไฟล์ เอกสาร
- historyIndex: ดัชนีประวัติ (โหลดคู่กับ archive เมื่อถามเรื่องเก่า)
- finance: การเงินของ "ตัวผู้ถามเอง" เท่านั้น
- members: ข้อมูลสมาชิกของ "ตัวผู้ถามเอง" เท่านั้น
- announcementQueue / rawMessages: เฉพาะแอดมิน
ตอบเป็น JSON ตาม schema ห้ามมีข้อความอื่น`;

export async function routeWithGemini(question: string): Promise<RouterOutput | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await getAi().models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: `<question>${question}</question>` }] }],
      config: {
        systemInstruction: ROUTER_SYSTEM,
        temperature: 0.2,
        maxOutputTokens: 256,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: { type: Type.STRING },
            sourceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
            searchTerms: { type: Type.ARRAY, items: { type: Type.STRING } },
            reason: { type: Type.STRING },
          },
          required: ["intent", "sourceIds"],
        },
        abortSignal: controller.signal,
      },
    });
    const parsed = RouterSchema.safeParse(JSON.parse(res.text ?? "{}"));
    return parsed.success ? parsed.data : null;
  } finally {
    clearTimeout(timer);
  }
}

// ── digest: กลั่นข้อความแชตเป็น "รายการความรู้" (ใช้ใน job 3 รอบ/วัน) ────────
const KnowledgeItem = z.object({
  หมวด: z.string().default(""),
  หัวข้อ: z.string().default(""),
  คำถามที่คาดว่าจะถาม: z.string().default(""),
  คำตอบ: z.string().default(""),
  คำสำคัญ: z.array(z.string()).default([]),
  ลิงก์: z.string().default(""),
  วันที่: z.string().default(""),
  ผู้ประกาศ: z.string().default(""),
  กำหนดเวลา: z.string().default(""),
});
export type KnowledgeItem = z.infer<typeof KnowledgeItem>;
const DigestSchema = z.object({ items: z.array(KnowledgeItem).default([]) });

const DIGEST_SYSTEM = `คุณคือผู้ช่วยสรุป "ความรู้ที่เป็นประโยชน์ระยะยาว" ของรุ่น BM33 จากข้อความแชตกลุ่ม
เก็บเฉพาะเรื่องที่มีคุณค่าเป็นข้อมูลอ้างอิง เช่น ประกาศ กำหนดการ เดดไลน์ แบบฟอร์ม/ลิงก์เอกสาร ตารางเรียน/สอบ ข้อมูลการเงินรุ่น สถานที่ ทรัพยากร
ข้าม: ทักทาย เม้าท์มอย อีโมจิล้วน สติกเกอร์ คุยเล่น ข้อความที่ไม่มีสาระอ้างอิง
สำหรับแต่ละเรื่องที่ควรเก็บ ให้สร้าง 1 รายการ: หมวด, หัวข้อสั้น, คำถามที่คนน่าจะถาม, คำตอบสั้นกระชับสำหรับ AI, คำสำคัญสำหรับค้น, ลิงก์ (ถ้ามี), วันที่ (YYYY-MM-DD ถ้ารู้), ผู้ประกาศ, กำหนดเวลา/เดดไลน์ (ถ้ามี)
ห้ามแต่งข้อมูลที่ไม่มีในข้อความ ถ้าไม่มีเรื่องน่าเก็บให้คืน items ว่าง ตอบเป็น JSON ตาม schema เท่านั้น`;

export async function distillKnowledge(batchText: string): Promise<KnowledgeItem[]> {
  const res = await getAi().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: `<ข้อความแชต>\n${batchText}\n</ข้อความแชต>` }] }],
    config: {
      systemInstruction: DIGEST_SYSTEM,
      temperature: 0.4,
      maxOutputTokens: 4096, // digest ไม่ใช่ path ที่ไวต่อ latency
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                หมวด: { type: Type.STRING },
                หัวข้อ: { type: Type.STRING },
                คำถามที่คาดว่าจะถาม: { type: Type.STRING },
                คำตอบ: { type: Type.STRING },
                คำสำคัญ: { type: Type.ARRAY, items: { type: Type.STRING } },
                ลิงก์: { type: Type.STRING },
                วันที่: { type: Type.STRING },
                ผู้ประกาศ: { type: Type.STRING },
                กำหนดเวลา: { type: Type.STRING },
              },
            },
          },
        },
      },
    },
  });
  const parsed = DigestSchema.safeParse(JSON.parse(res.text ?? "{}"));
  return parsed.success ? parsed.data.items : [];
}

// ── vision: อธิบายรูปเป็นข้อความไทยสั้น ๆ (ใช้ตอนเก็บความรู้จากรูปในกลุ่ม) ──
export async function captionImage(
  imageBase64: string,
  mimeType: string,
  hint = ""
): Promise<GeminiResult> {
  return askGemini(
    `อธิบายเนื้อหาในรูปเป็นภาษาไทยสั้น กระชับ เน้นข้อมูลที่เป็นประโยชน์ต่อรุ่น (ประกาศ กำหนดการ วันเวลา จำนวนเงิน ลิงก์ สถานที่ รายชื่อ). ถ้าเป็นรูปทั่วไป/มีม/สติกเกอร์ ให้ตอบสั้น ๆ ว่าเป็นรูปทั่วไป. ห้ามเดาข้อมูลที่ไม่เห็นในรูป`,
    `ช่วยสรุปข้อมูลสำคัญจากรูปนี้${hint ? " (บริบท: " + hint + ")" : ""}`,
    8000,
    [{ inlineData: { mimeType, data: imageBase64 } }]
  );
}

export { MODEL };
