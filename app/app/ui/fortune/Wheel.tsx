"use client";
// วงล้อมังกรบนหน้าเซียมซี (หมุนช้า ๆ ตอนรอ) — ตอนเขย่าจริงจะเปลี่ยนเป็นคัตซีนเต็มจอ (Cutscene.tsx)
import { useEffect, useRef } from "react";
import { wheelLayers, resetWheelLayers, drawWheel, drawPointer } from "./WheelArt";

export default function Wheel({ paused = false, glow = "#fcd34d", hidden = false }: { paused?: boolean; glow?: string; hidden?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ paused, glow });
  state.current = { paused: paused || hidden, glow };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let W = 0, dpr = 1, raf = 0, sleeper: ReturnType<typeof setTimeout> | undefined;
    let L = wheelLayers(1024);
    // ฟอนต์ Cinzel มาถึงแล้ว -> วาดเหรียญกลางใหม่ให้ตัวอักษรสวย
    document.fonts?.load?.("800 40px Cinzel").then(() => { resetWheelLayers(); L = wheelLayers(1024); }).catch(() => {});
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.getBoundingClientRect().width;
      canvas.width = canvas.height = Math.round(W * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    let rot = 0, last = performance.now();
    const draw = (now: number) => {
      if (state.current.paused || document.hidden) { last = now; sleeper = setTimeout(() => { raf = requestAnimationFrame(draw); }, 300); return; }
      const dt = Math.min(50, now - last); last = now;
      rot += dt * 0.00012;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, W);
      const r = W * 0.43;
      drawWheel(ctx, L, W / 2, W / 2 + W * 0.02, r, { outer: rot, dragons: -rot * 1.6, bagua: rot * 0.8, glow: state.current.glow, glowAmt: 0.35 + Math.sin(now / 900) * 0.15, lights: now / 260 }, now);
      drawPointer(ctx, W / 2, W / 2 + W * 0.02 - r * 1.07, r * 0.13, state.current.glow);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); if (sleeper) clearTimeout(sleeper); ro.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="dragon-wheel" style={{ opacity: hidden ? 0 : 1 }} aria-label="วงล้อเซียมซีมังกร" />;
}
