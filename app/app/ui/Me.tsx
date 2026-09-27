"use client";
import { useEffect, useRef, useState } from "react";
import { haptic } from "./useApp";
import type { AppData } from "./useApp";
import { initialOf } from "./Chrome";
import { ILock, IWallet, IChat, ICheck, ISpark } from "./icons";
import { thDateTime, relativeTh } from "@/lib/time";

const FEE_LABEL: Record<string, string> = {
  paid: "จ่ายแล้ว", yearly: "รายปี", waived: "ยกเว้น", partial: "บางส่วน", unpaid: "ยังไม่จ่าย", overdue: "เลยกำหนด", upcoming: "ยังไม่ถึง",
};
const FEE_MARK: Record<string, string> = { paid: "✓", yearly: "✓", waived: "–", partial: "½", unpaid: "!", overdue: "!", upcoming: "·" };
const ZONE_COLOR: Record<string, string> = { safe: "#4ade80", watch: "#7cc4ff", close: "#fbbf24", red: "#fb7185" };

// ย่อรูปสลิปในเครื่องก่อนส่ง (≤1400px JPEG) — เร็วและประหยัดเน็ต
async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1400 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally { URL.revokeObjectURL(url); }
}

type Api = (path: string, body?: unknown) => Promise<{ ok: boolean; error?: string; [k: string]: unknown }>;

export default function Me({
  data, picture, section, onSectionDone, api, refresh, toast,
}: { data: AppData; picture: string; section?: string; onSectionDone: () => void; api: Api; refresh: () => void; toast: (t: string) => void }) {
  const { mine, board } = data;
  const feesRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [slipMsg, setSlipMsg] = useState("");

  useEffect(() => {
    if (!section) return;
    const el = section === "fees" ? feesRef.current : section === "zone" ? zoneRef.current : null;
    setTimeout(() => el?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    onSectionDone();
  }, [section, onSectionDone]);

  const f = mine.fees;
  const z = mine.zone;
  const myDraws = mine.draws.filter((d) => d.inPool);
  const paidN = f.months.filter((m) => ["paid", "yearly", "waived", "partial"].includes(m.state)).length;
  const dueN = f.months.filter((m) => m.state !== "upcoming").length || f.months.length;
  const formsDone = mine.forms.filter((x) => x.state === "done").length;
  const pendingSlips = (mine as { slips?: { id: string; month: string; amount: string }[] }).slips ?? [];

  async function sendSlip(file: File) {
    haptic(); setSending(true); setSlipMsg("");
    try {
      const image = await compress(file);
      const r = await api("slip", { image });
      if (r.ok) { setSlipMsg(String(r.message ?? "ได้รับสลิปแล้ว")); toast("ส่งสลิปแล้ว ✓"); refresh(); }
      else setSlipMsg(String(r.error ?? "ส่งไม่สำเร็จ ลองใหม่นะ"));
    } catch { setSlipMsg("อ่านรูปไม่ได้ ลองรูปอื่นนะ"); } finally { setSending(false); }
  }

  return (
    <div className="col stagger me">
      {/* ตัวตน */}
      <div className="me-hero">
        <div className="me-av">{picture ? <img src={picture} alt="" /> : initialOf(mine.me.nickname)}</div>
        <h1>{mine.me.nickname}</h1>
        <div className="soft small">{mine.me.fullName}</div>
        <div className="row" style={{ gap: 6, marginTop: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <span className="chip">เลขที่ {mine.me.number}</span>
          <span className="chip">{mine.me.sid}</span>
          {mine.me.role && <span className="chip info">{mine.me.role}</span>}
        </div>
        <div className="lock-note" style={{ marginTop: 10, justifyContent: "center" }}><ILock width={12} height={12} />ทุกอย่างในหน้านี้เห็นเฉพาะคุณ</div>
      </div>

      {/* ภาพรวม 3 วง */}
      <div className="rings3">
        <button className="ring-it press" onClick={() => feesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          <Ring v={f.months.length ? paidN / Math.max(1, dueN) : 0} color={f.overdue ? "#fb7185" : "#4ade80"} label={f.months.length ? (f.outstanding ? `${f.outstanding.toLocaleString()}฿` : "ครบ") : "—"} />
          <span>เงินรุ่น</span>
        </button>
        <div className="ring-it">
          <Ring v={mine.forms.length ? formsDone / mine.forms.length : 1} color="#7cc4ff" label={mine.forms.length ? `${formsDone}/${mine.forms.length}` : "✓"} />
          <span>กรอกแล้ว</span>
        </div>
        <button className="ring-it press" onClick={() => zoneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          <Ring v={z.level === "safe" ? 1 : 1 - Math.min(1, z.gauge)} color={ZONE_COLOR[z.level]} label={z.level === "safe" ? "✓" : z.level === "red" ? "RED" : `${z.misses}`} />
          <span>จำข้อสอบ</span>
        </button>
      </div>

      {/* เงินรุ่น */}
      <div ref={feesRef} className="sect big"><h2>เงินรุ่น</h2>{f.yearly && <span className="chip done">แพ็กรายปี</span>}</div>
      {f.months.length === 0 ? (
        <div className="muted small" style={{ padding: "0 6px" }}>ฝ่ายการเงินยังไม่ได้เปิดรอบเงินรุ่นในระบบ</div>
      ) : (
        <div className="plain">
          <div className="me-amount" style={{ color: f.overdue ? "#fecdd3" : undefined }}>{f.outstanding > 0 ? `${f.outstanding.toLocaleString()} บาท` : "จ่ายครบแล้ว 🎉"}</div>
          {f.next && (
            <div className="soft small">
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
          {pendingSlips.length > 0 && (
            <div className="slip-wait"><span className="pulse-dot" style={{ color: "#fbbf24" }} />ส่งสลิปแล้ว {pendingSlips.length} ใบ · รอฝ่ายการเงินยืนยัน</div>
          )}
          {f.outstanding > 0 && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {board.payment.info && <div className="soft small selectable" style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{board.payment.info}</div>}
              <div className="row" style={{ gap: 8 }}>
                {board.payment.link && <a className="btn ghost" style={{ flex: 1 }} href={board.payment.link} target="_blank" rel="noopener noreferrer"><IWallet width={17} height={17} />วิธีจ่าย / QR</a>}
                <button className="btn" style={{ flex: 1 }} disabled={sending || !!data.preview} onClick={() => fileRef.current?.click()}>
                  <ICheck width={17} height={17} />{sending ? "AI กำลังอ่าน…" : "ส่งสลิป"}
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) sendSlip(x); e.target.value = ""; }} />
              {slipMsg && <div className="slip-msg selectable">{slipMsg}</div>}
            </div>
          )}
          <div className="tiny muted" style={{ marginTop: 12 }}>ส่งรูปสลิปในแชตบอทก็ได้ · AI อ่านยอดแล้วฝ่ายการเงินกดยืนยัน</div>
        </div>
      )}

      {/* red zone */}
      <div ref={zoneRef} className="sect big"><h2>การจำข้อสอบ</h2></div>
      <div className="plain">
        <div className="gauge-wrap">
          <Gauge value={z.level === "safe" ? 0 : Math.max(0.12, z.gauge)} color={ZONE_COLOR[z.level]} />
          <div>
            <div className="b" style={{ fontSize: 20, color: ZONE_COLOR[z.level] }}>{z.title}</div>
            <div className="soft small" style={{ marginTop: 4, lineHeight: 1.5 }}>{z.text}</div>
            {z.misses > 0 && <div className="tiny muted" style={{ marginTop: 8 }}>ยังไม่ได้จำ {z.misses} ครั้ง: {z.missedExams.join(", ")}</div>}
          </div>
        </div>
        <div className="tiny muted" style={{ marginTop: 12 }}>คิดจากทุกข้อสอบของเทอม (ข้อสอบล่าสุดมีน้ำหนักมากกว่า) · เห็นแค่คุณกับฝ่ายวิชาการ</div>
      </div>

      {myDraws.length > 0 && (
        <>
          <div className="sect big"><h2>ผลการสุ่มกิจกรรม</h2></div>
          {myDraws.map((d) => (
            <div key={d.id} className="plain">
              <div className="row between"><b>{d.activity}</b><span className="chip">{d.phase === "revealed" ? "ประกาศผลแล้ว" : `ประกาศผล ${relativeTh(d.reveal_at)}`}</span></div>
              <div className="soft small" style={{ marginTop: 6 }}>
                {d.phase !== "revealed" ? "คุณอยู่ในรายชื่อสุ่มครั้งนี้ ผลจะแจ้งเฉพาะคุณ" : d.selected ? `คุณได้รับเลือกให้ร่วม "${d.activity}" 🎯 ขอบคุณที่ช่วยรุ่นนะ` : "คุณไม่ได้ถูกเลือกในรอบนี้ 🍀"}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ติดต่อ */}
      <div className="sect big"><h2>ติดต่อกรรมการรุ่น</h2></div>
      <div className="list plain-list">
        {board.committee.map((c, i) => (
          <div key={i} className="li">
            <div className="avatar" style={{ width: 36, height: 36, fontSize: 14 }}>{initialOf(c.nickname)}</div>
            <div className="grow"><div className="b">{c.nickname}</div><div className="tiny muted">{c.role}</div></div>
            {c.contact_url ? <a className="btn sm ghost" href={c.contact_url} target="_blank" rel="noopener noreferrer"><IChat width={15} height={15} />ทัก</a> : <span className="tiny muted">—</span>}
          </div>
        ))}
      </div>

      <div className="tiny muted" style={{ textAlign: "center", padding: "6px 20px 0", lineHeight: 1.6 }}>
        <ISpark width={12} height={12} /> BM33 App · ข้อมูลอัปเดตอัตโนมัติจากกรรมการรุ่น
      </div>
    </div>
  );
}

function Ring({ v, color, label }: { v: number; color: string; label: string }) {
  const r = 34, c = 2 * Math.PI * r;
  const x = Math.max(0, Math.min(1, v));
  return (
    <svg viewBox="0 0 84 84" width={84} height={84}>
      <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="8" />
      <circle cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" transform="rotate(-90 42 42)"
        strokeDasharray={`${c * x} ${c}`} style={{ transition: "stroke-dasharray 1.1s cubic-bezier(.2,.9,.25,1)", filter: `drop-shadow(0 0 5px ${color})` }} />
      <text x="42" y="47" textAnchor="middle" fill="#fff" fontSize={label.length > 5 ? 12 : 15} fontWeight="800">{label}</text>
    </svg>
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
