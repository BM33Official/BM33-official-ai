"use client";
// เสียง (WebAudio สังเคราะห์ ไม่ต้องโหลดไฟล์) + อนุภาคประกายไฟ/คอนเฟตติ (canvas เต็มจอ)
import { TIER_RANK, TierKey } from "@/lib/fortunes/data";

let ac: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ac) ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    return ac;
  } catch { return null; }
}

export const sound = {
  enabled: true,
  tick(pitch = 1) {
    if (!this.enabled) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(1500 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(700 * pitch, t + 0.035);
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + 0.06);
  },
  whoosh() {
    if (!this.enabled) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    const len = 0.9;
    const buf = a.createBuffer(1, a.sampleRate * len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2600, t + len); f.Q.value = 1.2;
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t);
  },
  chime(tier: TierKey) {
    if (!this.enabled) return;
    const a = audio(); if (!a) return;
    const rank = TIER_RANK[tier];
    const base = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
    const notes = base.slice(0, 2 + rank + (rank >= 4 ? 2 : 0));
    const t0 = a.currentTime + 0.02;
    notes.forEach((f, i) => {
      const t = t0 + i * (rank >= 4 ? 0.075 : 0.1);
      for (const mult of rank >= 5 ? [1, 2, 1.5] : [1, 2]) {
        const o = a.createOscillator(), g = a.createGain();
        o.type = mult === 1 ? "sine" : "triangle";
        o.frequency.value = f * mult;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(mult === 1 ? 0.12 : 0.03, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9 + rank * 0.15);
        o.connect(g).connect(a.destination);
        o.start(t); o.stop(t + 1.2 + rank * 0.2);
      }
    });
  },
};

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: "spark" | "confetti" | "ring"; rot: number; vr: number }

export class Particles {
  private ctx: CanvasRenderingContext2D;
  private ps: P[] = [];
  private raf = 0;
  private dpr = 1;
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
  }
  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = window.innerWidth * this.dpr;
    this.canvas.height = window.innerHeight * this.dpr;
  }
  burst(x: number, y: number, colors: string[], n: number, power = 1, confetti = false) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (2 + Math.random() * 7) * power;
      this.ps.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (confetti ? 4 : 1),
        life: 0, max: 60 + Math.random() * 60, size: confetti ? 5 + Math.random() * 5 : 1.5 + Math.random() * 2.8,
        color: colors[i % colors.length], kind: confetti && i % 2 ? "confetti" : "spark", rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      });
    }
    this.run();
  }
  ring(x: number, y: number, color: string) {
    this.ps.push({ x, y, vx: 0, vy: 0, life: 0, max: 42, size: 10, color, kind: "ring", rot: 0, vr: 0 });
    this.run();
  }
  trail(x: number, y: number, color: string) {
    this.ps.push({ x, y, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2 - 0.5, life: 0, max: 26, size: 1.4 + Math.random() * 1.6, color, kind: "spark", rot: 0, vr: 0 });
    this.run();
  }
  private run() {
    if (this.raf) return;
    const step = () => {
      const c = this.ctx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, window.innerWidth, window.innerHeight);
      c.globalCompositeOperation = "lighter";
      this.ps = this.ps.filter((p) => p.life < p.max);
      for (const p of this.ps) {
        p.life++;
        const k = 1 - p.life / p.max;
        if (p.kind === "ring") {
          c.strokeStyle = p.color; c.globalAlpha = k * 0.8; c.lineWidth = 3 * k + 0.5;
          c.beginPath(); c.arc(p.x, p.y, p.size + (1 - k) * 220, 0, Math.PI * 2); c.stroke();
          continue;
        }
        p.x += p.vx; p.y += p.vy;
        p.vy += p.kind === "confetti" ? 0.12 : 0.06;
        p.vx *= 0.985; p.rot += p.vr;
        c.globalAlpha = Math.max(0, k);
        c.fillStyle = p.color;
        if (p.kind === "confetti") {
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); c.restore();
        } else {
          c.beginPath(); c.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, Math.PI * 2); c.fill();
        }
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
      if (this.ps.length) this.raf = requestAnimationFrame(step);
      else { this.raf = 0; c.clearRect(0, 0, window.innerWidth, window.innerHeight); }
    };
    this.raf = requestAnimationFrame(step);
  }
}
