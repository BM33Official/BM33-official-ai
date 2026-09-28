// API ของแอปสมาชิก (LIFF)
//   POST session  {idToken} | {preview: sid}(แอดมิน)  -> ready + token | confirm | register
//   POST register {idToken, name, last3}               -> candidate + claim token
//   POST confirm  {idToken, claim?}                    -> ผูกบัญชี + token
//   GET  state                                         -> ข้อมูลทั้งหมด (board + ของฉัน)
//   POST fortune  {state}                              -> ซิงก์สมุดเซียมซี
//   POST claim    {formId}                             -> กด "ทำแล้ว"
//   POST unclaim  {formId}                             -> ยกเลิก "ทำแล้ว" ที่กดเอง
//   POST slip     {image(base64 jpeg), month?}         -> ส่งสลิปเงินรุ่น (AI ตรวจ → ฝ่ายการเงินยืนยัน)
import { NextResponse } from "next/server";
import {
  verifyIdToken, signSession, currentSession, signClaim, verifyClaim, APP_COOKIE,
} from "@/lib/app/session";
import { resolveSub, candidateFor, linkSub } from "@/lib/app/identity";
import { appState } from "@/lib/app/state";
import { syncFortune } from "@/lib/bc/fortune";
import { currentRole } from "@/lib/bc/auth";
import { getForm } from "@/lib/bc/forms";
import { autoDoneSet, setStatus, readOverlay } from "@/lib/bc/status";
import { getMember, patchMember } from "@/lib/bc/members";
import { readRoster } from "@/lib/bc/roster";
import { nowISO, digits } from "@/lib/bc/sheets";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function withSession(body: Record<string, unknown>, token: string) {
  const res = NextResponse.json({ ...body, token });
  res.cookies.set(APP_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 45 * 86_400 });
  return res;
}
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

// กันยิงถี่ (ต่อ instance)
const lastHit = new Map<string, number>();
function throttled(key: string, ms: number): boolean {
  const t = lastHit.get(key) ?? 0;
  if (Date.now() - t < ms) return true;
  lastHit.set(key, Date.now());
  if (lastHit.size > 5000) lastHit.clear();
  return false;
}

export async function GET(req: Request, { params }: { params: { action: string } }) {
  if (params.action !== "state") return bad("unknown", 404);
  const s = currentSession();
  if (!s) return bad("unauthorized", 401);
  try {
    const state = await appState(s.sid, { fixtureDraw: new URL(req.url).searchParams.get("fxdraw") ?? undefined });
    return NextResponse.json({ ok: true, preview: !!s.preview, ...state }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    log.error("app_state_failed", { message: String(err).slice(0, 200) });
    return bad("ดึงข้อมูลไม่สำเร็จชั่วคราว", 503);
  }
}

export async function POST(req: Request, { params }: { params: { action: string } }) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    switch (params.action) {
      case "session": {
        // แอดมินดูแอปแทนนักศึกษา (อ่านอย่างเดียว) — ใช้ทดสอบ/พรีวิว
        if (body.preview) {
          if ((await currentRole()) !== "admin") return bad("forbidden", 403);
          const sid = digits(body.preview);
          if (!(await readRoster()).some((r) => r.student_id === sid)) return bad("ไม่พบรหัสนี้");
          return withSession({ ok: true, step: "ready", preview: true }, signSession({ sid, uid: "preview:admin", preview: true }, 4 * 3600_000));
        }
        const who = await verifyIdToken(String(body.idToken ?? ""));
        if (!who) return bad("id_token_invalid", 401);
        const r = await resolveSub(who.sub);
        if (r.step === "ready") {
          // บันทึกเวลาเปิดแอปล่าสุด (ไม่เกิน 6 ชม.ต่อครั้งต่อคน — ประหยัดโควตาเขียนชีต)
          if (!throttled(`seen:${who.sub}`, 6 * 3600_000)) {
            const m = await getMember(who.sub).catch(() => null);
            const last = m?.last_seen_at ? new Date(m.last_seen_at).getTime() : 0;
            if (m && Date.now() - last > 6 * 3600_000) await patchMember(m, { last_seen_at: nowISO() }).catch(() => {});
          }
          return withSession({ ok: true, step: "ready" }, signSession({ sid: r.sid, uid: who.sub }));
        }
        if (r.step === "confirm") {
          return NextResponse.json({ ok: true, step: "confirm", candidate: r.candidate, claim: signClaim(who.sub, r.candidate.sid), profile: { name: who.name, picture: who.picture } });
        }
        return NextResponse.json({ ok: true, step: "register", profile: { name: who.name, picture: who.picture } });
      }

      case "register": {
        const who = await verifyIdToken(String(body.idToken ?? ""));
        if (!who) return bad("id_token_invalid", 401);
        if (throttled(`reg:${who.sub}`, 1500)) return bad("ช้าลงนิดนึงนะ");
        const r = await candidateFor(String(body.name ?? ""), String(body.last3 ?? ""));
        if (!r.candidate) return bad(r.error ?? "ไม่พบข้อมูล");
        return NextResponse.json({ ok: true, candidate: r.candidate, claim: signClaim(who.sub, r.candidate.sid) });
      }

      case "confirm": {
        const who = await verifyIdToken(String(body.idToken ?? ""));
        if (!who) return bad("id_token_invalid", 401);
        const sid = verifyClaim(String(body.claim ?? ""), who.sub);
        if (!sid) return bad("หมดเวลายืนยัน ลองใหม่อีกครั้งนะ");
        const r = await linkSub(who.sub, sid, who.name ?? "");
        if (!r.ok) return bad(r.error ?? "ยืนยันไม่สำเร็จ", 409);
        return withSession({ ok: true, step: "ready" }, signSession({ sid, uid: who.sub }));
      }

      case "fortune": {
        const s = currentSession();
        if (!s) return bad("unauthorized", 401);
        if (s.preview) return NextResponse.json({ ok: true, skipped: "preview" });
        if (throttled(`ft:${s.sid}`, 15_000)) return NextResponse.json({ ok: true, skipped: "throttled" });
        const merged = await syncFortune(s.sid, (body.state ?? {}) as Record<string, unknown>);
        return NextResponse.json({ ok: true, fortune: merged });
      }

      case "claim": {
        const s = currentSession();
        if (!s) return bad("unauthorized", 401);
        if (s.preview) return bad("โหมดพรีวิวกดไม่ได้");
        const form = await getForm(String(body.formId ?? ""));
        if (!form) return bad("ไม่พบฟอร์มนี้");
        const done = await autoDoneSet(form);
        if (done.has(s.sid)) {
          await setStatus(s.sid, form.form_id, "confirmed", "auto", "ตรวจพบในชีตตอนกดในแอป");
          return NextResponse.json({ ok: true, state: "done" });
        }
        // ฟอร์มที่แอดมินตั้ง "เชื่อใจ" -> กดแล้วเสร็จเลย ไม่ต้องรอตรวจ
        if (form.trust_claims === "1") {
          await setStatus(s.sid, form.form_id, "confirmed", "self_claim", "กดทำแล้วในแอป (เชื่อใจ)");
          return NextResponse.json({ ok: true, state: "done" });
        }
        await setStatus(s.sid, form.form_id, "claimed", "self_claim", "กดทำแล้วในแอป");
        return NextResponse.json({ ok: true, state: "claimed" });
      }

      case "unclaim": {
        // ยกเลิก "กรอกแล้ว" ที่กดเอง (กดผิด / อยากกลับไปเปิดลิงก์)
        const s = currentSession();
        if (!s) return bad("unauthorized", 401);
        if (s.preview) return bad("โหมดพรีวิวกดไม่ได้");
        const formId = String(body.formId ?? "");
        const o = (await readOverlay(true)).find((x) => x.student_id.replace(/\D/g, "") === s.sid && x.form_id === formId);
        if (!o || !o.source.startsWith("self_claim") || (o.state !== "claimed" && o.state !== "confirmed")) return bad("อันนี้ระบบ/กรรมการยืนยันแล้ว ยกเลิกเองไม่ได้");
        await setStatus(s.sid, formId, "none", "self_unclaim", "ยกเลิกในแอป");
        return NextResponse.json({ ok: true, state: "none" });
      }

      case "slip": {
        const s = currentSession();
        if (!s) return bad("unauthorized", 401);
        if (s.preview) return bad("โหมดพรีวิวส่งสลิปไม่ได้");
        if (throttled(`slip:${s.sid}`, 20_000)) return bad("รอสักครู่แล้วค่อยส่งอีกใบนะ");
        const img = String(body.image ?? "").replace(/^data:[^,]+,/, "");
        if (img.length < 2000 || img.length > 3_000_000) return bad("รูปสลิปไม่ถูกต้อง");
        const { submitSlip } = await import("@/lib/bc/slips");
        const r = await submitSlip({ studentId: s.sid, imageBase64: img, mimeType: "image/jpeg", source: "app", month: body.month ? String(body.month) : undefined });
        if (!r) return bad("ไม่เห็นว่าเป็นสลิปโอนเงิน ลองถ่าย/แคปใหม่ให้ชัด ๆ นะ");
        return NextResponse.json({ ok: true, verdict: r.verdict, message: r.message });
      }
    }
    return bad("unknown", 404);
  } catch (err) {
    log.error("app_api_failed", { action: params.action, message: String(err).slice(0, 300) });
    return bad("ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้งนะ", 500);
  }
}
