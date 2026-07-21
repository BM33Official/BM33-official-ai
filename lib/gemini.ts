// เรียก Gemini (gemini-3.5-flash) — คืน text + finishReason + usage
// verify แล้วกับ @google/genai v2.13.0:
//   - new GoogleGenAI({ apiKey })
//   - ai.models.generateContent({ model, contents, config })
//   - config รองรับ: systemInstruction, temperature, maxOutputTokens,
//     thinkingConfig.thinkingLevel (enum ThinkingLevel), abortSignal
//   - response: res.text (getter), res.candidates[0].finishReason,
//     res.usageMetadata.{thoughtsTokenCount,candidatesTokenCount}

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// lazy init — สร้าง client ตอนใช้จริง ไม่ใช่ตอน import
// (กัน warning ตอน build ที่ยังไม่มี env และไม่สร้าง client โดยไม่จำเป็น)
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

export async function askGemini(
  systemInstruction: string,
  userContent: string,
  timeoutMs = 8000
): Promise<GeminiResult> {
  // timeout ~8 วิ กัน webhook ค้างเกิน 10 วิ ของ LINE
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await getAi().models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      config: {
        systemInstruction,
        temperature: 1.0, // อย่าลด — คุมโทน/ความเป็นธรรมชาติ
        maxOutputTokens: 1024, // thinking + output รวมกัน
        // กัน MAX_TOKENS: จำกัด thinking ให้เหลือ budget ไว้ตอบ
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
