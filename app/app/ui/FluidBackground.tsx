"use client";
// พื้นหลังน้ำไหล (WebGL) — domain-warped noise โทนน้ำเงิน เรนเดอร์ที่ความละเอียดต่ำแล้วขยาย (เบามาก)
// หยุดเมื่อแอปอยู่เบื้องหลัง / ผู้ใช้ตั้งลดการเคลื่อนไหว · ไม่มี WebGL -> ใช้ gradient CSS แทน
import { useEffect, useRef, useState } from "react";

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision mediump float;
uniform vec2 r;
uniform float t;
uniform float e; // energy (0..1) — เพิ่มความเร็ว/ความสว่างตอนสุ่มเซียมซี
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1.0,0.0)), u.x), mix(h(i+vec2(0.0,1.0)), h(i+vec2(1.0,1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a*n(p); p = m*p; a *= 0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / r;
  vec2 p = (gl_FragCoord.xy - 0.5*r) / min(r.x, r.y);
  float tt = t * (0.05 + 0.10*e);
  vec2 q = vec2(fbm(p*1.3 + vec2(0.0, tt)), fbm(p*1.3 + vec2(5.2, 1.3) - tt));
  vec2 w = vec2(fbm(p*1.1 + 3.2*q + vec2(1.7, 9.2) + 0.7*tt), fbm(p*1.1 + 3.2*q + vec2(8.3, 2.8) - 0.45*tt));
  float f = fbm(p*1.05 + 2.6*w);
  float silk = 0.5 + 0.5*sin((p.y*1.6 - p.x*0.6 + w.x*1.4 + f*1.8)*4.2 + tt*5.0);
  vec3 c0 = vec3(0.006, 0.020, 0.085);
  vec3 c1 = vec3(0.020, 0.105, 0.430);
  vec3 c2 = vec3(0.070, 0.330, 0.960);
  vec3 c3 = vec3(0.330, 0.720, 1.000);
  vec3 c4 = vec3(0.780, 0.940, 1.000);
  vec3 col = mix(c0, c1, smoothstep(0.12, 0.62, f));
  col = mix(col, c2, smoothstep(0.42, 0.88, f*0.9 + w.y*0.35));
  col = mix(col, c3, pow(silk, 5.0) * smoothstep(0.30, 0.85, f) * (0.50 + 0.3*e));
  col += c4 * pow(silk, 22.0) * (0.16 + 0.25*e);
  col += vec3(0.12, 0.08, 0.02) * e * smoothstep(0.55, 0.95, f); // แสงทองจาง ๆ ตอนสุ่ม
  col *= 1.0 - 0.42*length(uv - vec2(0.5, 0.35));
  gl_FragColor = vec4(col, 1.0);
}`;

export default function FluidBackground({ energy = 0 }: { energy?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const energyRef = useRef(energy);
  const [on, setOn] = useState(false);
  energyRef.current = energy;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power", preserveDrawingBuffer: false });
    if (!gl) return;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, "r");
    const uT = gl.getUniformLocation(prog, "t");
    const uE = gl.getUniformLocation(prog, "e");

    // ความละเอียดต่ำ (พื้นหลังเบลออยู่แล้ว) — ประหยัดแบตมาก
    const SCALE = 0.34;
    const resize = () => {
      const w = Math.max(2, Math.round(window.innerWidth * SCALE));
      const h = Math.max(2, Math.round(window.innerHeight * SCALE));
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uR, w, h);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let running = true;
    let e = 0;
    const start = performance.now() - Math.random() * 60_000;
    let last = 0;
    const frame = (now: number) => {
      if (!running) return;
      // 30fps พอ (ภาพไหลช้า) — เว้นแต่กำลังสุ่มเซียมซีให้ลื่นเต็มที่
      const minGap = energyRef.current > 0.05 ? 0 : 1000 / 30;
      if (now - last >= minGap) {
        last = now;
        e += (energyRef.current - e) * 0.06;
        gl.uniform1f(uT, (now - start) / 1000);
        gl.uniform1f(uE, e);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      raf = requestAnimationFrame(frame);
    };
    if (reduce) {
      gl.uniform1f(uT, 42);
      gl.uniform1f(uE, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      raf = requestAnimationFrame(frame);
    }
    setOn(true);
    const vis = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!reduce && !running) { running = true; raf = requestAnimationFrame(frame); }
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  return (
    <div className="bm-bg" aria-hidden>
      <canvas ref={ref} className={on ? "on" : ""} />
    </div>
  );
}
