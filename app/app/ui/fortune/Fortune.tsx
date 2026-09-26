"use client";
// หน้าเซียมซี — สุ่มในเครื่อง (ลื่นทันที) บันทึกสมุดสะสมในเครื่อง + ซิงก์ขึ้นระบบเป็นระยะ
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Wheel, { WheelHandle } from "./Wheel";
import { TierSymbol } from "./Symbols";
import { sound, Particles } from "./fx";
import {
  FORTUNES, TIERS, TIER_BY_KEY, TIER_RANK, CATEGORIES, CAT_BY_KEY, PITY_LIMIT, TOTAL,
  decodeBits, encodeBits, orBits, hasBit, setBit, countBits, rollTier, pickFortune, Fortune as F, TierKey,
} from "@/lib/fortunes/data";
import { bkkDayKey } from "@/lib/time";
import { Sheet, Layer } from "../Chrome";
import { IBook, IFlame, ISound, IShare, ISpark } from "../icons";
import { haptic } from "../useApp";

export interface FortuneState { pulls: number; collected: string; streak: number; last_day: string; best: string; pity: number }

const LS = (sid: string) => `bm33.fortune.${sid}`;
const SOUND_KEY = "bm33.sound";

function rng(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

type Liffish = { isApiAvailable(a: string): boolean; shareTargetPicker(m: unknown[]): Promise<unknown> } | null;

export default function FortuneScreen({
  sid, nickname, server, active, onEnergy, api, liff, preview, toast,
}: {
  sid: string; nickname: string; server: FortuneState; active: boolean;
  onEnergy: (e: number) => void; api: (p: string, b?: unknown) => Promise<{ ok: boolean }>;
  liff: Liffish; preview: boolean; toast: (t: string) => void;
}) {
  const wheel = useRef<WheelHandle>(null);
  const particleCanvas = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particles | null>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<FortuneState>(server);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ f: F; fresh: boolean } | null>(null);
  const [viewing, setViewing] = useState<F | null>(null);
  const [book, setBook] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const dirty = useRef(false);
  const today = bkkDayKey();

  // โหลดสถานะในเครื่อง แล้วรวมกับของ server (OR สมุดสะสม)
  useEffect(() => {
    let local: FortuneState | null = null;
    try { local = JSON.parse(localStorage.getItem(LS(sid)) || "null"); } catch { /* */ }
    const merged: FortuneState = local ? {
      pulls: Math.max(local.pulls, server.pulls),
      collected: encodeBits(orBits(decodeBits(local.collected), decodeBits(server.collected))),
      streak: local.last_day >= server.last_day ? local.streak : server.streak,
      last_day: local.last_day >= server.last_day ? local.last_day : server.last_day,
      best: TIER_RANK[(local.best || "a") as TierKey] >= TIER_RANK[(server.best || "a") as TierKey] ? local.best : server.best,
      pity: local.last_day >= server.last_day ? local.pity : server.pity,
    } : server;
    setState(merged);
    try { setSoundOn(localStorage.getItem(SOUND_KEY) !== "0"); } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  useEffect(() => { sound.enabled = soundOn; try { localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0"); } catch { /* */ } }, [soundOn]);

  useEffect(() => {
    const onR = () => particles.current?.resize();
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  // ซิงก์ขึ้น server (ทุก 20 วิถ้ามีการเปลี่ยนแปลง + ตอนออกจากแอป)
  const sync = useCallback(() => {
    if (!dirty.current || preview) return;
    dirty.current = false;
    api("fortune", { state }).catch(() => { dirty.current = true; });
  }, [api, state, preview]);
  useEffect(() => {
    const t = setInterval(sync, 20_000);
    const onHide = () => { if (document.hidden) sync(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onHide); };
  }, [sync]);

  const bits = useMemo(() => decodeBits(state.collected), [state.collected]);
  const have = useMemo(() => countBits(bits), [bits]);
  const firstOfDay = state.last_day !== today;
  const pityLeft = Math.max(0, PITY_LIMIT - state.pity);
  const streakShown = state.last_day === today || state.last_day === bkkDayKey(Date.now() - 86_400_000) ? state.streak : 0;

  const pull = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    haptic(20);
    sound.whoosh();
    if (!particles.current && particleCanvas.current) particles.current = new Particles(particleCanvas.current);
    // ── ตัดสินผลก่อน แล้วค่อยเล่นแอนิเมชันให้ตรงผล ──
    const tier = rollTier(rng, { firstOfDay, pity: state.pity });
    const f = pickFortune(rng, tier, bits);
    const fresh = !hasBit(bits, f.id);
    const catIndex = CATEGORIES.findIndex((c) => c.key === f.cat);
    const rank = TIER_RANK[tier];
    onEnergy(1);
    stageRef.current?.classList.remove("shake");

    // ประกายไฟรอบวงล้อระหว่างหมุน
    const rect = stageRef.current?.querySelector(".ft-wheel-wrap")?.getBoundingClientRect();
    let sparkT: ReturnType<typeof setInterval> | undefined;
    if (rect) {
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2, R = rect.width / 2;
      sparkT = setInterval(() => {
        const a = Math.random() * Math.PI * 2;
        particles.current?.trail(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95, Math.random() < 0.7 ? "#ffe9a8" : "#7cc4ff");
      }, 28);
    }
    let lastTick = 0;
    await wheel.current?.spin({
      catIndex, tier,
      onTick: (ring) => {
        const now = performance.now();
        if (now - lastTick < 38) return;
        lastTick = now;
        sound.tick(ring === "tier" ? 1.25 : 1);
        haptic(4);
      },
      onCatStop: () => { haptic(15); sound.tick(0.7); },
    });
    if (sparkT) clearInterval(sparkT);

    // ── ระเบิดผล ──
    const T = TIER_BY_KEY[tier];
    sound.chime(tier);
    haptic(rank >= 3 ? 60 : 25);
    if (rect) {
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      particles.current?.ring(cx, cy, T.color);
      particles.current?.burst(cx, cy, [T.color, "#ffffff", "#ffe9a8"], 50 + rank * 40, 1 + rank * 0.25, rank >= 4);
      if (rank >= 4) setTimeout(() => particles.current?.burst(cx, cy - 40, ["#fcd34d", "#fda4af", "#67e8f9", "#c4b5fd", "#fff"], 160, 1.6, true), 250);
    }
    if (rank >= 3 && flashRef.current) {
      flashRef.current.style.background = rank >= 5
        ? "radial-gradient(circle at 50% 45%, #fff, rgba(255,240,200,.6) 40%, rgba(160,120,255,.2) 70%, transparent)"
        : `radial-gradient(circle at 50% 45%, ${T.color}, transparent 70%)`;
      flashRef.current.classList.remove("go"); void flashRef.current.offsetWidth; flashRef.current.classList.add("go");
      stageRef.current?.classList.add("shake");
    }

    // ── อัปเดตสถานะ ──
    const yesterday = bkkDayKey(Date.now() - 86_400_000);
    const nb = decodeBits(state.collected);
    setBit(nb, f.id);
    const next: FortuneState = {
      pulls: state.pulls + 1,
      collected: encodeBits(nb),
      streak: state.last_day === today ? state.streak : state.last_day === yesterday ? state.streak + 1 : 1,
      last_day: today,
      best: TIER_RANK[(state.best || "a") as TierKey] >= rank && state.best ? state.best : tier,
      pity: rank >= 3 ? 0 : state.pity + 1,
    };
    setState(next);
    dirty.current = true;
    try { localStorage.setItem(LS(sid), JSON.stringify(next)); } catch { /* */ }
    setTimeout(() => { setResult({ f, fresh }); onEnergy(0); setBusy(false); }, rank >= 3 ? 650 : 350);
  }, [busy, firstOfDay, state, bits, onEnergy, sid, today]);

  const share = useCallback(async (f: F) => {
    const T = TIER_BY_KEY[f.tier];
    const cat = CAT_BY_KEY[f.cat];
    const text = `🔮 เซียมซี BM33 — ${nickname} ได้ใบ "${T.name}"\n${cat.emoji} ${f.title}\n${f.text}`;
    if (liff?.isApiAvailable("shareTargetPicker")) {
      try {
        await liff.shareTargetPicker([{
          type: "flex", altText: text.slice(0, 390),
          contents: {
            type: "bubble", size: "kilo",
            body: {
              type: "box", layout: "vertical", paddingAll: "18px", backgroundColor: "#0B1B4D", spacing: "sm",
              contents: [
                { type: "text", text: `เซียมซี BM33 · ${T.name}`, color: T.key === "f" ? "#FDE68A" : T.color, size: "xs", weight: "bold" },
                { type: "text", text: `${cat.emoji} ${f.title}`, color: "#FFFFFF", size: "lg", weight: "bold", wrap: true },
                { type: "text", text: f.text, color: "#DBEAFE", size: "sm", wrap: true, margin: "md" },
                { type: "text", text: `— ${nickname} เขย่าได้ใบนี้`, color: "#93C5FD", size: "xxs", margin: "lg" },
                { type: "button", style: "primary", color: "#F5A524", height: "sm", margin: "lg", action: { type: "uri", label: "เขย่าของตัวเอง", uri: "https://liff.line.me/2011755768-aSlCqo7l?tab=fortune" } },
              ],
            },
          },
        }]);
        return;
      } catch { /* ผู้ใช้ปิด */ return; }
    }
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast("คัดลอกคำทำนายแล้ว วางส่งให้เพื่อนได้เลย");
    } catch { /* */ }
  }, [liff, nickname, toast]);

  const shown = result?.f ?? viewing;

  return (
    <div className="col" ref={stageRef}>
      <div className="largetitle row between" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">ดูดวงรายวันของรุ่น</div>
          <h1>เซียมซี BM33</h1>
        </div>
        <button className="icon-bubble press" onClick={() => setSoundOn((v) => !v)} aria-label="เสียง"><ISound filled={soundOn} /></button>
      </div>

      <div className="ft-stats">
        <div className="glass ft-stat"><b><IFlame width={18} height={18} style={{ verticalAlign: -3, color: "#fb923c" }} /> {streakShown}</b><span>วันติดต่อกัน</span></div>
        <button className="glass ft-stat press" onClick={() => setBook(true)}><b>{have}<small style={{ fontSize: 13, color: "var(--ink-3)" }}>/{TOTAL}</small></b><span>สมุดสะสม</span></button>
        <div className="glass ft-stat"><b>{state.pulls}</b><span>เขย่าไปแล้ว</span></div>
      </div>

      <div className="ft-stage">
        <div className="ft-wheel-wrap" onClick={() => busy && wheel.current?.skip()}>
          <svg className="ft-pointer" viewBox="0 0 34 44" aria-hidden>
            <defs><linearGradient id="ptr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff6d0" /><stop offset="1" stopColor="#d18a08" /></linearGradient></defs>
            <path d="M17 42 3 12a14 14 0 1 1 28 0z" fill="url(#ptr)" stroke="#7a4b03" strokeWidth="1.5" />
            <circle cx="17" cy="13" r="5" fill="#fff" opacity=".9" />
          </svg>
          <Wheel ref={wheel} paused={!active} />
        </div>
        <div style={{ height: 14 }} />
        <button className="btn gold ft-cta press" disabled={busy} onClick={pull}>
          {busy ? "กำลังเสี่ยงทาย… (แตะวงล้อเพื่อข้าม)" : firstOfDay ? "เขย่าใบแรกของวัน ✨" : "เขย่าเซียมซี"}
        </button>
        <div style={{ height: 10 }} />
        {firstOfDay ? (
          <span className="ft-bonus"><ISpark width={14} height={14} />ใบแรกของวันการันตี “ไข่มุก” ขึ้นไป</span>
        ) : (
          <span className="tiny muted">อีก {pityLeft} ครั้ง การันตี “จันทร์เพ็ญ” ขึ้นไป 🌕</span>
        )}
      </div>

      <div className="glass card">
        <div className="b" style={{ marginBottom: 8 }}>ระดับความหายาก</div>
        <div className="list">
          {[...TIERS].reverse().map((t) => (
            <div key={t.key} className="li" style={{ padding: "9px 2px" }}>
              <span style={{ width: 12, height: 12, borderRadius: 9, background: t.color, boxShadow: `0 0 10px ${t.glow}`, flex: "none" }} />
              <div className="grow"><b>{t.name}</b> <span className="tiny muted">{t.en}</span></div>
              <span className="tiny muted">{(t.rate * 100).toFixed(t.rate < 0.01 ? 1 : 0)}%</span>
            </div>
          ))}
        </div>
      </div>

      <Layer>
      <canvas ref={particleCanvas} className="particles" />
      <div ref={flashRef} className="flash" />

      {/* การ์ดผลลัพธ์ */}
      <div className={`reveal ${shown ? "on" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) { setResult(null); setViewing(null); } }}>
        {shown && (
          <div>
            <FortuneCard key={`${shown.id}-${state.pulls}`} f={shown} fresh={!!result?.fresh} />
            <div className="acts">
              {result ? (
                <>
                  <button className="btn ghost" onClick={() => share(shown)}><IShare width={16} height={16} />ส่งให้เพื่อน</button>
                  <button className="btn gold" onClick={() => { setResult(null); setTimeout(pull, 220); }}>เขย่าอีกครั้ง</button>
                </>
              ) : (
                <>
                  <button className="btn ghost" onClick={() => share(shown)}><IShare width={16} height={16} />ส่งให้เพื่อน</button>
                  <button className="btn" onClick={() => setViewing(null)}>ปิด</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      </Layer>

      <Sheet open={book} onClose={() => setBook(false)}>
        <div className="detail">
          <h2 style={{ marginBottom: 2 }}>สมุดสะสมเซียมซี</h2>
          <div className="soft small">สะสมแล้ว {have} จาก {TOTAL} ใบ · แตะใบที่มีเพื่อนอ่านซ้ำ</div>
          <div style={{ height: 8, borderRadius: 9, background: "rgba(255,255,255,.1)", margin: "12px 0 6px", overflow: "hidden" }}>
            <div style={{ width: `${(have / TOTAL) * 100}%`, height: "100%", background: "linear-gradient(90deg,#fcd34d,#f59e0b)", borderRadius: 9, transition: "width 1s" }} />
          </div>
          {CATEGORIES.map((c) => {
            const items = FORTUNES.filter((f) => f.cat === c.key);
            const got = items.filter((f) => hasBit(bits, f.id)).length;
            return (
              <div key={c.key} style={{ marginTop: 16 }}>
                <div className="row between" style={{ marginBottom: 8 }}><b>{c.emoji} {c.name}</b><span className="tiny muted">{got}/{items.length}</span></div>
                <div className="coll-grid">
                  {items.map((f) => {
                    const own = hasBit(bits, f.id);
                    const T = TIER_BY_KEY[f.tier];
                    return (
                      <button key={f.id} className={`coll-cell ${own ? "have" : ""}`} style={{ ["--cc" as string]: T.color }}
                        onClick={() => { if (own) { setBook(false); setTimeout(() => setViewing(f), 250); } else haptic(); }}>
                        <i className="tdot" />
                        {own ? <span style={{ padding: 3, textAlign: "center", lineHeight: 1.2 }}>{f.title.slice(0, 12)}</span> : "?"}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="row" style={{ marginTop: 18 }}><IBook width={16} height={16} /><span className="tiny muted">จุดสีมุมการ์ด = ระดับความหายากของใบนั้น</span></div>
        </div>
      </Sheet>
    </div>
  );
}

function FortuneCard({ f, fresh }: { f: F; fresh: boolean }) {
  const T = TIER_BY_KEY[f.tier];
  const cat = CAT_BY_KEY[f.cat];
  const rank = TIER_RANK[f.tier];
  const tc = f.tier === "f" ? "#fde68a" : T.color;
  return (
    <div className="fcard-wrap">
      <div className="fcard" style={{ ["--tc" as string]: tc, ["--tg" as string]: T.glow, ["--holo" as string]: rank >= 3 ? (rank >= 5 ? 1 : 0.7) : 0 }}>
        <div className="face back" />
        <div className="face front">
          {fresh && <span className="newb">ใหม่!</span>}
          <div className="tier"><b>{T.name.toUpperCase()}</b><span className="tiny muted">{T.en}</span></div>
          <div className="fbody">
            <TierSymbol tier={f.tier} color={T.color} />
            <div className="row" style={{ justifyContent: "center" }}><span className="chip">{cat.emoji} {cat.name}</span></div>
            <div className="ftitle">{f.title}</div>
            <div className="ftext">{f.text}</div>
          </div>
          <div className="foot"><span>เซียมซี BM33</span><span>ใบที่ {f.id + 1}</span></div>
        </div>
      </div>
    </div>
  );
}
