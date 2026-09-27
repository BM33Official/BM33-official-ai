"use client";
// วงล้อมังกรทองแบบจีน — วาดลายนิ่งครั้งเดียวลง offscreen canvas (4 ชั้นหมุนอิสระ) แล้วแค่หมุน/ซ้อนภาพทุกเฟรม
//   ชั้น 1 ขอบนอก: ขอบทอง + วงแหวนแล็กเกอร์แดง 12 นักษัตร (子丑寅…)
//   ชั้น 2 มังกรคู่ไล่ไข่มุกไฟ + เมฆมงคล บนพื้นน้ำเงินเข้ม
//   ชั้น 3 ปากั้ว 8 ทิศ บนลายฉลุหน้าต่างจีน
//   ชั้น 4 เหรียญทองกลาง "BM33" (Cinzel) — เรืองแสงเป็นสีระดับที่ได้

const TAU = Math.PI * 2;
const ZODIAC = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const TRIGRAMS = [[1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1], [1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0]]; // 1 = เส้นเต็ม

export interface WheelLayers { size: number; outer: HTMLCanvasElement; dragons: HTMLCanvasElement; bagua: HTMLCanvasElement; coin: HTMLCanvasElement }

function mk(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d")!;
  x.translate(size / 2, size / 2);
  return [c, x];
}

function gold(x: CanvasRenderingContext2D, r0: number, r1: number, angle = -0.8): CanvasGradient {
  const g = x.createLinearGradient(Math.cos(angle) * r1, Math.sin(angle) * r1, -Math.cos(angle) * r1, -Math.sin(angle) * r1);
  g.addColorStop(0, "#fff6cf"); g.addColorStop(0.18, "#f7d77a"); g.addColorStop(0.4, "#c8901f");
  g.addColorStop(0.55, "#ffe8a3"); g.addColorStop(0.75, "#a86d0d"); g.addColorStop(1, "#f3c95a");
  void r0;
  return g;
}

function ring(x: CanvasRenderingContext2D, r0: number, r1: number, fill: string | CanvasGradient) {
  x.beginPath(); x.arc(0, 0, r1, 0, TAU); x.arc(0, 0, r0, 0, TAU, true); x.fillStyle = fill; x.fill();
}

// ── ชั้น 1: ขอบทอง + นักษัตร ─────────────────────────────────────────────────
function drawOuter(S: number): HTMLCanvasElement {
  const [c, x] = mk(S);
  const R = S / 2;
  // ขอบทองหนา + ร่องลึก
  ring(x, R * 0.93, R * 0.995, gold(x, R * 0.93, R));
  x.strokeStyle = "rgba(90,55,0,.7)"; x.lineWidth = R * 0.006;
  for (const rr of [0.995, 0.965, 0.93]) { x.beginPath(); x.arc(0, 0, R * rr, 0, TAU); x.stroke(); }
  // ลายคลื่นบนขอบทอง
  x.strokeStyle = "rgba(120,72,0,.55)"; x.lineWidth = R * 0.004;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU;
    x.beginPath(); x.arc(Math.cos(a) * R * 0.947, Math.sin(a) * R * 0.947, R * 0.012, a + Math.PI * 0.2, a + Math.PI * 1.2); x.stroke();
  }
  // วงแหวนแล็กเกอร์แดง
  const lac = x.createRadialGradient(0, 0, R * 0.76, 0, 0, R * 0.93);
  lac.addColorStop(0, "#5a0710"); lac.addColorStop(0.5, "#9b1020"); lac.addColorStop(1, "#4a050c");
  ring(x, R * 0.775, R * 0.93, lac);
  // ลายก้นหอยจาง ๆ บนแล็กเกอร์
  x.strokeStyle = "rgba(255,200,120,.08)"; x.lineWidth = R * 0.004;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU + 0.065;
    x.beginPath(); x.arc(Math.cos(a) * R * 0.853, Math.sin(a) * R * 0.853, R * 0.03, 0, TAU * 0.75); x.stroke();
  }
  // ช่อง 12 นักษัตร
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU - Math.PI / 2;
    // เส้นแบ่งทอง
    const b = a + TAU / 24;
    x.strokeStyle = gold(x, R * 0.77, R * 0.93, b); x.lineWidth = R * 0.008;
    x.beginPath(); x.moveTo(Math.cos(b) * R * 0.78, Math.sin(b) * R * 0.78); x.lineTo(Math.cos(b) * R * 0.925, Math.sin(b) * R * 0.925); x.stroke();
    // วงรองตัวอักษร
    const cx = Math.cos(a) * R * 0.853, cy = Math.sin(a) * R * 0.853;
    x.save(); x.translate(cx, cy); x.rotate(a + Math.PI / 2);
    x.beginPath(); x.arc(0, 0, R * 0.058, 0, TAU);
    const disc = x.createRadialGradient(-R * 0.02, -R * 0.02, 0, 0, 0, R * 0.058);
    disc.addColorStop(0, "#7a0c16"); disc.addColorStop(1, "#3a0308");
    x.fillStyle = disc; x.fill();
    x.lineWidth = R * 0.006; x.strokeStyle = gold(x, 0, R * 0.06); x.stroke();
    x.fillStyle = gold(x, 0, R * 0.05);
    x.font = `700 ${Math.round(R * 0.075)}px "Noto Serif TC","Songti SC","PingFang TC","Hiragino Mincho ProN",serif`;
    x.textAlign = "center"; x.textBaseline = "middle";
    x.shadowColor = "rgba(0,0,0,.5)"; x.shadowBlur = R * 0.01;
    x.fillText(ZODIAC[i], 0, R * 0.004);
    x.restore();
  }
  // เส้นทองคั่น (ลายเชือก)
  ring(x, R * 0.748, R * 0.775, gold(x, R * 0.748, R * 0.775, 0.6));
  x.strokeStyle = "rgba(100,60,0,.6)"; x.lineWidth = R * 0.003;
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * TAU;
    x.beginPath();
    x.moveTo(Math.cos(a) * R * 0.75, Math.sin(a) * R * 0.75);
    x.lineTo(Math.cos(a + 0.03) * R * 0.773, Math.sin(a + 0.03) * R * 0.773);
    x.stroke();
  }
  return c;
}

// ── ชั้น 2: มังกรคู่ ───────────────────────────────────────────────────────────
function cloud(x: CanvasRenderingContext2D, px: number, py: number, s: number, rot: number) {
  x.save(); x.translate(px, py); x.rotate(rot);
  x.strokeStyle = "rgba(255,221,140,.55)"; x.lineWidth = s * 0.09; x.lineCap = "round";
  const curl = (cx: number, cy: number, r: number, dir: number) => {
    x.beginPath();
    for (let t = 0; t <= 1.6 * Math.PI; t += 0.2) {
      const rr = r * (1 - t / (2.2 * Math.PI));
      const X = cx + Math.cos(t * dir) * rr, Y = cy + Math.sin(t * dir) * rr;
      if (t === 0) x.moveTo(X, Y); else x.lineTo(X, Y);
    }
    x.stroke();
  };
  curl(-s * 0.45, 0, s * 0.32, 1); curl(s * 0.45, 0, s * 0.32, -1); curl(0, -s * 0.22, s * 0.38, 1);
  x.beginPath(); x.moveTo(-s * 0.9, s * 0.25); x.quadraticCurveTo(0, s * 0.55, s * 0.9, s * 0.25); x.stroke();
  x.restore();
}

function dragon(x: CanvasRenderingContext2D, R: number, start: number, span: number) {
  const mid = R * 0.652, amp = R * 0.045;
  const N = 150;
  const pt = (t: number) => {
    const a = start + span * t;
    const r = mid + Math.sin(t * Math.PI * 3.2) * amp * (0.4 + 0.6 * t);
    return { X: Math.cos(a) * r, Y: Math.sin(a) * r, a };
  };
  // ลำตัว (เกล็ดซ้อน: หาง -> หัว)
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const { X, Y } = pt(t);
    const w = R * (0.014 + 0.042 * Math.pow(Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5), 0.8));
    const g = x.createRadialGradient(X - w * 0.35, Y - w * 0.45, w * 0.1, X, Y, w);
    g.addColorStop(0, "#fff3c2"); g.addColorStop(0.45, "#e7b440"); g.addColorStop(1, "#7a4a05");
    x.fillStyle = g;
    x.beginPath(); x.arc(X, Y, w, 0, TAU); x.fill();
    if (i % 3 === 0) { x.strokeStyle = "rgba(110,62,0,.55)"; x.lineWidth = R * 0.0028; x.beginPath(); x.arc(X, Y, w * 0.72, -0.5, 1.9); x.stroke(); }
  }
  // ครีบหลัง
  x.fillStyle = "#c2410c";
  for (let i = 12; i < N - 14; i += 6) {
    const t = i / N, p = pt(t), q = pt(t + 0.01);
    const nx = -(q.Y - p.Y), ny = q.X - p.X, l = Math.hypot(nx, ny) || 1;
    const w = R * (0.012 + 0.034 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5));
    x.beginPath();
    x.moveTo(p.X + (nx / l) * w * 0.8, p.Y + (ny / l) * w * 0.8);
    x.lineTo(p.X + (nx / l) * w * 1.7 - (q.X - p.X) * 1.5, p.Y + (ny / l) * w * 1.7 - (q.Y - p.Y) * 1.5);
    x.lineTo(p.X + (nx / l) * w * 0.8 - (q.X - p.X) * 3, p.Y + (ny / l) * w * 0.8 - (q.Y - p.Y) * 3);
    x.fill();
  }
  // ขา + กรงเล็บ
  for (const t of [0.35, 0.62, 0.85]) {
    const p = pt(t), q = pt(t + 0.01);
    const nx = (q.Y - p.Y), ny = -(q.X - p.X), l = Math.hypot(nx, ny) || 1;
    const L = R * 0.06;
    const ex = p.X + (nx / l) * L, ey = p.Y + (ny / l) * L;
    x.strokeStyle = "#d9a133"; x.lineWidth = R * 0.012; x.lineCap = "round";
    x.beginPath(); x.moveTo(p.X, p.Y); x.quadraticCurveTo(p.X + (nx / l) * L * 0.4 + (q.X - p.X) * 4, p.Y + (ny / l) * L * 0.4 + (q.Y - p.Y) * 4, ex, ey); x.stroke();
    x.lineWidth = R * 0.005; x.strokeStyle = "#fff0b8";
    for (let k = -1; k <= 1; k++) {
      const ang = Math.atan2(ey - p.Y, ex - p.X) + k * 0.55;
      x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex + Math.cos(ang) * R * 0.022, ey + Math.sin(ang) * R * 0.022); x.stroke();
    }
  }
  // หางเปลว
  { const p = pt(0), q = pt(0.02);
    const dx = p.X - q.X, dy = p.Y - q.Y, l = Math.hypot(dx, dy) || 1;
    x.fillStyle = "rgba(255,120,40,.85)";
    for (let k = -1; k <= 1; k++) {
      x.beginPath(); x.moveTo(p.X, p.Y);
      x.quadraticCurveTo(p.X + (dx / l) * R * 0.05 + k * (dy / l) * R * 0.03, p.Y + (dy / l) * R * 0.05 - k * (dx / l) * R * 0.03, p.X + (dx / l) * R * 0.08 + k * (dy / l) * R * 0.045, p.Y + (dy / l) * R * 0.08 - k * (dx / l) * R * 0.045);
      x.quadraticCurveTo(p.X + (dx / l) * R * 0.03, p.Y + (dy / l) * R * 0.03, p.X, p.Y); x.fill();
    }
  }
  // หัว
  const h = pt(1), hb = pt(0.97);
  const ang = Math.atan2(h.Y - hb.Y, h.X - hb.X);
  x.save(); x.translate(h.X, h.Y); x.rotate(ang);
  const s = R * 0.082;
  // แผงคอ (เปลวไฟ)
  x.fillStyle = "#ea580c";
  for (let k = 0; k < 5; k++) {
    x.beginPath(); x.moveTo(-s * 0.4, 0);
    x.quadraticCurveTo(-s * 1.1, (k - 2) * s * 0.35, -s * (1.3 + (k % 2) * 0.3), (k - 2) * s * 0.55);
    x.quadraticCurveTo(-s * 0.8, (k - 2) * s * 0.2, -s * 0.2, 0); x.fill();
  }
  // หัว
  const hg = x.createLinearGradient(-s, -s, s, s);
  hg.addColorStop(0, "#fff3c2"); hg.addColorStop(0.5, "#e2a936"); hg.addColorStop(1, "#8a5608");
  x.fillStyle = hg;
  x.beginPath();
  x.moveTo(-s * 0.5, -s * 0.55); x.quadraticCurveTo(s * 0.4, -s * 0.75, s * 1.05, -s * 0.2);
  x.lineTo(s * 1.2, s * 0.02); x.lineTo(s * 0.55, s * 0.12); // ขากรรไกรบน
  x.lineTo(s * 1.0, s * 0.42); x.quadraticCurveTo(s * 0.2, s * 0.62, -s * 0.5, s * 0.45); x.closePath(); x.fill();
  x.strokeStyle = "rgba(90,50,0,.7)"; x.lineWidth = R * 0.003; x.stroke();
  // ปากแดง + ฟัน
  x.fillStyle = "#7f1d1d"; x.beginPath(); x.moveTo(s * 0.55, s * 0.12); x.lineTo(s * 1.15, s * 0.05); x.lineTo(s * 0.95, s * 0.36); x.closePath(); x.fill();
  x.fillStyle = "#fff"; for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(s * (0.7 + k * 0.14), s * 0.09); x.lineTo(s * (0.76 + k * 0.14), s * 0.2); x.lineTo(s * (0.82 + k * 0.14), s * 0.07); x.fill(); }
  // ตา
  x.fillStyle = "#fff"; x.beginPath(); x.ellipse(s * 0.35, -s * 0.28, s * 0.14, s * 0.1, -0.2, 0, TAU); x.fill();
  x.fillStyle = "#b91c1c"; x.beginPath(); x.arc(s * 0.38, -s * 0.28, s * 0.06, 0, TAU); x.fill();
  // เขา
  x.strokeStyle = "#fde68a"; x.lineWidth = R * 0.008; x.lineCap = "round";
  x.beginPath(); x.moveTo(s * 0.1, -s * 0.55); x.bezierCurveTo(-s * 0.3, -s * 1.1, -s * 0.9, -s * 1.0, -s * 1.3, -s * 1.25); x.stroke();
  x.beginPath(); x.moveTo(-s * 0.1, -s * 0.5); x.bezierCurveTo(-s * 0.5, -s * 0.85, -s * 0.9, -s * 0.7, -s * 1.15, -s * 0.9); x.stroke();
  // หนวดยาว
  x.strokeStyle = "rgba(255,236,170,.9)"; x.lineWidth = R * 0.004;
  x.beginPath(); x.moveTo(s * 0.95, -s * 0.12); x.bezierCurveTo(s * 1.6, -s * 0.7, s * 2.1, s * 0.2, s * 2.6, -s * 0.5); x.stroke();
  x.beginPath(); x.moveTo(s * 0.9, s * 0.35); x.bezierCurveTo(s * 1.5, s * 1.0, s * 2.0, s * 0.3, s * 2.4, s * 0.95); x.stroke();
  x.restore();
  // ไข่มุกไฟข้างหน้า
  const pa = start + span + 0.2;
  const px = Math.cos(pa) * mid, py = Math.sin(pa) * mid;
  for (let k = 0; k < 6; k++) {
    const fa = pa + Math.PI / 2 + (k - 2.5) * 0.35;
    x.fillStyle = `rgba(255,${130 + k * 15},40,.75)`;
    x.beginPath(); x.moveTo(px, py);
    x.quadraticCurveTo(px + Math.cos(fa) * R * 0.05, py + Math.sin(fa) * R * 0.05, px + Math.cos(fa + 0.3) * R * 0.075, py + Math.sin(fa + 0.3) * R * 0.075);
    x.quadraticCurveTo(px + Math.cos(fa + 0.2) * R * 0.03, py + Math.sin(fa + 0.2) * R * 0.03, px, py); x.fill();
  }
  const pg = x.createRadialGradient(px - R * 0.01, py - R * 0.012, 0, px, py, R * 0.034);
  pg.addColorStop(0, "#ffffff"); pg.addColorStop(0.5, "#fef3c7"); pg.addColorStop(1, "#f59e0b");
  x.fillStyle = pg; x.beginPath(); x.arc(px, py, R * 0.034, 0, TAU); x.fill();
}

function drawDragons(S: number): HTMLCanvasElement {
  const [c, x] = mk(S);
  const R = S / 2;
  const bg = x.createRadialGradient(0, 0, R * 0.55, 0, 0, R * 0.748);
  bg.addColorStop(0, "#07143f"); bg.addColorStop(0.6, "#0c1f5c"); bg.addColorStop(1, "#050c2a");
  ring(x, R * 0.555, R * 0.748, bg);
  // ดาวจาง ๆ
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * TAU, r = R * (0.57 + Math.random() * 0.16);
    x.fillStyle = `rgba(200,220,255,${0.15 + Math.random() * 0.35})`;
    x.beginPath(); x.arc(Math.cos(a) * r, Math.sin(a) * r, R * (0.002 + Math.random() * 0.003), 0, TAU); x.fill();
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5;
    cloud(x, Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66, R * 0.05, a + Math.PI / 2);
  }
  dragon(x, R, -Math.PI * 0.95, Math.PI * 0.72);
  dragon(x, R, Math.PI * 0.05, Math.PI * 0.72);
  ring(x, R * 0.54, R * 0.558, gold(x, R * 0.54, R * 0.56, 1.2));
  return c;
}

// ── ชั้น 3: ปากั้ว ───────────────────────────────────────────────────────────
function drawBagua(S: number): HTMLCanvasElement {
  const [c, x] = mk(S);
  const R = S / 2;
  const bg = x.createRadialGradient(0, 0, R * 0.34, 0, 0, R * 0.54);
  bg.addColorStop(0, "#3b0a0e"); bg.addColorStop(1, "#6d0f18");
  ring(x, R * 0.36, R * 0.54, bg);
  // ลายฉลุหน้าต่าง
  x.save();
  x.beginPath(); x.arc(0, 0, R * 0.535, 0, TAU); x.arc(0, 0, R * 0.365, 0, TAU, true); x.clip();
  x.strokeStyle = "rgba(255,200,110,.13)"; x.lineWidth = R * 0.004;
  const g = R * 0.045;
  for (let yy = -R; yy < R; yy += g) for (let xx = -R; xx < R; xx += g) {
    x.strokeRect(xx + g * 0.2, yy + g * 0.2, g * 0.6, g * 0.6);
  }
  x.restore();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    x.save(); x.rotate(a + Math.PI / 2);
    // แผ่นรอง
    x.beginPath(); x.moveTo(-R * 0.075, -R * 0.515); x.lineTo(R * 0.075, -R * 0.515); x.lineTo(R * 0.055, -R * 0.39); x.lineTo(-R * 0.055, -R * 0.39); x.closePath();
    x.fillStyle = "rgba(20,4,6,.55)"; x.fill();
    x.lineWidth = R * 0.004; x.strokeStyle = "rgba(252,211,77,.55)"; x.stroke();
    // เส้นไตรแกรม
    TRIGRAMS[i].forEach((full, k) => {
      const yy = -R * (0.49 - k * 0.035), hw = R * (0.05 - k * 0.004), th = R * 0.017;
      x.fillStyle = gold(x, 0, R * 0.06);
      if (full) x.fillRect(-hw, yy, hw * 2, th);
      else { x.fillRect(-hw, yy, hw * 0.8, th); x.fillRect(hw * 0.2, yy, hw * 0.8, th); }
    });
    x.restore();
  }
  ring(x, R * 0.345, R * 0.365, gold(x, R * 0.34, R * 0.37, -0.3));
  return c;
}

// ── ชั้น 4: เหรียญทองกลาง ────────────────────────────────────────────────────
function drawCoin(S: number): HTMLCanvasElement {
  const [c, x] = mk(S);
  const R = S / 2;
  const cg = x.createRadialGradient(-R * 0.1, -R * 0.12, R * 0.02, 0, 0, R * 0.345);
  cg.addColorStop(0, "#fff7d6"); cg.addColorStop(0.35, "#f2c14e"); cg.addColorStop(0.75, "#b7790e"); cg.addColorStop(1, "#6b4304");
  x.fillStyle = cg; x.beginPath(); x.arc(0, 0, R * 0.345, 0, TAU); x.fill();
  // ขอบเหรียญนูน
  x.lineWidth = R * 0.012; x.strokeStyle = "rgba(255,244,200,.85)"; x.beginPath(); x.arc(0, 0, R * 0.325, 0, TAU); x.stroke();
  x.lineWidth = R * 0.004; x.strokeStyle = "rgba(100,60,0,.6)"; x.beginPath(); x.arc(0, 0, R * 0.305, 0, TAU); x.stroke();
  // ลายฟันเฟือง
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    x.beginPath(); x.moveTo(Math.cos(a) * R * 0.31, Math.sin(a) * R * 0.31); x.lineTo(Math.cos(a) * R * 0.32, Math.sin(a) * R * 0.32); x.stroke();
  }
  // กรอบสี่เหลี่ยมแบบเหรียญจีน
  x.save(); x.rotate(Math.PI / 4);
  x.strokeStyle = "rgba(110,66,0,.55)"; x.lineWidth = R * 0.006;
  x.strokeRect(-R * 0.17, -R * 0.17, R * 0.34, R * 0.34);
  x.restore();
  x.fillStyle = "#5a3703";
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = `800 ${Math.round(R * 0.15)}px Cinzel, "Trajan Pro", "Times New Roman", serif`;
  x.shadowColor = "rgba(255,245,200,.9)"; x.shadowOffsetY = R * 0.004; x.shadowBlur = 0;
  x.fillText("BM33", 0, R * 0.005);
  x.shadowColor = "transparent";
  x.font = `600 ${Math.round(R * 0.038)}px Cinzel, "Times New Roman", serif`;
  x.fillStyle = "rgba(90,55,3,.85)";
  const arc = (txt: string, rr: number, top: boolean) => {
    const n = txt.length, span = Math.PI * 0.62;
    for (let i = 0; i < n; i++) {
      const a = -span / 2 + (i / (n - 1)) * span;
      x.save(); x.rotate(top ? a : -a); x.fillText(txt[i], 0, top ? -rr : rr); x.restore();
    }
  };
  arc("VAJIRA MEDICINE", R * 0.245, true);
  arc("· CLASS OF 33 ·", R * 0.265, false);
  return c;
}

let cache: WheelLayers | null = null;
export function wheelLayers(size = 1024): WheelLayers {
  if (cache && cache.size >= size) return cache;
  cache = { size, outer: drawOuter(size), dragons: drawDragons(size), bagua: drawBagua(size), coin: drawCoin(size) };
  return cache;
}
export function resetWheelLayers() { cache = null; }

export interface WheelPose { outer: number; dragons: number; bagua: number; glow: string; glowAmt: number; lights: number; blur?: number }

// วาดวงล้อทั้งวงที่ (cx, cy) รัศมี r — blur > 0 = เบลอการเคลื่อนไหว (ภาพซ้อนตามทิศหมุน)
export function drawWheel(ctx: CanvasRenderingContext2D, L: WheelLayers, cx: number, cy: number, r: number, p: WheelPose, t: number) {
  const d = r * 2;
  // รัศมีเรือง
  const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.25);
  halo.addColorStop(0, hexA(p.glow, 0.25 + p.glowAmt * 0.35)); halo.addColorStop(1, hexA(p.glow, 0));
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, r * 1.25, 0, TAU); ctx.fill();
  const layer = (img: HTMLCanvasElement, a: number, alpha = 1) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(cx, cy); ctx.rotate(a); ctx.drawImage(img, -r, -r, d, d); ctx.restore();
  };
  const blur = Math.min(0.35, p.blur ?? 0);
  const ghosts = blur > 0.02 ? 3 : 0;
  for (let g = ghosts; g >= 1; g--) layer(L.outer, p.outer - blur * g * 0.5, 0.18);
  layer(L.outer, p.outer);
  for (let g = ghosts; g >= 1; g--) layer(L.dragons, p.dragons + blur * g * 0.5, 0.2);
  layer(L.dragons, p.dragons);
  layer(L.bagua, p.bagua);
  // ไฟวิ่งรอบขอบ
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU + p.outer;
    const on = (Math.floor(p.lights) + i) % 3 === 0;
    const lx = cx + Math.cos(a) * r * 0.965, ly = cy + Math.sin(a) * r * 0.965;
    ctx.fillStyle = on ? "#fffbe6" : "rgba(255,230,160,.35)";
    ctx.beginPath(); ctx.arc(lx, ly, r * (on ? 0.016 : 0.011), 0, TAU); ctx.fill();
    if (on) { ctx.fillStyle = hexA(p.glow, 0.35); ctx.beginPath(); ctx.arc(lx, ly, r * 0.04, 0, TAU); ctx.fill(); }
  }
  // เหรียญกลาง + เรืองแสงสีระดับ
  const cg = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 0.5);
  cg.addColorStop(0, hexA(p.glow, 0.0)); cg.addColorStop(0.7, hexA(p.glow, 0.25 + p.glowAmt * 0.6)); cg.addColorStop(1, hexA(p.glow, 0));
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, TAU); ctx.fill();
  layer(L.coin, Math.sin(t / 1400) * 0.04);
  // ประกายวิ่งบนเหรียญ
  const sx = cx + Math.cos(t / 900) * r * 0.2, sy = cy + Math.sin(t / 900) * r * 0.2;
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.12);
  sg.addColorStop(0, "rgba(255,255,255,.35)"); sg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, cy, r * 0.33, 0, TAU); ctx.fill();
}

// เข็มชี้ทองประดับ (ด้านบน)
export function drawPointer(ctx: CanvasRenderingContext2D, cx: number, top: number, s: number, glow: string) {
  ctx.save(); ctx.translate(cx, top);
  ctx.shadowColor = glow; ctx.shadowBlur = s * 0.6;
  const g = ctx.createLinearGradient(0, 0, 0, s * 1.4);
  g.addColorStop(0, "#fff6cf"); g.addColorStop(0.5, "#e2a936"); g.addColorStop(1, "#7a4a05");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, s * 1.45);
  ctx.bezierCurveTo(-s * 0.2, s * 1.0, -s * 0.65, s * 0.55, -s * 0.5, s * 0.2);
  ctx.bezierCurveTo(-s * 0.35, -s * 0.15, s * 0.35, -s * 0.15, s * 0.5, s * 0.2);
  ctx.bezierCurveTo(s * 0.65, s * 0.55, s * 0.2, s * 1.0, 0, s * 1.45);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#b91c1c"; ctx.beginPath(); ctx.arc(0, s * 0.35, s * 0.17, 0, TAU); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.arc(-s * 0.05, s * 0.3, s * 0.06, 0, TAU); ctx.fill();
  ctx.restore();
}

export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}
