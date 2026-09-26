"use client";
import { useEffect, useRef } from "react";
import type { AppData } from "./useApp";
import { initialOf } from "./Chrome";
import { ILock, IWallet, IDoc, IChat, ICheck, ISpark } from "./icons";
import { thDateTime, relativeTh } from "@/lib/time";

const FEE_LABEL: Record<string, string> = {
  paid: "จ่ายแล้ว", yearly: "รายปี", waived: "ยกเว้น", partial: "บางส่วน", unpaid: "ยังไม่จ่าย", overdue: "เลยกำหนด", upcoming: "ยังไม่ถึง",
};
const FEE_MARK: Record<string, string> = { paid: "✓", yearly: "✓", waived: "–", partial: "½", unpaid: "!", overdue: "!", upcoming: "·" };
const ZONE_COLOR: Record<string, string> = { safe: "#4ade80", watch: "#7cc4ff", close: "#fbbf24", red: "#fb7185" };

export default function Me({
  data, picture, section, onSectionDone,
}: { data: AppData; picture: string; section?: string; onSectionDone: () => void }) {
  const { mine, board } = data;
  const feesRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!section) return;
    const el = section === "fees" ? feesRef.current : section === "zone" ? zoneRef.current : null;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    onSectionDone();
  }, [section, onSectionDone]);

  const f = mine.fees;
  const z = mine.zone;
  const formsById = new Map(board.forms.map((x) => [x.id, x]));
  const myForms = mine.forms.map((x) => ({ ...x, form: formsById.get(x.id) })).filter((x) => x.form);
  const myDraws = mine.draws.filter((d) => d.inPool);

  return (
    <div className="col stagger">
      <div className="glass profile">
        <div className="avatar">{picture ? <img src={picture} alt="" /> : initialOf(mine.me.nickname)}</div>
        <div style={{ minWidth: 0 }}>
          <h2>{mine.me.nickname}</h2>
          <div className="soft small ellipsis">{mine.me.fullName}</div>
          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <span className="chip">เลขที่ {mine.me.number}</span>
            <span className="chip">{mine.me.sid}</span>
            {mine.me.role && <span className="chip info">{mine.me.role}</span>}
          </div>
        </div>
      </div>

      {/* เงินรุ่น */}
      <div ref={feesRef} className="sect"><h2>เงินรุ่น</h2><span className="lock-note"><ILock width={12} height={12} />เห็นเฉพาะคุณ</span></div>
      <section className={`glass card ${f.overdue ? "tint-rose" : ""}`}>
        {f.months.length === 0 ? (
          <div className="soft small">ฝ่ายการเงินยังไม่ได้เปิดรอบเงินรุ่นในระบบ</div>
        ) : (
          <>
            <div className="row between" style={{ alignItems: "flex-end" }}>
              <div>
                <div className="tiny muted b">{f.outstanding > 0 ? "ยอดที่ต้องจ่าย" : "สถานะ"}</div>
                <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em" }}>{f.outstanding > 0 ? `${f.outstanding.toLocaleString()} บาท` : "จ่ายครบแล้ว 🎉"}</div>
              </div>
              {f.yearly && <span className="chip done">แพ็กรายปี</span>}
            </div>
            {f.next && (
              <div className="soft small" style={{ marginTop: 6 }}>
                รอบ {f.next.label} {f.next.amount.toLocaleString()} บาท{f.next.due ? ` · ${new Date(f.next.due).getTime() < Date.now() ? "เลยกำหนดเมื่อ" : "ภายใน"} ${thDateTime(f.next.due)}` : ""}
              </div>
            )}
            <div className="months" style={{ marginTop: 14 }}>
              {f.months.map((m) => (
                <div key={m.month} className={`mcell ${m.state}`}>
                  <b>{m.label}</b><span>{m.amount ? `${m.amount}฿` : "—"}</span><i>{FEE_MARK[m.state]}</i>
                  <span style={{ fontSize: 10 }}>{FEE_LABEL[m.state]}</span>
                </div>
              ))}
            </div>
            {(board.payment.info || board.payment.link) && f.outstanding > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                {board.payment.info && <div className="soft small selectable" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{board.payment.info}</div>}
                {board.payment.link && <a className="btn block" href={board.payment.link} target="_blank" rel="noopener noreferrer"><IWallet width={17} height={17} />จ่าย / แจ้งโอน</a>}
              </div>
            )}
            <div className="tiny muted" style={{ marginTop: 12 }}>ข้อมูลจากฝ่ายการเงิน · ถ้าจ่ายแล้วแต่ยังไม่ขึ้น ทักฝ่ายการเงินได้เลย</div>
          </>
        )}
      </section>

      {/* งาน */}
      <div className="sect"><h2>งานของฉัน</h2></div>
      <section className="glass card">
        {myForms.length === 0 ? <div className="soft small">ไม่มีฟอร์มที่ต้องติดตามตอนนี้ ✨</div> : (
          <div className="list">
            {myForms.map((x) => (
              <div key={x.id} className="li">
                <div className="icon-bubble"><IDoc /></div>
                <div className="grow">
                  <div className="b ellipsis">{x.form!.name}</div>
                  {x.form!.deadline_at && <div className="tiny muted">ปิด {thDateTime(x.form!.deadline_at)} · {relativeTh(x.form!.deadline_at)}</div>}
                </div>
                {x.state === "done" ? <span className="chip done"><ICheck width={12} height={12} />ทำแล้ว</span> : x.state === "claimed" ? <span className="chip violet">รอตรวจ</span> : <span className="chip soon">ยังไม่ทำ</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* red zone */}
      <div ref={zoneRef} className="sect"><h2>การจำข้อสอบ</h2><span className="lock-note"><ILock width={12} height={12} />เห็นเฉพาะคุณ</span></div>
      <section className={`glass card ${z.level === "red" ? "tint-rose" : z.level === "close" ? "tint-gold" : ""}`}>
        <div className="gauge-wrap">
          <Gauge value={z.level === "safe" ? 0 : Math.max(0.12, z.gauge)} color={ZONE_COLOR[z.level]} />
          <div>
            <div className="b" style={{ fontSize: 20, color: ZONE_COLOR[z.level] }}>{z.title}</div>
            <div className="soft small" style={{ marginTop: 4, lineHeight: 1.5 }}>{z.text}</div>
            {z.misses > 0 && <div className="tiny muted" style={{ marginTop: 8 }}>ยังไม่ได้จำ {z.misses} ครั้ง: {z.missedExams.join(", ")}</div>}
          </div>
        </div>
        <div className="tiny muted" style={{ marginTop: 12 }}>คำนวณจากทุกข้อสอบของเทอม (ข้อสอบล่าสุดมีน้ำหนักมากกว่า) · ไม่มีใครเห็นสถานะของคุณนอกจากคุณและฝ่ายวิชาการ</div>
      </section>

      {myDraws.length > 0 && (
        <>
          <div className="sect"><h2>ผลการสุ่มกิจกรรม</h2><span className="lock-note"><ILock width={12} height={12} />ส่วนตัว</span></div>
          {myDraws.map((d) => (
            <section key={d.id} className={`glass card ${d.selected ? "tint-gold" : ""}`}>
              <div className="row between"><b>{d.activity}</b><span className="chip">{d.phase === "revealed" ? "ประกาศผลแล้ว" : `ประกาศผล ${relativeTh(d.reveal_at)}`}</span></div>
              <div className="soft small" style={{ marginTop: 6 }}>
                {d.phase !== "revealed" ? "คุณอยู่ในรายชื่อสุ่มครั้งนี้ ผลจะแจ้งเฉพาะคุณ" : d.selected ? `คุณได้รับเลือกให้ร่วม "${d.activity}" 🎯 ขอบคุณที่ช่วยรุ่นนะ` : "คุณไม่ได้ถูกเลือกในรอบนี้ 🍀"}
              </div>
            </section>
          ))}
        </>
      )}

      {/* ติดต่อ */}
      <div className="sect"><h2>ติดต่อกรรมการรุ่น</h2></div>
      <section className="glass card">
        <div className="list">
          {board.committee.map((c, i) => (
            <div key={i} className="li">
              <div className="avatar" style={{ width: 36, height: 36, fontSize: 14 }}>{initialOf(c.nickname)}</div>
              <div className="grow"><div className="b">{c.nickname}</div><div className="tiny muted">{c.role}</div></div>
              {c.contact_url ? <a className="btn sm ghost" href={c.contact_url} target="_blank" rel="noopener noreferrer"><IChat width={15} height={15} />ทัก</a> : <span className="tiny muted">—</span>}
            </div>
          ))}
        </div>
      </section>

      <div className="tiny muted" style={{ textAlign: "center", padding: "6px 20px 0", lineHeight: 1.6 }}>
        <ISpark width={12} height={12} /> BM33 App · ข้อมูลอัปเดตอัตโนมัติจากกรรมการรุ่น<br />ถ้าข้อมูลไม่ใช่ของคุณ ทักฝ่ายสื่อสารองค์กรได้เลย
      </div>
    </div>
  );
}

function Gauge({ value, color }: { value: number; color: string }) {
  const r = 46, c = 2 * Math.PI * r;
  const arc = 0.75; // 270°
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg className="gauge" viewBox="0 0 112 112">
      <g transform="rotate(135 56 56)">
        <circle cx="56" cy="56" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${c * arc} ${c}`} />
        <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${c * arc * v} ${c}`} style={{ transition: "stroke-dasharray 1.2s cubic-bezier(.2,.9,.25,1)", filter: `drop-shadow(0 0 6px ${color})` }} />
      </g>
      <text x="56" y="60" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="800">{v >= 1 ? "RED" : v === 0 ? "SAFE" : `${Math.round(v * 100)}%`}</text>
      <text x="56" y="76" textAnchor="middle" fill="rgba(220,230,255,.6)" fontSize="9" fontWeight="700">ของเส้นแดง</text>
    </svg>
  );
}
