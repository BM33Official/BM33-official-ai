"use client";
// สถานะแอป: ล็อกอินด้วย LIFF (ไม่มีรหัสผ่าน) -> session -> ดึงข้อมูล + อัปเดตสดทุก ~15 วิ
import { useCallback, useEffect, useRef, useState } from "react";
import type { appState } from "@/lib/app/state";

export type AppData = Awaited<ReturnType<typeof appState>> & { ok: boolean; preview?: boolean };
export type Candidate = { sid: string; nickname: string; fullName: string; number: number };
export type Phase =
  | { kind: "boot" }
  | { kind: "confirm"; candidate: Candidate; claim: string; picture?: string }
  | { kind: "register"; picture?: string; name?: string }
  | { kind: "ready" }
  | { kind: "outside" } // เปิดนอก LINE และ LIFF ใช้ไม่ได้
  | { kind: "error"; message: string };

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || "2011755768-aSlCqo7l";
const TOKEN_KEY = "bm33.token";
const STATE_KEY = "bm33.state.v1";
const PROFILE_KEY = "bm33.lineprofile.v1"; // รูป + ชื่อ LINE ล่าสุด (โชว์ทันทีตอนเปิดแอป)

declare global {
  interface Window { liff?: Liff }
}
interface Liff {
  init(o: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(o?: { redirectUri?: string }): void;
  logout(): void;
  getIDToken(): string | null;
  isInClient(): boolean;
  isApiAvailable(api: string): boolean;
  shareTargetPicker(msgs: unknown[]): Promise<unknown>;
  closeWindow(): void;
  openWindow(o: { url: string; external?: boolean }): void;
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
}

const ls = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* */ } },
};

function loadLiffSdk(): Promise<Liff | null> {
  return new Promise((resolve) => {
    if (window.liff) return resolve(window.liff);
    const s = document.createElement("script");
    s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    s.async = true;
    s.onload = () => resolve(window.liff ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
    setTimeout(() => resolve(window.liff ?? null), 8000);
  });
}

export function useApp() {
  const [phase, setPhase] = useState<Phase>({ kind: "boot" });
  const [data, setData] = useState<AppData | null>(null);
  const [liff, setLiff] = useState<Liff | null>(null);
  const [picture, setPicture] = useState<string>("");
  const [lineName, setLineName] = useState<string>("");
  // โปรไฟล์ LINE ของผู้ใช้ (รูป + ชื่อที่ตั้งใน LINE) — จำไว้ในเครื่อง แล้วอัปเดตทุกครั้งที่เปิดแอป
  const setProfile = useCallback((p: { picture?: string; name?: string }) => {
    if (p.picture) setPicture(p.picture);
    if (p.name) setLineName(p.name);
    if (p.picture || p.name) ls.set(PROFILE_KEY, JSON.stringify({ picture: p.picture ?? "", name: p.name ?? "" }));
  }, []);
  const tokenRef = useRef<string>("");
  const idTokenRef = useRef<string>("");
  const versionRef = useRef<string>("");

  const api = useCallback(async (path: string, body?: unknown) => {
    const res = await fetch(`/api/app/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(tokenRef.current ? { authorization: `Bearer ${tokenRef.current}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({ ok: false, error: "network" }));
    return { status: res.status, ...j } as { status: number; ok: boolean; error?: string; [k: string]: unknown };
  }, []);

  const refresh = useCallback(async () => {
    if (!tokenRef.current) return;
    const fx = typeof window !== "undefined" ? new URL(window.location.href).searchParams.get("fxdraw") : null;
    const r = await api(fx ? `state?fxdraw=${fx}` : "state");
    if (r.status === 401) { ls.del(TOKEN_KEY); tokenRef.current = ""; return; }
    if (!r.ok) return;
    const d = r as unknown as AppData;
    if (d.version !== versionRef.current) {
      versionRef.current = d.version;
      setData(d);
      if (!d.preview) ls.set(STATE_KEY, JSON.stringify(d));
    }
  }, [api]);

  const accept = useCallback((token: string) => {
    tokenRef.current = token;
    ls.set(TOKEN_KEY, token);
    setPhase({ kind: "ready" });
    refresh();
  }, [refresh]);

  // ── boot ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = new URL(window.location.href);
      const preview = url.searchParams.get("preview");
      if (preview) {
        const r = await api("session", { preview });
        if (r.ok && r.token) { tokenRef.current = String(r.token); setPhase({ kind: "ready" }); refresh(); return; }
        setPhase({ kind: "error", message: "โหมดพรีวิวต้องล็อกอิน Control Center (แอดมิน) ก่อน" });
        return;
      }
      // เปิดไว (แสดงข้อมูลล่าสุดที่เคยโหลด) ระหว่างรอ LINE ยืนยันตัวตน
      try { const p = JSON.parse(ls.get(PROFILE_KEY) || "{}"); if (p.picture) setPicture(p.picture); if (p.name) setLineName(p.name); } catch { /* */ }
      const cachedToken = ls.get(TOKEN_KEY);
      const cachedState = ls.get(STATE_KEY);
      if (cachedToken && cachedState) {
        try {
          tokenRef.current = cachedToken;
          const d = JSON.parse(cachedState) as AppData;
          versionRef.current = d.version;
          setData(d);
          setPhase({ kind: "ready" });
          refresh();
        } catch { /* ignore */ }
      }
      const l = await loadLiffSdk();
      if (cancelled) return;
      if (!l) {
        if (!cachedToken) setPhase({ kind: "outside" });
        return;
      }
      try {
        await l.init({ liffId: LIFF_ID });
      } catch {
        if (!cachedToken) setPhase({ kind: "outside" });
        return;
      }
      setLiff(l);
      if (!l.isLoggedIn()) {
        if (cachedToken) return; // ใช้ token เดิมต่อ (เช่นเปิดใน browser ภายนอก)
        l.login({ redirectUri: window.location.href });
        return;
      }
      const idToken = l.getIDToken() ?? "";
      idTokenRef.current = idToken;
      const r = await api("session", { idToken });
      if (cancelled) return;
      if (r.status === 401) {
        // ID token หมดอายุ -> ขอใหม่
        if (!cachedToken) { l.logout(); l.login({ redirectUri: window.location.href }); }
        return;
      }
      const prof = r.profile as { picture?: string; name?: string } | undefined;
      if (prof) setProfile(prof);
      // รูป/ชื่อล่าสุดจาก LINE โดยตรง (เปลี่ยนรูปใน LINE แล้วแอปเปลี่ยนตาม)
      l.getProfile?.().then((p) => setProfile({ picture: p.pictureUrl, name: p.displayName })).catch(() => {});
      if (r.step === "ready" && r.token) accept(String(r.token));
      else if (r.step === "confirm") setPhase({ kind: "confirm", candidate: r.candidate as Candidate, claim: String(r.claim), picture: prof?.picture });
      else if (r.step === "register") setPhase({ kind: "register", picture: prof?.picture, name: prof?.name });
      else if (!cachedToken) setPhase({ kind: "error", message: String(r.error ?? "เข้าสู่ระบบไม่สำเร็จ") });
    })();
    return () => { cancelled = true; };
  }, [api, refresh, accept, setProfile]);

  // ── อัปเดตสด: ทุก 15 วิ ตอนเปิดหน้าอยู่ + ทันทีเมื่อกลับเข้าแอป ───────────────
  useEffect(() => {
    if (phase.kind !== "ready") return;
    const tick = () => { if (!document.hidden) refresh(); };
    const t = setInterval(tick, 15_000);
    const onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [phase.kind, refresh]);

  const register = useCallback(async (name: string, last3: string) => {
    const r = await api("register", { idToken: idTokenRef.current, name, last3 });
    if (!r.ok) return String(r.error ?? "ไม่พบข้อมูล");
    setPhase({ kind: "confirm", candidate: r.candidate as Candidate, claim: String(r.claim), picture });
    return "";
  }, [api, picture]);

  const confirm = useCallback(async (claim: string) => {
    const r = await api("confirm", { idToken: idTokenRef.current, claim });
    if (!r.ok || !r.token) return String(r.error ?? "ยืนยันไม่สำเร็จ");
    accept(String(r.token));
    return "";
  }, [api, accept]);

  return { phase, setPhase, data, refresh, api, liff, picture, lineName, register, confirm, isPreview: !!data?.preview };
}

export function haptic(ms = 8) {
  try { navigator.vibrate?.(ms); } catch { /* iOS ไม่รองรับ */ }
}
