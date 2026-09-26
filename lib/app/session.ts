// session ของแอปสมาชิก (LIFF) — ไม่มีรหัสผ่าน
// 1) แอปขอ ID token จาก LIFF -> server ยืนยันกับ LINE (oauth2/v2.1/verify) ได้ userId จริง (sub)
// 2) จับคู่ sub กับสมาชิก -> ออก token ที่เซ็นด้วย HMAC (เก็บใน cookie + localStorage)
// ห้ามเชื่อ userId ที่ client ส่งมาเองเด็ดขาด
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";

export const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || "2011755768-aSlCqo7l";
export const LIFF_CHANNEL_ID = LIFF_ID.split("-")[0];
export const APP_COOKIE = "bm33_app";
const TTL_MS = 45 * 86_400_000;

function key(): string {
  return createHash("sha256").update("bm33-app|" + (process.env.LINE_CHANNEL_SECRET ?? "") + "|" + (process.env.GOOGLE_SHEET_ID ?? "")).digest("hex");
}

export interface AppSession {
  sid: string; // student id
  uid: string; // LIFF userId (sub) หรือ "preview:<admin>"
  exp: number;
  preview?: boolean; // แอดมินดูแทน (อ่านอย่างเดียว)
}

const b64u = (s: string) => Buffer.from(s).toString("base64url");

export function signSession(s: Omit<AppSession, "exp">, ttl = TTL_MS): string {
  const body = b64u(JSON.stringify({ ...s, exp: Date.now() + ttl }));
  const sig = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined | null): AppSession | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(createHmac("sha256", key()).update(body).digest("base64url"));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as AppSession;
    if (!s.sid || !s.exp || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

// อ่าน session จาก header Authorization (หลัก) หรือ cookie (สำรอง)
export function currentSession(): AppSession | null {
  const h = headers().get("authorization") ?? "";
  const bearer = h.startsWith("Bearer ") ? h.slice(7) : "";
  return verifySession(bearer) ?? verifySession(cookies().get(APP_COOKIE)?.value);
}

// ยืนยัน ID token ของ LIFF กับ LINE -> userId จริง
export async function verifyIdToken(idToken: string): Promise<{ sub: string; name?: string; picture?: string } | null> {
  if (!idToken) return null;
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: LIFF_CHANNEL_ID }).toString(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { sub?: string; name?: string; picture?: string };
  return j.sub ? { sub: j.sub, name: j.name, picture: j.picture } : null;
}

// token สั้น ๆ สำหรับขั้น "ยืนยันว่าเป็นคุณ" (ผูก sub + student id ที่ระบบเสนอ)
export function signClaim(sub: string, sid: string): string {
  return signSession({ sid, uid: `claim:${sub}` }, 15 * 60_000);
}
export function verifyClaim(token: string, sub: string): string | null {
  const s = verifySession(token);
  if (!s || s.uid !== `claim:${sub}`) return null;
  return s.sid;
}
