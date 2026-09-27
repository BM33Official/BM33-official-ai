// ชุดชิ้นส่วนหน้าตาแบบ iOS สำหรับ Control Center (ใช้ได้ทั้ง server/client component)
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type Tone = "blue" | "green" | "orange" | "red" | "purple" | "indigo" | "teal" | "pink" | "yellow" | "gray" | "line";
const HEX: Record<Tone, string> = {
  blue: "#007aff", green: "#34c759", orange: "#ff9500", red: "#ff3b30", purple: "#af52de", indigo: "#5856d6",
  teal: "#30b0c7", pink: "#ff2d55", yellow: "#ffcc00", gray: "#8e8e93", line: "#06c755",
};
export const toneHex = (t: Tone) => HEX[t];

export function Sq({ icon: Icon, tone = "blue", size = "" }: { icon: LucideIcon; tone?: Tone; size?: "" | "lg" | "xl" }) {
  return <span className={`ic ${size} c-${tone}`}><Icon strokeWidth={2.4} /></span>;
}

export function Head({ icon, tone = "blue", title, sub, right }: { icon: LucideIcon; tone?: Tone; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="pagehead">
      <div>
        <div className="eyebrow"><Sq icon={icon} tone={tone} /></div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {right && <div className="row">{right}</div>}
    </div>
  );
}

export function Ring({ value, max = 1, size = 96, stroke = 10, tone = "blue", label, sub, track = "#ececf1" }: {
  value: number; max?: number; size?: number; stroke?: number; tone?: Tone; label?: ReactNode; sub?: ReactNode; track?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={HEX[tone]} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} style={{ transition: "stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <span className="ring-c"><span>{label !== undefined ? <b>{label}</b> : <b>{Math.round(pct * 100)}%</b>}{sub && <small>{sub}</small>}</span></span>
    </span>
  );
}

export function Bars({ values, highlightLast = true, title }: { values: number[]; highlightLast?: boolean; title?: (i: number) => string }) {
  const max = Math.max(...values, 0.000001);
  return (
    <div className="bars">
      {values.map((v, i) => <span key={i} className={highlightLast && i === values.length - 1 ? "today" : ""} style={{ height: `${Math.max(3, (v / max) * 100)}%` }} title={title?.(i)} />)}
    </div>
  );
}

export function Meter({ parts }: { parts: { value: number; tone: Tone }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return <div className="meter">{parts.map((p, i) => <i key={i} style={{ width: `${(p.value / total) * 100}%`, background: HEX[p.tone] }} />)}</div>;
}

export function Kpi({ icon, tone, value, unit, label, href, children }: { icon: LucideIcon; tone: Tone; value: ReactNode; unit?: string; label: string; href?: string; children?: ReactNode }) {
  const inner = (
    <>
      <div className="kpi-top"><Sq icon={icon} tone={tone} />{children}</div>
      <div className="kpi-v">{value}{unit && <small>{unit}</small>}</div>
      <div className="kpi-l">{label}</div>
    </>
  );
  return href ? <a href={href} className="card kpi">{inner}</a> : <div className="card kpi">{inner}</div>;
}

export function Empty({ icon, tone = "green", title, sub }: { icon: LucideIcon; tone?: Tone; title: string; sub?: string }) {
  return <div className="empty"><Sq icon={icon} tone={tone} size="xl" /><b>{title}</b>{sub && <span>{sub}</span>}</div>;
}
