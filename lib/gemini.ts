// เรียก Gemini — คืน text + finishReason + usage
// verify กับ @google/genai:
//   - new GoogleGenAI({ apiKey }); ai.models.generateContent({ model, contents, config })
//   - structured output: config.responseMimeType="application/json" + responseSchema (Type enum)
//   - vision/PDF: parts มี inlineData { mimeType, data(base64) } หรือ fileData { fileUri, mimeType }
//
// โมเดล: เลือกอัตโนมัติ (activeModel) — BC_config.gemini_model > env GEMINI_MODEL(ถ้าไม่ใช่ lite) >
//        flash รุ่นใหม่สุดจาก models.list ; ถ้าเรียกแล้ว 404/400 จะลองตัวถัดไปเอง

import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { z } from "zod";
import { cached } from "@/lib/cache";
import { log } from "@/lib/logger";
import { recordUsage } from "@/lib/ai/usage";

let _ai: GoogleGenAI | null = null;
export function getAi(): GoogleGenAI {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return _ai;
}

// ── model resolution ─────────────────────────────────────────────────────────
interface ModelInfo { name: string; version: number; lite: boolean; preview: boolean }

function parseModel(name: string): ModelInfo | null {
  const n = name.replace(/^models\//, "");
  if (/tts|image|audio|live|embedding/i.test(n)) return null;
  const m = n.match(/^gemini-(\d+(?:\.\d+)?)-flash(-lite)?(?:-(latest|\d{3}|preview(?:-[\w.-]+)?|exp(?:-[\w.-]+)?))?$/);
  if (!m) return null;
  return { name: n, version: Number(m[1]), lite: !!m[2], preview: /preview|exp/.test(m[3] ?? "") };
}

export async function listFlashModels(): Promise<string[]> {
  return cached("gemini:models:v3", ["gemini-models"], 6 * 3600, async () => {
    const out: ModelInfo[] = [];
    const pager = await getAi().models.list({ config: { pageSize: 200 } });
    for await (const m of pager) {
      const actions = (m as { supportedActions?: string[] }).supportedActions ?? [];
      if (actions.length && !actions.includes("generateContent")) continue;
      if (/tts|image|audio|live|embedding/i.test(m.name ?? "")) continue;
      const p = parseModel(m.name ?? "");
      if (p) out.push(p);
    }
    // ดีสุดก่อน: non-lite > เวอร์ชันใหม่ > stable ก่อน preview
    out.sort((a, b) => Number(a.lite) - Number(b.lite) || b.version - a.version || Number(a.preview) - Number(b.preview));
    return out.map((m) => m.name);
  });
}

async function configuredModel(): Promise<string> {
  try {
    const { getConfigValue } = await import("@/lib/bc/config");
    return await getConfigValue("gemini_model");
  } catch {
    return "";
  }
}

// ลำดับโมเดลที่จะลอง (ตัวแรก = ใช้งานจริง)
export async function modelChain(): Promise<string[]> {
  const chain: string[] = [];
  const cfg = await configuredModel();
  if (cfg) chain.push(cfg);
  let listed: string[] = [];
  try { listed = await listFlashModels(); } catch (err) { log.warn("gemini_list_failed", { message: String(err) }); }
  const env = process.env.GEMINI_MODEL ?? "";
  // env เดิมตั้งเป็น flash-lite เพราะ free tier — ตอนนี้จ่ายเงินแล้ว ใช้ flash เต็มก่อน
  if (env && !/lite/.test(env)) chain.push(env);
  chain.push(...listed.filter((m) => !/lite/.test(m)).slice(0, 3));
  if (env) chain.push(env);
  chain.push("gemini-3.5-flash", "gemini-2.5-flash");
  return Array.from(new Set(chain.filter(Boolean)));
}

export async function activeModel(): Promise<string> {
  return (await modelChain())[0];
}

function isModelError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  return /not found|404|is not supported|unsupported|invalid model|INVALID_ARGUMENT.*model|no longer available|deprecated/i.test(msg);
}
function isTransient(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  return /429|RESOURCE_EXHAUSTED|500|502|503|504|UNAVAILABLE|overloaded|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg);
}

export type Thinking = "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
function thinkingFor(model: string, level: Thinking) {
  const p = parseModel(model);
  if (p && p.version >= 3) return { thinkingLevel: ThinkingLevel[level] };
  // gemini 2.x ใช้ budget แทน level
  return { thinkingBudget: level === "MINIMAL" ? 0 : level === "LOW" ? 512 : level === "MEDIUM" ? 2048 : 6144 };
}

export type GeminiResult = {
  text: string;
  finishReason?: string;
  thoughtsTokenCount?: number;
  candidatesTokenCount?: number;
  promptTokenCount?: number;
  cachedTokenCount?: number;
  model?: string;
};

export type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { fileUri: string; mimeType: string } };

interface GenOpts {
  timeoutMs?: number;
  temperature?: number;
  maxOutputTokens?: number;
  thinking?: Thinking;
  // สำหรับมิเตอร์ค่าใช้จ่าย (BC_usage): ฟีเจอร์ที่เรียก + ผู้ใช้ (student id/line id)
  feature?: string;
  who?: string;
  json?: { schema: Record<string, unknown> };
  extraParts?: Part[];
  // ส่วน "คงที่" ที่อยากให้ implicit cache จับ (วางไว้ก่อนคำถามเสมอ)
  prefixParts?: Part[];
}

// core: generate พร้อมลองโมเดลถัดไปเมื่อโมเดลใช้ไม่ได้ + retry เมื่อ overload
export async function generate(systemInstruction: string, userContent: string, opts: GenOpts = {}): Promise<GeminiResult> {
  const chain = await modelChain();
  const deadline = Date.now() + (opts.timeoutMs ?? 20_000);
  let lastErr: unknown;
  for (const model of chain) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 1500) throw lastErr ?? new Error("gemini_timeout");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        const res = await getAi().models.generateContent({
          model,
          contents: [{ role: "user", parts: [...(opts.prefixParts ?? []), { text: userContent }, ...(opts.extraParts ?? [])] }],
          config: {
            systemInstruction,
            temperature: opts.temperature ?? 1.0,
            maxOutputTokens: opts.maxOutputTokens ?? 4096,
            thinkingConfig: thinkingFor(model, opts.thinking ?? "LOW"),
            abortSignal: controller.signal,
            ...(opts.json ? { responseMimeType: "application/json", responseSchema: opts.json.schema } : {}),
          },
        });
        const c = res.candidates?.[0];
        const um = res.usageMetadata;
        await recordUsage({
          feature: opts.feature ?? "other", model, who: opts.who,
          prompt: um?.promptTokenCount ?? 0, cached: um?.cachedContentTokenCount ?? 0,
          output: (um?.candidatesTokenCount ?? 0) + (um?.thoughtsTokenCount ?? 0),
        });
        return {
          text: (res.text ?? "").trim(),
          finishReason: c?.finishReason,
          thoughtsTokenCount: res.usageMetadata?.thoughtsTokenCount,
          candidatesTokenCount: res.usageMetadata?.candidatesTokenCount,
          promptTokenCount: res.usageMetadata?.promptTokenCount,
          cachedTokenCount: res.usageMetadata?.cachedContentTokenCount,
          model,
        };
      } catch (err) {
        lastErr = err;
        if (isModelError(err)) { log.warn("gemini_model_unusable", { model, message: String(err).slice(0, 200) }); break; }
        if (isTransient(err) && attempt < 2) { await new Promise((r) => setTimeout(r, 700 * (attempt + 1))); continue; }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw lastErr ?? new Error("no_model_available");
}

// JSON แบบมี schema + parse ด้วย zod; พังแล้วลองใหม่ 1 ครั้ง (thinking ต่ำลง)
export async function generateJSON<T>(
  systemInstruction: string,
  userContent: string,
  schema: Record<string, unknown>,
  zodSchema: z.ZodType<T>,
  opts: Omit<GenOpts, "json"> = {}
): Promise<{ data: T | null; raw: GeminiResult | null }> {
  let raw: GeminiResult | null = null;
  for (let i = 0; i < 2; i++) {
    try {
      raw = await generate(systemInstruction, userContent, {
        ...opts,
        thinking: i === 0 ? opts.thinking : "LOW",
        maxOutputTokens: i === 0 ? opts.maxOutputTokens : Math.max(opts.maxOutputTokens ?? 4096, 8192),
        json: { schema },
      });
      const parsed = zodSchema.safeParse(JSON.parse(stripFence(raw.text)));
      if (parsed.success) return { data: parsed.data, raw };
      log.warn("gemini_json_invalid", { issues: parsed.error.issues.length });
    } catch (err) {
      log.warn("gemini_json_failed", { attempt: i, message: String(err).slice(0, 200) });
      if (i === 1) throw err;
    }
  }
  return { data: null, raw };
}

function stripFence(s: string): string {
  const t = (s ?? "").trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : t;
}

// ── legacy wrapper (สรุปสัปดาห์/คำบรรยายรูป) ─────────────────────────────────
export async function askGemini(
  systemInstruction: string,
  userContent: string,
  timeoutMs = 15000,
  extraParts: Part[] = []
): Promise<GeminiResult> {
  return generate(systemInstruction, userContent, { timeoutMs, extraParts, maxOutputTokens: 4096, feature: "summary" });
}

// ── structured router (legacy — ไม่ใช้แล้ว เพราะ AI อ่านข้อมูลทั้งหมดทุกคำถาม) ─
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

export async function routeWithGemini(question: string): Promise<RouterOutput | null> {
  const { data } = await generateJSON(
    `เลือก source id ที่ควรค้นสำหรับคำถามนี้ (knowledgeArchive, announcementArchive, linkArchive, historyIndex, finance, members) ตอบ JSON`,
    `<question>${question}</question>`,
    {
      type: Type.OBJECT,
      properties: {
        intent: { type: Type.STRING },
        sourceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        searchTerms: { type: Type.ARRAY, items: { type: Type.STRING } },
        reason: { type: Type.STRING },
      },
      required: ["intent", "sourceIds"],
    },
    RouterSchema as unknown as z.ZodType<RouterOutput>,
    { timeoutMs: 6000, temperature: 0.2, maxOutputTokens: 1024, feature: "router" }
  ).catch(() => ({ data: null }));
  return data;
}

// ── digest: กลั่นข้อความแชตเป็น "รายการความรู้" ──────────────────────────────
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
สำหรับแต่ละเรื่องที่ควรเก็บ ให้สร้าง 1 รายการ: หมวด, หัวข้อสั้น, คำถามที่คนน่าจะถาม, คำตอบสั้นกระชับสำหรับ AI (คงตัวเลข วัน เวลา สถานที่ ลิงก์ให้ครบ), คำสำคัญสำหรับค้น, ลิงก์ (ถ้ามี), วันที่ (YYYY-MM-DD ถ้ารู้), ผู้ประกาศ, กำหนดเวลา/เดดไลน์ (ถ้ามี)
ห้ามแต่งข้อมูลที่ไม่มีในข้อความ ถ้าไม่มีเรื่องน่าเก็บให้คืน items ว่าง ตอบเป็น JSON ตาม schema เท่านั้น`;

export async function distillKnowledge(batchText: string): Promise<KnowledgeItem[]> {
  const { data } = await generateJSON(
    DIGEST_SYSTEM,
    `<ข้อความแชต>\n${batchText}\n</ข้อความแชต>`,
    {
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
    DigestSchema as unknown as z.ZodType<{ items: KnowledgeItem[] }>,
    { timeoutMs: 45_000, temperature: 0.4, maxOutputTokens: 8192, feature: "digest", thinking: "LOW" }
  );
  return data?.items ?? [];
}

// ── vision: อธิบายรูปเป็นข้อความไทยสั้น ๆ (ใช้ตอนเก็บความรู้จากรูปในกลุ่ม) ──
export async function captionImage(
  imageBase64: string,
  mimeType: string,
  hint = ""
): Promise<GeminiResult> {
  return generate(
    `อธิบายเนื้อหาในรูปเป็นภาษาไทยสั้น กระชับ เน้นข้อมูลที่เป็นประโยชน์ต่อรุ่น (ประกาศ กำหนดการ วันเวลา จำนวนเงิน ลิงก์ สถานที่ รายชื่อ). ถ้าเป็นรูปทั่วไป/มีม/สติกเกอร์ ให้ตอบสั้น ๆ ว่าเป็นรูปทั่วไป. ห้ามเดาข้อมูลที่ไม่เห็นในรูป. ห้ามใช้ markdown`,
    `ช่วยสรุปข้อมูลสำคัญจากรูปนี้${hint ? " (บริบท: " + hint + ")" : ""}`,
    { timeoutMs: 15000, extraParts: [{ inlineData: { mimeType, data: imageBase64 } }], maxOutputTokens: 1024, feature: "image", thinking: "MINIMAL" }
  );
}

export { Type };
