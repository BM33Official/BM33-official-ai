"use client";
// วงล้อเซียมซีทองคำหลายชั้น (canvas 2D)
//   ชั้นนอก  : วงทอง + หลอดไฟวิ่ง 32 ดวง
//   ชั้นกลาง : 10 หมวดดวง (หมุนทวนเข็ม)  -> หยุดที่หมวดของใบที่ได้
//   ชั้นใน   : 6 อัญมณีระดับความหายาก (หมุนตามเข็ม) -> หยุดทีหลัง (ลุ้นสุด) + near-miss สำหรับระดับสูง
//   แกนกลาง : เหรียญทอง BM33 เรืองแสงเป็นสีของระดับ
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { CATEGORIES, TIERS, TierKey, TIER_RANK } from "@/lib/fortunes/data";

export interface WheelHandle {
  spin(opts: { catIndex: number; tier: TierKey; onTick?: (ring: "cat" | "tier") => void; onCatStop?: () => void }): Promise<void>;
  skip(): void;
}

const TAU = Math.PI * 2;
const N_CAT = CATEGORIES.length;
const N_TIER = TIERS.length;

// โปรไฟล์ความเร็ว: เร่ง -> วิ่งเร็ว -> ค่อย ๆ ช้าลงยาว ๆ (ให้ลุ้น)
function buildProfile(): Float32Array {
  const n = 400;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    let s: number;
    if (x < 0.12) { const u = x / 0.12; s = u * u * (3 - 2 * u); }
    else if (x < 0.3) s = 1;
    else s = Math.pow(1 - (x - 0.3) / 0.7, 2.4);
    v[i] = s;
  }
  const p = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += v[i]; p[i] = acc; }
  for (let i = 0; i < n; i++) p[i] /= acc;
  return p;
}
const PROFILE = buildProfile();
const prog = (x: number) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const f = x * (PROFILE.length - 1);
  const i = Math.floor(f);
  return PROFILE[i] + (PROFILE[Math.min(i + 1, PROFILE.length - 1)] - PROFILE[i]) * (f - i);
};
const backOut = (x: number) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

interface RingMotion { from: number; to: number; t0: number; dur: number; kind: "main" | "nudge" }

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

const Wheel = forwardRef<WheelHandle, { idleSpeed?: number; paused?: boolean }>(function Wheel({ idleSpeed = 1, paused = false }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const st = useRef({
    outer: 0, cat: 0, tier: 0,
    catMotion: [] as RingMotion[], tierMotion: [] as RingMotion[],
    spinning: false, speed: 0, lastCatIdx: -1, lastTierIdx: -1,
    coreColor: "#fcd34d", coreLock: false, glow: 0, flashT: 0,
    onTick: undefined as undefined | ((r: "cat" | "tier") => void),
    resolve: undefined as undefined | (() => void),
    onCatStop: undefined as undefined | (() => void),
    catStopped: true,
    hasSpun: false,
    skipTo: undefined as undefined | (() => void),
  });

  useImperativeHandle(ref, () => ({
    spin({ catIndex, tier, onTick, onCatStop }) {
      const s = st.current;
      const now = performance.now();
      const rank = TIER_RANK[tier];
      s.spinning = true;
      s.hasSpun = true;
      s.coreLock = false;
      s.catStopped = false;
      s.onTick = onTick;
      s.onCatStop = onCatStop;
      // ชั้นกลาง (ทวนเข็ม): ให้ช่อง catIndex อยู่ใต้เข็มด้านบน (มุม -90°)
      const segC = TAU / N_CAT;
      const targetC = -Math.PI / 2 - catIndex * segC;
      const baseC = s.cat - 5 * TAU; // หมุนทวน ~5 รอบ
      let toC = targetC;
      while (toC > baseC) toC -= TAU;
      s.catMotion = [{ from: s.cat, to: toC, t0: now, dur: 4200, kind: "main" }];
      // ชั้นใน (ตามเข็ม): ระดับสูง -> หยุดก่อนเป้าหนึ่งช่อง แล้ว "ดีด" เข้าเป้า (near-miss)
      const segT = TAU / N_TIER;
      const tIdx = TIERS.findIndex((t) => t.key === tier);
      const targetT = -Math.PI / 2 - tIdx * segT;
      const baseT = s.tier + 7 * TAU;
      let toT = targetT;
      while (toT < baseT) toT += TAU;
      const dur = 5400 + (rank >= 3 ? 700 : 0) + (rank >= 4 ? 500 : 0);
      if (rank >= 3) {
        const pre = toT - segT; // ช่องก่อนหน้า (ระดับต่ำกว่า) — หลอกให้ลุ้น
        s.tierMotion = [
          { from: s.tier, to: pre, t0: now, dur, kind: "main" },
          { from: pre, to: toT, t0: now + dur + 420, dur: 620, kind: "nudge" },
        ];
      } else {
        s.tierMotion = [{ from: s.tier, to: toT, t0: now, dur, kind: "main" }];
      }
      const total = (s.tierMotion.at(-1)!.t0 + s.tierMotion.at(-1)!.dur) - now;
      return new Promise<void>((resolve) => {
        s.resolve = () => { resolve(); };
        s.skipTo = () => {
          s.cat = toC; s.tier = toT;
          s.catMotion = []; s.tierMotion = [];
        };
        // กันค้าง
        setTimeout(() => { if (s.spinning) s.skipTo?.(); }, total + 1500);
      });
    },
    skip() {
      st.current.skipTo?.();
    },
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let last = performance.now();
    let sleeper: ReturnType<typeof setTimeout> | undefined;
    const draw = (now: number) => {
      const s = st.current;
      // แท็บอื่นเปิดอยู่ -> ไม่วาด (ประหยัดแบต) ยกเว้นกำลังหมุน
      if ((pausedRef.current || document.hidden) && !s.spinning) {
        last = now;
        sleeper = setTimeout(() => { raf = requestAnimationFrame(draw); }, 300);
        return;
      }
      const dt = Math.min(50, now - last);
      last = now;

      // ── อัปเดตมุม ──
      const stepRing = (motions: RingMotion[], cur: number): { a: number; done: boolean; vel: number } => {
        const m = motions.find((x) => now < x.t0 + x.dur) ?? motions.at(-1);
        if (!m) return { a: cur, done: true, vel: 0 };
        if (now < m.t0) return { a: m.from, done: false, vel: 0 };
        const x = Math.min(1, (now - m.t0) / m.dur);
        const p = m.kind === "nudge" ? backOut(x) : prog(x);
        const a = m.from + (m.to - m.from) * p;
        const done = motions.every((mm) => now >= mm.t0 + mm.dur);
        return { a, done, vel: Math.abs(a - cur) / Math.max(1, dt) };
      };
      let catVel = 0, tierVel = 0;
      if (s.spinning) {
        const c = stepRing(s.catMotion, s.cat);
        catVel = c.vel;
        s.cat = c.a;
        if (c.done && !s.catStopped) { s.catStopped = true; s.onCatStop?.(); }
        const t = stepRing(s.tierMotion, s.tier);
        tierVel = t.vel;
        s.tier = t.a;
        if (c.done && t.done) {
          s.spinning = false;
          s.coreLock = true;
          s.flashT = now;
          const r = s.resolve; s.resolve = undefined; r?.();
        }
      } else {
        // หมุนช้า ๆ ตอนรอ
        s.cat -= 0.00008 * dt * idleSpeed;
        s.tier += 0.00012 * dt * idleSpeed;
      }
      s.speed = s.spinning ? Math.min(1, (catVel + tierVel) * 40) : s.speed * 0.95;
      s.outer += (0.00006 + s.speed * 0.02) * dt;

      // ticks เมื่อช่องเปลี่ยน
      const segC = TAU / N_CAT, segT = TAU / N_TIER;
      const norm = (a: number) => ((a % TAU) + TAU) % TAU;
      const catIdx = Math.round(norm(-Math.PI / 2 - s.cat) / segC) % N_CAT;
      const tierIdx = Math.round(norm(-Math.PI / 2 - s.tier) / segT) % N_TIER;
      if (s.spinning) {
        if (catIdx !== s.lastCatIdx && !s.catStopped) s.onTick?.("cat");
        if (tierIdx !== s.lastTierIdx) s.onTick?.("tier");
      }
      s.lastCatIdx = catIdx;
      s.lastTierIdx = tierIdx;

      // สีแกน: ระหว่างหมุนไล่สีทุกระดับ -> ล็อกสีของระดับที่อยู่ใต้เข็ม
      const tierUnder = TIERS[tierIdx];
      s.coreColor = s.spinning ? TIERS[Math.floor(now / 90) % N_TIER].color : tierUnder.color;
      s.glow += ((s.spinning ? 1 : s.coreLock ? 0.85 : 0.35) - s.glow) * 0.05;

      render(now, catIdx, tierIdx);
      raf = requestAnimationFrame(draw);
    };

    const render = (now: number, catIdx: number, tierIdx: number) => {
      const s = st.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const R = Math.min(W, H) / 2 * 0.94;

      // ── ออร่า + ลำแสงหมุน ──
      const [cr, cg, cb] = hexToRgb(s.coreColor);
      const aura = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.06);
      aura.addColorStop(0, `rgba(${cr},${cg},${cb},${0.18 + 0.25 * s.glow})`);
      aura.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.06, 0, TAU); ctx.fill();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(s.outer * 0.6);
      const rays = 12;
      for (let i = 0; i < rays; i++) {
        ctx.rotate(TAU / rays);
        const g = ctx.createLinearGradient(0, 0, 0, -R * 1.05);
        g.addColorStop(0, `rgba(255,236,170,${0.10 * s.glow})`);
        g.addColorStop(1, "rgba(255,236,170,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-R * 0.09, -R * 1.05); ctx.lineTo(R * 0.09, -R * 1.05); ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // ── ชั้นนอก: วงทอง ──
      const gold = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      gold.addColorStop(0, "#fff1b8"); gold.addColorStop(0.25, "#e8a91c"); gold.addColorStop(0.5, "#fff6d0");
      gold.addColorStop(0.75, "#b77708"); gold.addColorStop(1, "#ffe08a");
      ctx.fillStyle = gold;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.arc(cx, cy, R * 0.83, 0, TAU, true); ctx.fill("evenodd");
      ctx.strokeStyle = "rgba(90,55,0,.55)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.995, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.835, 0, TAU); ctx.stroke();
      // หลอดไฟวิ่ง
      const bulbs = 32;
      const chase = Math.floor((now / (s.spinning ? 55 : 260))) % bulbs;
      for (let i = 0; i < bulbs; i++) {
        const a = s.outer + (i / bulbs) * TAU;
        const bx = cx + Math.cos(a) * R * 0.915, by = cy + Math.sin(a) * R * 0.915;
        const lit = s.spinning ? (i % 4 === chase % 4) : ((i + chase) % 8 === 0);
        const br = R * 0.028;
        if (lit) {
          const hg = ctx.createRadialGradient(bx, by, 0, bx, by, br * 4);
          hg.addColorStop(0, "rgba(255,250,220,.95)"); hg.addColorStop(1, "rgba(255,210,90,0)");
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(bx, by, br * 4, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = lit ? "#fffbe6" : "#8a5a07";
        ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill();
      }

      // ── ชั้นกลาง: หมวดดวง ──
      const segC = TAU / N_CAT;
      for (let i = 0; i < N_CAT; i++) {
        const a0 = s.cat + i * segC - segC / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R * 0.82, a0, a0 + segC);
        ctx.closePath();
        const on = st.current.hasSpun && !st.current.spinning && st.current.catStopped && i === catIdx;
        ctx.fillStyle = on ? "rgba(255,226,140,.95)" : i % 2 ? "#0c2470" : "#12308f";
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(255,214,120,.85)"; ctx.lineWidth = 1.5;
      for (let i = 0; i < N_CAT; i++) {
        const a = s.cat + i * segC - segC / 2;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.58, cy + Math.sin(a) * R * 0.58);
        ctx.lineTo(cx + Math.cos(a) * R * 0.82, cy + Math.sin(a) * R * 0.82); ctx.stroke();
      }
      ctx.font = `${Math.round(R * 0.11)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let i = 0; i < N_CAT; i++) {
        const a = s.cat + i * segC;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * R * 0.705, cy + Math.sin(a) * R * 0.705);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillText(CATEGORIES[i].emoji, 0, 0);
        ctx.restore();
      }
      // ขอบทองระหว่างชั้น
      ctx.strokeStyle = gold; ctx.lineWidth = R * 0.03;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.575, 0, TAU); ctx.stroke();

      // ── ชั้นใน: อัญมณีระดับ ──
      ctx.fillStyle = "#07154a";
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.56, 0, TAU); ctx.fill();
      const segT = TAU / N_TIER;
      for (let i = 0; i < N_TIER; i++) {
        const a = s.tier + i * segT;
        const gx = cx + Math.cos(a) * R * 0.45, gy = cy + Math.sin(a) * R * 0.45;
        const t = TIERS[i];
        const [r, g, b] = hexToRgb(t.color);
        const on = !s.spinning && s.coreLock && i === tierIdx;
        const gr = R * (on ? 0.1 : 0.075);
        const halo = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr * 2.4);
        halo.addColorStop(0, `rgba(${r},${g},${b},${on ? 0.8 : 0.35})`);
        halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(gx, gy, gr * 2.4, 0, TAU); ctx.fill();
        const gem = ctx.createRadialGradient(gx - gr * 0.35, gy - gr * 0.35, gr * 0.1, gx, gy, gr);
        gem.addColorStop(0, "#ffffff"); gem.addColorStop(0.45, t.color); gem.addColorStop(1, `rgba(${Math.round(r * 0.45)},${Math.round(g * 0.45)},${Math.round(b * 0.45)},1)`);
        ctx.fillStyle = gem;
        ctx.beginPath();
        // อัญมณีทรงหกเหลี่ยม
        for (let k = 0; k < 6; k++) {
          const ka = a + k * (TAU / 6);
          const px = gx + Math.cos(ka) * gr, py = gy + Math.sin(ka) * gr;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1; ctx.stroke();
      }

      // ── แกนกลาง: เหรียญทอง ──
      const coreR = R * 0.3;
      const cg2 = ctx.createRadialGradient(cx - coreR * 0.3, cy - coreR * 0.35, coreR * 0.1, cx, cy, coreR);
      cg2.addColorStop(0, "#fffaf0"); cg2.addColorStop(0.5, "#f3c043"); cg2.addColorStop(1, "#8f5c05");
      const pulse = s.coreLock ? 0.5 + 0.5 * Math.sin(now / 260) : 0;
      ctx.shadowColor = s.coreColor; ctx.shadowBlur = 18 + 30 * s.glow + 20 * pulse;
      ctx.fillStyle = cg2;
      ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = s.coreColor; ctx.lineWidth = R * 0.018;
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 0.86, 0, TAU); ctx.stroke();
      ctx.fillStyle = "#5a3703";
      ctx.font = `800 ${Math.round(coreR * 0.46)}px "LINE Seed", -apple-system, sans-serif`;
      ctx.fillText("BM33", cx, cy - coreR * 0.06);
      ctx.font = `700 ${Math.round(coreR * 0.2)}px "LINE Seed", -apple-system, sans-serif`;
      ctx.fillText(s.coreLock ? TIERS[tierIdx].name : "เซียมซี", cx, cy + coreR * 0.38);

      // แฟลชตอนหยุด
      const fl = (now - s.flashT) / 700;
      if (fl >= 0 && fl < 1) {
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.45 * (1 - fl)})`;
        ctx.beginPath(); ctx.arc(cx, cy, R * (0.3 + fl * 0.8), 0, TAU); ctx.fill();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); if (sleeper) clearTimeout(sleeper); ro.disconnect(); };
  }, [idleSpeed]);

  return <canvas ref={canvasRef} />;
});

export default Wheel;
