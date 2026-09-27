"use client";
// คัตซีนเขย่าเซียมซี (ข้ามไม่ได้) — เหมือนเปิดการ์ดในเกม:
//   ① จอมืด วงล้อมังกรพุ่งเข้าหากล้องพร้อมกลองและเสียงไต่ระดับ
//   ② วงล้อหมุนเร็วจนเบลอ เกล็ดทองหมุนวน หัวใจเต้นเร็วขึ้นเรื่อย ๆ
//   ③ "อัปเกรด" สีทีละขั้น Bronze → … → ระดับที่ได้ (แบบสล็อต มีหลอกเกือบได้)
//   ④ ระเบิดแสง ลำแสงหมุน ชื่อระดับกระแทกจอ เหรียญ/เกล็ดทองโปรย
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { TIERS, TIER_RANK, TierKey } from "@/lib/fortunes/data";
import { wheelLayers, drawWheel, drawPointer, hexA } from "./WheelArt";
import { sound } from "./fx";
import { Layer } from "../Chrome";
import { haptic } from "../useApp";

export interface CutsceneHandle { play(tier: TierKey, opts?: { lucky?: boolean }): Promise<void> }

interface Flake { x: number; y: number; vx: number; vy: number; a: number; va: number; r: number; w: number; life: number; max: number; hue: string; orbit: boolean; ang: number; dist: number }

const FLAKE_COLORS = ["#fff6cf", "#fcd34d", "#f59e0b", "#ffe8a3", "#ffffff"];
const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);

const Cutscene = forwardRef<CutsceneHandle>(function Cutscene(_, ref) {
  const [on, setOn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const run = useCallback((tier: TierKey, lucky: boolean) => new Promise<void>((resolve) => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = wheelLayers(1024);
    const rank = TIER_RANK[tier];
    const cx = W / 2, cy = H * 0.44;
    const bigR = Math.min(W * 0.46, H * 0.34);

    // ── ไทม์ไลน์ ──
    const INTRO = 700;
    const SPIN = 2500 + rank * 220;
    const STEP = 560;
    const tease = rank <= 1 && Math.random() < 0.55; // หลอกว่าได้ขั้นถัดไป
    const tension = rank >= 3 ? 650 + (rank - 3) * 350 : 0; // ลุ้นก่อนขั้นสุดท้าย
    const steps = rank; // จำนวนครั้งที่อัปเกรด (Bronze = 0)
    const UPG = steps * STEP + tension + (tease ? 700 : 0);
    const FIN = 1300 + (rank >= 4 ? 700 : 0) + (rank >= 5 ? 1300 : 0);
    const T_SPIN = INTRO, T_UPG = INTRO + SPIN, T_FIN = T_UPG + UPG, T_END = T_FIN + FIN;

    const flakes: Flake[] = [];
    const addOrbit = (n: number) => {
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2, dist = bigR * (0.9 + Math.random() * 0.9);
        flakes.push({ x: 0, y: 0, vx: 0, vy: 0, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, r: 2 + Math.random() * 5, w: 0.3 + Math.random() * 0.7, life: 0, max: 1e9, hue: FLAKE_COLORS[i % 5], orbit: true, ang, dist });
      }
    };
    const burst = (n: number, power: number, colors = FLAKE_COLORS) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = (3 + Math.random() * 11) * power;
        flakes.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.5, r: 2.5 + Math.random() * 6, w: 0.3 + Math.random() * 0.7, life: 0, max: 90 + Math.random() * 90, hue: colors[i % colors.length], orbit: false, ang: 0, dist: 0 });
      }
    };
    const coinRain = (n: number) => {
      for (let i = 0; i < n; i++) flakes.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 1.5, vy: 2 + Math.random() * 4, a: Math.random() * 6, va: 0.15 + Math.random() * 0.2, r: 7 + Math.random() * 7, w: 1, life: 0, max: 400, hue: "coin", orbit: false, ang: 0, dist: 0 });
    };
    addOrbit(70);

    let rot = 0, vel = 0; // วงล้อ (rad/ms)
    let colorIdx = 0, shownIdx = 0; // สีปัจจุบันของระดับ
    let flashA = 0, shake = 0, lastBeat = -1e9, lastTick = 0, label = "", labelT = -1e9, labelColor = "#fff";
    const fired = new Set<string>();
    const once = (k: string, fn: () => void) => { if (!fired.has(k)) { fired.add(k); fn(); } };
    const t0 = performance.now();
    let last = t0;

    sound.drum(1); sound.riser((INTRO + SPIN) / 1000); haptic(30);

    const frame = (now: number) => {
      const t = now - t0;
      const dt = Math.min(40, now - last); last = now;

      // ── ความเร็ววงล้อ ──
      if (t < T_SPIN) vel = 0.0005 + ease(t / INTRO) * 0.03;
      else if (t < T_UPG) { const k = (t - T_SPIN) / SPIN; vel = 0.03 * Math.pow(1 - k, 1.6) + 0.0015; }
      else vel = Math.max(0.0008, vel * 0.96);
      rot += vel * dt;

      // หัวใจเต้น (เร็วขึ้นเรื่อย ๆ)
      const beatGap = t < T_UPG ? 760 - 380 * Math.min(1, t / T_UPG) : 330;
      if (t < T_FIN && t - lastBeat > beatGap) { lastBeat = t; sound.heartbeat(0.6 + Math.min(1, t / T_FIN) * 0.8); if (t > T_SPIN) haptic(8); }
      // ติ๊กตามไฟ
      if (t < T_UPG && now - lastTick > Math.max(40, 12 / (vel + 0.0001) / 30)) { lastTick = now; sound.tick(1 + vel * 8); }

      // ── อัปเกรดสีทีละขั้น ──
      if (t >= T_UPG && t < T_FIN) {
        const u = t - T_UPG;
        let target = 0;
        let acc = 0;
        for (let s = 1; s <= steps; s++) {
          acc += STEP + (s === steps ? tension : 0);
          if (u >= acc - STEP * 0.15) target = s;
        }
        if (tease) {
          const tt = steps * STEP;
          if (u > tt && u < tt + 380) { once("tease", () => { sound.upgrade(steps + 0.5); haptic(15); }); shownIdx = steps + 1; }
          else if (u >= tt + 380) { once("teaseback", () => sound.tease()); shownIdx = colorIdx; }
          else shownIdx = colorIdx;
        }
        if (target > colorIdx) {
          colorIdx = target;
          shownIdx = colorIdx;
          const T = TIERS[colorIdx];
          sound.upgrade(colorIdx); haptic(20 + colorIdx * 10);
          flashA = 0.35 + colorIdx * 0.08; shake = 4 + colorIdx * 3;
          label = T.name.toUpperCase(); labelT = t; labelColor = T.color;
          burst(30 + colorIdx * 20, 0.7 + colorIdx * 0.15, [T.color, "#fff", "#ffe8a3"]);
        } else if (!tease) shownIdx = colorIdx;
        // ช่วงลุ้นก่อนขั้นสุดท้าย: มืดลง หัวใจแรง
        if (tension && colorIdx === steps - 1) once("tension", () => { sound.riser(tension / 1000 + 0.2); });
      }

      // ── ฉากจบ ──
      if (t >= T_FIN) once("fin", () => {
        const T = TIERS[rank];
        flashA = 1; shake = 10 + rank * 5;
        label = rank >= 5 ? "JACKPOT!!" : T.name.toUpperCase(); labelT = t; labelColor = T.color;
        sound.boom(); sound.chime(tier); if (rank >= 3) sound.fanfare(rank); if (rank >= 4) sound.coins(rank >= 5 ? 60 : 25);
        haptic(rank >= 4 ? 200 : 60);
        burst(120 + rank * 60, 1.2 + rank * 0.2, [T.color, "#fff", "#fcd34d", "#fda4af", "#a5f3fc"]);
        for (const f of flakes) if (f.orbit) { f.orbit = false; f.vx = Math.cos(f.ang) * 9; f.vy = Math.sin(f.ang) * 9; f.max = f.life + 120; }
        if (rank >= 4) coinRain(rank >= 5 ? 140 : 60);
      });
      if (rank >= 5 && t >= T_FIN + 900) once("fin2", () => { burst(160, 1.8); sound.coins(40); shake = 14; flashA = 0.6; });

      // ── วาด ──
      const color = TIERS[Math.min(5, shownIdx)].color;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
      shake *= 0.9;
      ctx.translate(sx, sy);
      // พื้นหลังมืด + ไล่สีระดับ
      const intro = ease(t / INTRO);
      const dark = 0.9 * intro + (tension && t > T_UPG + (steps - 1) * STEP ? 0.05 : 0);
      ctx.fillStyle = `rgba(1,4,18,${dark})`; ctx.fillRect(-20, -20, W + 40, H + 40);
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.8);
      bg.addColorStop(0, hexA(color, 0.28 * intro)); bg.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = bg; ctx.fillRect(-20, -20, W + 40, H + 40);

      // ลำแสงหมุน (หลังอัปเกรด/ฉากจบ)
      const rays = t >= T_UPG ? Math.min(1, (t - T_UPG) / 500) * (t >= T_FIN ? 1 : 0.45) : 0;
      if (rays > 0) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t / 2600);
        const n = 14;
        for (let i = 0; i < n; i++) {
          ctx.rotate((Math.PI * 2) / n);
          const g = ctx.createLinearGradient(0, 0, 0, -Math.max(W, H));
          g.addColorStop(0, hexA(color, 0.5 * rays)); g.addColorStop(1, hexA(color, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -Math.max(W, H)); ctx.lineTo(40, -Math.max(W, H)); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }

      // วงล้อซูมเข้า
      const zoom = 0.45 + 0.55 * intro + (t >= T_FIN ? Math.min(0.25, (t - T_FIN) / 2400) : 0);
      const r = bigR * zoom;
      const wheelAlpha = t >= T_FIN ? Math.max(0, 1 - (t - T_FIN) / 700) : 1;
      if (wheelAlpha > 0) {
        ctx.save(); ctx.globalAlpha = wheelAlpha;
        drawWheel(ctx, L, cx, cy, r, { outer: rot, dragons: -rot * 0.72, bagua: rot * 1.3, glow: color, glowAmt: t >= T_UPG ? 0.9 : 0.4, lights: t / 70, blur: vel * 9 }, now);
        drawPointer(ctx, cx, cy - r * 1.07, r * 0.13, color);
        ctx.restore();
      }

      // เกล็ดทอง
      for (const f of flakes) {
        f.life++;
        if (f.orbit) {
          f.ang += vel * 1.4 + 0.004;
          f.dist += (bigR * 0.95 - f.dist) * 0.004;
          f.x = cx + Math.cos(f.ang) * f.dist; f.y = cy + Math.sin(f.ang) * f.dist * 0.92;
        } else {
          f.x += f.vx; f.y += f.vy; f.vy += f.hue === "coin" ? 0.12 : 0.18; f.vx *= 0.99;
        }
        f.a += f.va;
        const k = f.orbit ? intro : Math.max(0, 1 - f.life / f.max);
        if (k <= 0) continue;
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a); ctx.globalAlpha = k;
        if (f.hue === "coin") {
          const cw = f.r * Math.abs(Math.cos(f.a * 2));
          const g = ctx.createLinearGradient(-f.r, 0, f.r, 0);
          g.addColorStop(0, "#8a5608"); g.addColorStop(0.5, "#ffe8a3"); g.addColorStop(1, "#b7790e");
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, Math.max(1, cw), f.r, 0, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = f.hue; ctx.fillRect(-f.r / 2, -f.r * f.w / 2, f.r, f.r * f.w);
          if (Math.sin(f.a * 3) > 0.8) { ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(-f.r / 2, -f.r * f.w / 2, f.r, f.r * f.w); }
        }
        ctx.restore();
      }
      for (let i = flakes.length - 1; i >= 0; i--) { const f = flakes[i]; if (!f.orbit && (f.life > f.max || f.y > H + 60)) flakes.splice(i, 1); }

      // ชื่อระดับกระแทกจอ
      if (label) {
        const lt = (t - labelT) / 1000;
        const final = t >= T_FIN;
        const sc = final ? 1 + 0.9 * Math.max(0, 1 - lt * 5) : 1 + 0.6 * Math.max(0, 1 - lt * 6);
        const alpha = final ? Math.min(1, lt * 6) : Math.max(0, 1 - Math.max(0, lt - 0.35) * 3);
        if (alpha > 0) {
          ctx.save(); ctx.translate(cx, final ? cy : cy + r * 0.62); ctx.scale(sc, sc); ctx.globalAlpha = alpha;
          const fs = final ? Math.min(W * 0.16, rank >= 5 ? 76 : 64) : Math.min(W * 0.09, 34);
          ctx.font = `800 ${fs}px Cinzel, "Times New Roman", serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.shadowColor = labelColor; ctx.shadowBlur = final ? 40 : 18;
          const g = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
          if (rank >= 5 && final) { g.addColorStop(0, "#fff6cf"); g.addColorStop(0.5, "#fcd34d"); g.addColorStop(1, "#ff5c8a"); }
          else { g.addColorStop(0, "#ffffff"); g.addColorStop(1, labelColor); }
          ctx.fillStyle = g; ctx.fillText(label, 0, 0);
          if (final) {
            ctx.shadowBlur = 0; ctx.font = `700 ${Math.round(fs * 0.3)}px Cinzel, serif`; ctx.fillStyle = "rgba(255,255,255,.85)";
            ctx.fillText(TIERS[rank].en, 0, fs * 0.8);
          }
          ctx.restore();
        }
      }
      if (lucky && t < T_FIN) {
        ctx.font = `800 13px Cinzel, sans-serif`; ctx.textAlign = "center"; ctx.fillStyle = `rgba(253,224,71,${0.6 + Math.sin(t / 150) * 0.4})`;
        ctx.fillText("⚡ LUCKY HOUR ×2 ⚡", cx, H * 0.1);
      }
      // แฟลชขาว
      if (flashA > 0.01) { ctx.fillStyle = `rgba(255,255,255,${flashA})`; ctx.fillRect(-20, -20, W + 40, H + 40); flashA *= 0.88; }
      ctx.restore();

      if (t < T_END) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  }), []);

  useImperativeHandle(ref, () => ({
    async play(tier, opts) {
      setOn(true);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!canvasRef.current) await new Promise((r) => setTimeout(r, 120));
      try { await document.fonts?.load?.("800 40px Cinzel"); } catch { /* */ }
      await run(tier, !!opts?.lucky);
      wrapRef.current?.classList.add("out");
      setTimeout(() => { setOn(false); wrapRef.current?.classList.remove("out"); }, 350);
    },
  }), [run]);

  return (
    <Layer>
      {/* แตะอะไรก็ไม่ได้ ต้องดูจนจบ */}
      <div ref={wrapRef} className={`cutscene ${on ? "on" : ""}`} onPointerDown={(e) => e.preventDefault()}>
        <canvas ref={canvasRef} />
      </div>
    </Layer>
  );
});

export default Cutscene;
