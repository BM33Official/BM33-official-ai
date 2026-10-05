"use client";
// หน้าเซียมซี — สุ่มในเครื่อง (ลื่นทันที) บันทึกสมุดสะสมในเครื่อง + ซิงก์ขึ้นระบบเป็นระยะ
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Wheel from "./Wheel";
import Cutscene, { CutsceneHandle } from "./Cutscene";
import { TierSymbol } from "./Symbols";
import { sound } from "./fx";
import {
  FORTUNES, TIERS, TIER_BY_KEY, TIER_RANK, CATEGORIES, CAT_BY_KEY, PITY_LIMIT, TOTAL,
  decodeBits, encodeBits, orBits, hasBit, setBit, countBits, rollTier, pickFortune, Fortune as F, TierKey,
  luckyHour, tierRates, streakBonus, LUCKY_MULT,
} from "@/lib/fortunes/data";
import { bkkDayKey, bkkParts } from "@/lib/time";
import { Sheet, Layer } from "../Chrome";
import { IBook, IFlame, ISound, IShare, ISpark } from "../icons";
import { haptic } from "../useApp";

export interface FortuneState { pulls: number; collected: string; streak: number; last_day: string; best: string; pity: number; jackpot_at?: string; jackpots?: number }
export interface FortuneBoard { jackpots: { name: string; at: string }[]; pool: number; players: number; total: number }

const LS = (sid: string) => `bm33.fortune.${sid}`;
const SOUND_KEY = "bm33.sound";

function rng(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

type Liffish = { isApiAvailable(a: string): boolean; shareTargetPicker(m: unknown[]): Promise<unknown> } | null;

export default function FortuneScreen({
  sid, nickname, server, board, active, onEnergy, api, liff, preview, toast,
}: {
  sid: string; nickname: string; server: FortuneState; board?: FortuneBoard; active: boolean;
  onEnergy: (e: number) => void; api: (p: string, b?: unknown) => Promise<{ ok: boolean }>;
  liff: Liffish; preview: boolean; toast: (t: string) => void;
}) {
  const cut = useRef<CutsceneHandle>(null);
  const [state, setState] = useState<FortuneState>(server);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ f: F; fresh: boolean } | null>(null);
  const [viewing, setViewing] = useState<F | null>(null);
  const [book, setBook] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [myJackpot, setMyJackpot] = useState<{ name: string; at: string } | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const dirty = useRef(false);
  const today = bkkDayKey(clock);

  useEffect(() => { if (!active) return; const t = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(t); }, [active]);

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
      jackpot_at: (local.jackpot_at ?? "") > (server.jackpot_at ?? "") ? local.jackpot_at : server.jackpot_at,
      jackpots: Math.max(local.jackpots ?? 0, server.jackpots ?? 0),
    } : server;
    setState(merged);
    try { setSoundOn(localStorage.getItem(SOUND_KEY) !== "0"); } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid]);

  useEffect(() => { sound.enabled = soundOn; try { localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0"); } catch { /* */ } }, [soundOn]);

  // ซิงก์ขึ้น server (ทุก 20 วิถ้ามีการเปลี่ยนแปลง + ตอนออกจากแอป + ทันทีเมื่อแตกแจ็กพอต)
  const stateRef = useRef(state);
  stateRef.current = state;
  const sync = useCallback(() => {
    if (!dirty.current || preview) return;
    dirty.current = false;
    api("fortune", { state: stateRef.current }).catch(() => { dirty.current = true; });
  }, [api, preview]);
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
  const streakShown = state.last_day === today || state.last_day === bkkDayKey(clock - 86_400_000) ? state.streak : 0;
  const lh = luckyHour(today);
  const hourNow = bkkParts(clock).hh;
  const lucky = hourNow === lh;
  const rates = tierRates({ lucky, streak: streakShown });
  const jackpots = useMemo(() => {
    const list = [...(board?.jackpots ?? [])];
    if (myJackpot && !list.some((j) => j.at === myJackpot.at)) list.unshift(myJackpot);
    return list;
  }, [board?.jackpots, myJackpot]);
  const pool = board?.pool ?? 0;

  const pull = useCallback(async () => {
    if (busy) return;
    sound.unlock(); // ต้องอยู่ในจังหวะแตะ (ก่อน await ใด ๆ) ไม่งั้นมือถือไม่ยอมเล่นเสียง
    setBusy(true);
    haptic(20);
    // ── ตัดสินผลก่อน แล้วค่อยเล่นคัตซีนให้ตรงผล ──
    let tier = rollTier(rng, { firstOfDay, pity: state.pity, lucky, streak: streakShown });
    // โหมดพรีวิวแอดมิน: ?fxtier=f เพื่อดูคัตซีนแต่ละระดับ (ไม่มีผลกับผู้ใช้จริง)
    if (preview) { const fx = new URL(window.location.href).searchParams.get("fxtier") as TierKey | null; if (fx && fx in TIER_RANK) tier = fx; }
    const f = pickFortune(rng, tier, bits);
    const fresh = !hasBit(bits, f.id);
    const rank = TIER_RANK[tier];
    onEnergy(1);
    await cut.current?.play(tier, { lucky });

    // ── อัปเดตสถานะ ──
    const yesterday = bkkDayKey(Date.now() - 86_400_000);
    const nb = decodeBits(state.collected);
    setBit(nb, f.id);
    const at = new Date().toISOString();
    const next: FortuneState = {
      pulls: state.pulls + 1,
      collected: encodeBits(nb),
      streak: state.last_day === today ? state.streak : state.last_day === yesterday ? state.streak + 1 : 1,
      last_day: today,
      best: TIER_RANK[(state.best || "a") as TierKey] >= rank && state.best ? state.best : tier,
      pity: rank >= 3 ? 0 : state.pity + 1,
      jackpot_at: rank >= 5 ? at : state.jackpot_at,
      jackpots: (state.jackpots ?? 0) + (rank >= 5 ? 1 : 0),
    };
    setState(next);
    stateRef.current = next;
    dirty.current = true;
    try { localStorage.setItem(LS(sid), JSON.stringify(next)); } catch { /* */ }
    if (rank >= 5) { setMyJackpot({ name: nickname, at }); sync(); }
    setResult({ f, fresh }); onEnergy(0); setBusy(false);
  }, [busy, firstOfDay, state, bits, onEnergy, sid, today, lucky, streakShown, nickname, sync, preview]);

  const share = useCallback(async (f: F) => {
    const T = TIER_BY_KEY[f.tier];
    const cat = CAT_BY_KEY[f.cat];
    const text = `🐉 เซียมซีมังกร BM33 — ${nickname} ได้ใบ ${T.name} ${T.en}\n${cat.emoji} ${f.title}\n${f.text}`;
    if (liff?.isApiAvailable("shareTargetPicker")) {
      try {
        await liff.shareTargetPicker([{
          type: "flex", altText: text.slice(0, 390),
          contents: {
            type: "bubble", size: "kilo",
            body: {
              type: "box", layout: "vertical", paddingAll: "18px", backgroundColor: "#0B1B4D", spacing: "sm",
              contents: [
                { type: "text", text: `เซียมซีมังกร BM33 · ${T.name} ${T.en}`, color: T.key === "f" ? "#FDE68A" : T.color, size: "xs", weight: "bold" },
                { type: "text", text: `${cat.emoji} ${f.title}`, color: "#FFFFFF", size: "lg", weight: "bold", wrap: true },
                { type: "text", text: f.text, color: "#DBEAFE", size: "sm", wrap: true, margin: "md" },
                { type: "text", text: `— ${nickname} เขย่าได้ใบนี้`, color: "#93C5FD", size: "xxs", margin: "lg" },
                { type: "button", style: "primary", color: "#F5A524", height: "sm", margin: "lg", action: { type: "uri", label: "เขย่าของตัวเอง", uri: "https://liff.line.me/2011755768-aSlCqo7l?tab=fortune" } },
              ],
            },
          },
        }]);
        return;
      } catch { return; }
    }
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast("คัดลอกคำทำนายแล้ว วางส่งให้เพื่อนได้เลย");
    } catch { /* */ }
  }, [liff, nickname, toast]);

  const shown = result?.f ?? viewing;
  const glow = TIER_BY_KEY[(state.best || "c") as TierKey]?.color ?? "#fcd34d";
  const time = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

  return (
    <div className="col dash ft">
      <div className="dash-head">
        <div><div className="when">ดูดวงรายวันของรุ่น</div><h1 className="ft-title">เซียมซีมังกร</h1></div>
        <button className="icon-bubble press" onClick={() => { const v = !soundOn; setSoundOn(v); sound.enabled = v; if (v) sound.unlock(); }} aria-label="เสียง"><ISound filled={soundOn} /></button>
      </div>

      {/* หอเกียรติยศวันนี้ */}
      <div className="hof">
        <span className="hof-crown">👑</span>
        <div className="hof-body">
          <small>แจ็กพอตวันนี้</small>
          {jackpots.length ? (
            <div className="hof-names">{jackpots.map((j, i) => <span key={i}><b>{j.name}</b> {time(j.at)}</span>)}</div>
          ) : <b className="hof-empty">ยังไม่มีใครได้แจ็กพอต — คนแรกอาจเป็นเธอ</b>}
        </div>
      </div>

      {/* Jackpot Pool + Lucky Hour */}
      <div className="pool-row">
        <div className="pool">
          <small>JACKPOT POOL</small>
          <b className="pool-n">{pool.toLocaleString()}</b>
          <span>ครั้งที่ทั้งรุ่นเขย่ามา ตั้งแต่แจ็กพอตล่าสุด</span>
        </div>
        <div className={`lucky ${lucky ? "on" : ""}`}>
          <small>{lucky ? "⚡ LUCKY HOUR!" : "LUCKY HOUR วันนี้"}</small>
          <b>{String(lh).padStart(2, "0")}:00–{String(lh + 1).padStart(2, "0")}:00</b>
          <span>{lucky ? `Platinum ขึ้นไป ×${LUCKY_MULT} ตอนนี้เลย!` : `Platinum ขึ้นไป ×${LUCKY_MULT}`}</span>
        </div>
      </div>

      <div className="ft-stage">
        <div className="ft-wheel-wrap"><Wheel paused={!active} hidden={busy} glow={lucky ? "#fde047" : glow} /></div>
        <button className={`btn gold ft-cta press ${busy ? "" : "pulse"}`} disabled={busy} onClick={pull}>
          {busy ? "กำลังเสี่ยงทาย…" : firstOfDay ? "เขย่าใบแรกของวัน ✨" : "เขย่าเซียมซี"}
        </button>
        {firstOfDay && <span className="ft-bonus"><ISpark width={14} height={14} />ใบแรกของวันการันตี Gold ★★★ ขึ้นไป</span>}
      </div>

      {/* มาตรวัด */}
      <div className="meters">
        <div className="meter-it">
          <div className="row between"><small>การันตี Platinum ★★★★</small><b>อีก {pityLeft} ครั้ง</b></div>
          <div className="bar"><i style={{ width: `${(state.pity / PITY_LIMIT) * 100}%` }} /></div>
        </div>
        <div className="meter-it">
          <div className="row between"><small><IFlame width={13} height={13} style={{ verticalAlign: -2, color: "#fb923c" }} /> เขย่าติดกัน {streakShown} วัน</small><b>โชค +{Math.round(streakBonus(streakShown) * 100)}%</b></div>
          <div className="bar fire"><i style={{ width: `${(Math.min(7, streakShown) / 7) * 100}%` }} /></div>
        </div>
      </div>

      {/* ระดับ */}
      <section className="panel">
        <div className="ph"><h2>ระดับความหายาก</h2><span className="ph-note">โอกาสตอนนี้</span></div>
        {[...TIERS].reverse().map((t) => (
          <div key={t.key} className={`tier-row tr-${t.key}`}>
            <span className="tr-badge" style={{ ["--c" as string]: t.color }}>{t.en}</span>
            <b style={{ color: t.color }}>{t.name}</b>
            <span className="tr-th">{t.th}</span>
            <span className="tr-rate">{(rates[t.key] * 100).toFixed(rates[t.key] < 0.01 ? 2 : rates[t.key] < 0.1 ? 1 : 0)}%</span>
          </div>
        ))}
        <div className="p-empty" style={{ paddingTop: 8 }}>เขย่าทุกวันติดกัน = โชคเพิ่ม · ชั่วโมงนำโชค = Platinum ขึ้นไป ×{LUCKY_MULT} · ได้แจ็กพอตแล้วชื่อขึ้นหอเกียรติยศ</div>
      </section>

      <div className="ft-stats">
        <button className="ft-stat press" onClick={() => setBook(true)}><b>{have}<small>/{TOTAL}</small></b><span>สมุดสะสม</span></button>
        <div className="ft-stat"><b>{state.pulls}</b><span>เขย่าไปแล้ว</span></div>
        <div className="ft-stat"><b>{state.jackpots ?? 0}</b><span>แจ็กพอตของฉัน</span></div>
      </div>

      <Cutscene ref={cut} />

      <Layer>
      {/* การ์ดผลลัพธ์ */}
      <div className={`reveal ${shown ? "on" : ""}`} onClick={(e) => { if (e.target === e.currentTarget && !result) setViewing(null); }}>
        {shown && (
          <div>
            <FortuneCard key={`${shown.id}-${state.pulls}`} f={shown} fresh={!!result?.fresh} />
            <div className="acts">
              {result ? (
                <>
                  <button className="btn ghost" onClick={() => share(shown)}><IShare width={16} height={16} />ส่งให้เพื่อน</button>
                  <button className="btn ghost" onClick={() => setResult(null)}>เก็บเข้าสมุด</button>
                  <button className="btn gold" onClick={() => { setResult(null); setTimeout(pull, 260); }}>เขย่าอีก</button>
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
          <div className="soft small">สะสมแล้ว {have} จาก {TOTAL} ใบ · แตะใบที่มีเพื่ออ่านซ้ำ</div>
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
                        {own ? <span style={{ padding: 3, textAlign: "center", lineHeight: 1.2 }}>{f.title.slice(0, 12)}</span> : <span style={{ fontSize: 10 }}>{T.en}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="row" style={{ marginTop: 18 }}><IBook width={16} height={16} /><span className="tiny muted">ดาวบนช่องที่ยังไม่มี = ระดับของใบนั้น</span></div>
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
      <div className={`fcard fc-${f.tier}`} style={{ ["--tc" as string]: tc, ["--tg" as string]: T.glow, ["--holo" as string]: rank >= 3 ? (rank >= 5 ? 1 : 0.7) : 0 }}>
        <div className="face back" />
        <div className="face front">
          {fresh && <span className="newb">ใหม่!</span>}
          <div className="tier"><b>{T.name.toUpperCase()}</b><span className="stars">{T.en}</span></div>
          <div className="fbody">
            <TierSymbol tier={f.tier} color={T.color} />
            <div className="row" style={{ justifyContent: "center" }}><span className="chip">{cat.emoji} {cat.name}</span></div>
            <div className="ftitle">{f.title}</div>
            <div className="ftext">{f.text}</div>
          </div>
          <div className="foot"><span>เซียมซีมังกร BM33</span><span>ใบที่ {f.id + 1}</span></div>
        </div>
      </div>
    </div>
  );
}
