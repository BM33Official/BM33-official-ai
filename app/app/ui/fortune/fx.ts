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
  // ── เสียงคัตซีน ──
  noise(len: number): AudioBufferSourceNode | null {
    const a = audio(); if (!a) return null;
    const buf = a.createBuffer(1, Math.max(1, a.sampleRate * len), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf; return src;
  },
  heartbeat(intensity = 1) {
    if (!this.enabled) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    for (const [dt, f, v] of [[0, 62, 0.55], [0.17, 50, 0.4]] as [number, number, number][]) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(f * 1.6, t + dt); o.frequency.exponentialRampToValueAtTime(f, t + dt + 0.09);
      g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(v * intensity, t + dt + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.22);
      o.connect(g).connect(a.destination); o.start(t + dt); o.stop(t + dt + 0.25);
    }
  },
  drum(power = 1) {
    if (!this.enabled) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    g.gain.setValueAtTime(0.7 * power, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.65);
    const n = this.noise(0.25); if (!n) return;
    const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
    const ng = a.createGain(); ng.gain.setValueAtTime(0.35 * power, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    n.connect(f).connect(ng).connect(a.destination); n.start(t);
  },
  riser(dur: number) {
    if (!this.enabled) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), o2 = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
    o.type = "sawtooth"; o2.type = "sawtooth";
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(420, t + dur);
    o2.frequency.setValueAtTime(91.5, t); o2.frequency.exponentialRampToValueAtTime(424, t + dur);
    f.type = "lowpass"; f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(4200, t + dur); f.Q.value = 6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    o.connect(f); o2.connect(f); f.connect(g).connect(a.destination);
    o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  },
  upgrade(step: number) {
    if (!this.enabled) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    const base = 440 * Math.pow(2, (step * 3) / 12);
    for (const [m, v] of [[1, 0.16], [1.5, 0.08], [2, 0.07], [3, 0.03]] as [number, number][]) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = m === 1 ? "triangle" : "sine"; o.frequency.value = base * m;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + 1.2);
    }
    const n = this.noise(0.4); if (!n) return;
    const f = a.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 5000;
    const ng = a.createGain(); ng.gain.setValueAtTime(0.08, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    n.connect(f).connect(ng).connect(a.destination); n.start(t);
  },
  tease() {
    if (!this.enabled) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.35);
    g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.42);
  },
  boom() {
    if (!this.enabled) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    this.drum(1.3);
    const n = this.noise(1.6); if (!n) return;
    const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(200, t + 1.5);
    const g = a.createGain(); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    n.connect(f).connect(g).connect(a.destination); n.start(t);
  },
  fanfare(rank: number) {
    if (!this.enabled) return;
    const a = audio(); if (!a) return;
    const t0 = a.currentTime + 0.05;
    const chords = rank >= 5
      ? [[523.25, 659.25, 783.99], [587.33, 739.99, 880], [659.25, 830.61, 987.77], [783.99, 987.77, 1174.66, 1567.98]]
      : [[523.25, 659.25, 783.99], [659.25, 783.99, 1046.5]];
    chords.forEach((ch, i) => {
      const t = t0 + i * 0.16, len = i === chords.length - 1 ? 1.8 : 0.3;
      for (const f of ch) {
        const o = a.createOscillator(), fl = a.createBiquadFilter(), g = a.createGain();
        o.type = "sawtooth"; o.frequency.value = f;
        fl.type = "lowpass"; fl.frequency.setValueAtTime(1200, t); fl.frequency.exponentialRampToValueAtTime(3800, t + 0.08);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.connect(fl).connect(g).connect(a.destination); o.start(t); o.stop(t + len + 0.05);
      }
    });
  },
  coins(n = 20) {
    if (!this.enabled) return;
    const a = audio(); if (!a) return;
    for (let i = 0; i < n; i++) {
      const t = a.currentTime + Math.random() * 1.4;
      const o = a.createOscillator(), g = a.createGain();
      o.type = "square"; o.frequency.setValueAtTime(1800 + Math.random() * 1800, t); o.frequency.setValueAtTime(2600 + Math.random() * 1600, t + 0.05);
      g.gain.setValueAtTime(0.018, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.18);
    }
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
