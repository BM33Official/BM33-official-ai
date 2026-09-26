// สัญลักษณ์ประจำระดับ (ใช้บนการ์ด) — วาดเป็น SVG เอง
import type { TierKey } from "@/lib/fortunes/data";

export function TierSymbol({ tier, color, size = 110 }: { tier: TierKey; color: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 120 120", fill: "none" as const };
  const g = `g${tier}`;
  const defs = (
    <defs>
      <radialGradient id={g} cx="50%" cy="40%" r="60%">
        <stop offset="0" stopColor="#ffffff" stopOpacity=".95" />
        <stop offset=".45" stopColor={color} stopOpacity=".9" />
        <stop offset="1" stopColor={color} stopOpacity=".15" />
      </radialGradient>
    </defs>
  );
  switch (tier) {
    case "a": // ต้นกล้า
      return (
        <svg {...common} className="sym">{defs}
          <circle cx="60" cy="60" r="50" fill={`url(#${g})`} opacity=".25" />
          <path d="M60 96V58" stroke={color} strokeWidth="5" strokeLinecap="round" />
          <path d="M60 64c-18 0-28-10-30-28 18 0 28 10 30 28z" fill={color} opacity=".9" />
          <path d="M60 56c2-18 13-28 32-29-1 19-12 29-32 29z" fill="#fff" opacity=".85" />
          <ellipse cx="60" cy="98" rx="22" ry="5" fill={color} opacity=".35" />
        </svg>
      );
    case "b": // บัวบาน
      return (
        <svg {...common} className="sym">{defs}
          <circle cx="60" cy="62" r="50" fill={`url(#${g})`} opacity=".22" />
          {[-60, -30, 0, 30, 60].map((a, i) => (
            <path key={i} transform={`rotate(${a} 60 86)`} d="M60 86c-12-14-12-38 0-52 12 14 12 38 0 52z" fill={i === 2 ? "#fff" : color} opacity={i === 2 ? 0.92 : 0.8} />
          ))}
          <ellipse cx="60" cy="90" rx="30" ry="6" fill={color} opacity=".4" />
        </svg>
      );
    case "c": // ไข่มุก
      return (
        <svg {...common} className="sym">{defs}
          <path d="M22 70c8-26 68-26 76 0-10 12-66 12-76 0z" fill="#9fb8d9" opacity=".55" />
          <circle cx="60" cy="58" r="26" fill={`url(#${g})`} />
          <circle cx="51" cy="49" r="7" fill="#fff" opacity=".9" />
          <path d="M22 70c10 16 66 16 76 0" stroke="#dbeafe" strokeWidth="3" opacity=".8" />
        </svg>
      );
    case "d": // จันทร์เพ็ญ
      return (
        <svg {...common} className="sym">{defs}
          <circle cx="60" cy="60" r="52" fill={`url(#${g})`} opacity=".3" />
          <circle cx="60" cy="60" r="34" fill="#eef2ff" />
          <circle cx="48" cy="52" r="6" fill={color} opacity=".45" />
          <circle cx="68" cy="70" r="8" fill={color} opacity=".35" />
          <circle cx="70" cy="47" r="4" fill={color} opacity=".4" />
          {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={60 + Math.cos(i) * 50} cy={60 + Math.sin(i * 1.7) * 48} r="1.8" fill="#fff" opacity=".8" />)}
        </svg>
      );
    case "e": // สุริยะทอง
      return (
        <svg {...common} className="sym">{defs}
          {Array.from({ length: 16 }).map((_, i) => (
            <path key={i} transform={`rotate(${i * 22.5} 60 60)`} d={i % 2 ? "M60 6l4 18h-8z" : "M60 2l6 24h-12z"} fill={color} opacity={i % 2 ? 0.7 : 1} />
          ))}
          <circle cx="60" cy="60" r="30" fill={`url(#${g})`} />
          <circle cx="60" cy="60" r="22" fill="#fff3c4" />
          <circle cx="60" cy="60" r="22" fill="none" stroke={color} strokeWidth="3" />
        </svg>
      );
    default: // ฟ้าประทาน
      return (
        <svg {...common} className="sym">
          <defs>
            <linearGradient id="rain" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fda4af" /><stop offset=".3" stopColor="#fcd34d" /><stop offset=".6" stopColor="#67e8f9" /><stop offset="1" stopColor="#c4b5fd" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="54" fill="url(#rain)" opacity=".25" />
          <path d="M60 8l10 34 34 10-34 10-10 34-10-34-34-10 34-10z" fill="url(#rain)" />
          <path d="M60 30l5 17 17 5-17 5-5 17-5-17-17-5 17-5z" fill="#fff" />
          {[0, 1, 2, 3].map((i) => <circle key={i} cx={[22, 98, 26, 94][i]} cy={[24, 30, 92, 96][i]} r="3" fill="#fff" />)}
        </svg>
      );
  }
}
