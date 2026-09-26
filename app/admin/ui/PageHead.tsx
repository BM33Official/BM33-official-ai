// หัวหน้าเพจมาตรฐาน: ไอคอน + ชื่อ + "หน้านี้ใช้ทำอะไร" + (ไม่บังคับ) ขั้นตอนสั้น ๆ
import type { ReactNode } from "react";

export default function PageHead({ icon, title, desc, steps, right }: {
  icon: string; title: string; desc: string; steps?: string[]; right?: ReactNode;
}) {
  return (
    <>
      <div className="pagehead">
        <div className="row" style={{ alignItems: "flex-start", gap: 14, flexWrap: "nowrap" }}>
          <div className="ph-ic">{icon}</div>
          <div>
            <h1>{title}</h1>
            <p className="sub">{desc}</p>
          </div>
        </div>
        {right}
      </div>
      {steps && steps.length > 0 && (
        <div className="howto">
          {steps.map((s, i) => <span key={i}><b>{i + 1}</b> · {s}</span>)}
        </div>
      )}
    </>
  );
}
