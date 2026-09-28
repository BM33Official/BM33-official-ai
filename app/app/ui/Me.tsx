"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { haptic } from "./useApp";
import type { AppData } from "./useApp";
import { initialOf, Layer } from "./Chrome";
import type { TabKey } from "./Chrome";
import { ILock, IWallet, IChat, ICheck, ISpark, IChevronR } from "./icons";
import { thDateTime, relativeTh, dayDiff, thTime, bkkDayKey } from "@/lib/time";

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
  data, picture, section, onSectionDone, api, refresh, toast, go, openAnn,
}: { data: AppData; picture: string; section?: string; onSectionDone: () => void; api: Api; refresh: () => void; toast: (t: string) => void; go: (t: TabKey, section?: string) => void; openAnn: (id: string) => void }) {
  const { mine, board } = data;
  const feesRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [slipMsg, setSlipMsg] = useState("");
  const [credits, setCredits] = useState(false);
  const taps = useRef<number[]>([]);

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
          <span>Red Zone</span>
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

      {/* red zone = ข้อสอบที่ยังไม่ได้จำ + เงินรุ่นที่เลยกำหนด */}
      <div ref={zoneRef} className="sect big"><h2>Red Zone</h2></div>
      <div className="plain">
        <div className="gauge-wrap">
          <Gauge value={z.level === "safe" ? 0 : Math.max(0.12, z.gauge)} color={ZONE_COLOR[z.level]} />
          <div>
            <div className="b" style={{ fontSize: 20, color: ZONE_COLOR[z.level] }}>{z.title}</div>
            <div className="soft small" style={{ marginTop: 4, lineHeight: 1.5 }}>{z.text}</div>
            {z.misses > 0 && <div className="tiny muted" style={{ marginTop: 8 }}>📕 ยังไม่ได้จำ {z.misses} ครั้ง: {z.missedExams.join(", ")}</div>}
            {z.feeMisses > 0 && <button className="zone-fee press" onClick={() => feesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>💸 เงินรุ่นเลยกำหนด: {z.feeMonths.join(", ")} <IChevronR width={13} height={13} /></button>}
          </div>
        </div>
        <div className="tiny muted" style={{ marginTop: 12 }}>นับจากข้อสอบที่ยังไม่ได้จำ (ครั้งล่าสุดมีน้ำหนักมากกว่า) + เงินรุ่นที่เลยกำหนดแล้วยังไม่จ่าย · เห็นแค่คุณกับกรรมการที่ดูแล</div>
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

      {/* สรุปสิ่งที่ต้องทำวันนี้ (เฉพาะของฉัน) */}
      <div className="sect big"><h2>สรุปสิ่งที่ต้องทำวันนี้</h2></div>
      <TodayTodo data={data} go={go} openAnn={openAnn}
        onFees={() => feesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        onZone={() => zoneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />

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

      <div className="tiny muted me-foot" style={{ textAlign: "center", padding: "6px 20px 0", lineHeight: 1.6 }}
        onClick={() => {
          // ✦ แตะ 7 ครั้งติด ๆ กัน
          const t = Date.now();
          taps.current = [...taps.current.filter((x) => t - x < 3500), t];
          if (taps.current.length >= 4) haptic(4);
          if (taps.current.length >= 7) { taps.current = []; haptic(30); setCredits(true); }
        }}>
        <ISpark width={12} height={12} /> BM33 App · ข้อมูลอัปเดตอัตโนมัติจากกรรมการรุ่น
      </div>
      {credits && <Credits onClose={() => setCredits(false)} />}
    </div>
  );
}

// ── สรุปสิ่งที่ต้องทำวันนี้ — คำนวณจากข้อมูลของฉันเท่านั้น ─────────────────────
type Todo = { em: string; t: string; s: string; tone: "urgent" | "soon" | "normal"; on: () => void };
function TodayTodo({ data, go, openAnn, onFees, onZone }: { data: AppData; go: (t: TabKey, section?: string) => void; openAnn: (id: string) => void; onFees: () => void; onZone: () => void }) {
  const { board, mine } = data;
  const now = Date.now();
  const today = bkkDayKey(now);
  const items = useMemo(() => {
    const out: Todo[] = [];
    const stateOf = (id: string) => mine.forms.find((f) => f.id === id)?.state ?? "none";
    for (const e of board.exams) {
      const t = new Date(e.at).getTime();
      if (t < now || dayDiff(e.at, now) > 1) continue;
      out.push({ em: "📚", t: `สอบ ${e.name}`, s: `${dayDiff(e.at, now) === 0 ? "วันนี้" : "พรุ่งนี้"} ${thTime(e.at)} น.${e.room ? ` · ${e.room}` : ""}`, tone: "urgent", on: () => go("schedule") });
    }
    const forms = board.forms.filter((f) => !f.closed && stateOf(f.id) === "none").sort((a, b) => (a.deadline_at || "9").localeCompare(b.deadline_at || "9"));
    for (const f of forms) {
      const d = f.deadline_at ? dayDiff(f.deadline_at, now) : 99;
      out.push({ em: "📝", t: `กรอก ${f.name}`, s: f.deadline_at ? `ปิด ${relativeTh(f.deadline_at, now)}` : "ยังไม่มีกำหนดปิด", tone: d <= 1 ? "urgent" : d <= 3 ? "soon" : "normal", on: () => go("home", "todo") });
    }
    const fees = mine.fees;
    if (fees.months.length && fees.outstanding > 0) {
      out.push({ em: "💸", t: `จ่ายเงินรุ่น ${fees.outstanding.toLocaleString()} บาท`, s: fees.overdue ? "เลยกำหนดแล้ว · นับใน Red Zone" : fees.next?.due ? `ภายใน ${thDateTime(fees.next.due)}` : "แนบสลิปในแอปได้เลย", tone: fees.overdue ? "urgent" : "soon", on: onFees });
    }
    const z = mine.zone;
    if (z.level === "red" || z.level === "close") {
      out.push({ em: "📕", t: z.misses ? `ทบทวนข้อสอบที่ยังไม่ได้จำ (${z.misses})` : "เคลียร์ Red Zone", s: z.title, tone: z.level === "red" ? "urgent" : "soon", on: onZone });
    }
    const classes = board.schedule.filter((c) => c.date === today).sort((a, b) => a.start.localeCompare(b.start));
    const nowHm = new Date(now + 7 * 3600_000).toISOString().slice(11, 16);
    const left = classes.filter((c) => (c.end || c.start) >= nowHm);
    if (left.length) out.push({ em: "🏫", t: `เรียนอีก ${left.length} คาบวันนี้`, s: `ถัดไป ${left[0].start} น. ${left[0].subject}${left[0].room ? ` · ${left[0].room}` : ""}`, tone: "normal", on: () => go("schedule") });
    return out;
  }, [board, mine, now, today, go, onFees, onZone]);
  const head = board.daily && board.daily.date === today ? board.daily.headline : "";
  const urgent = items.filter((i) => i.tone === "urgent").length;
  return (
    <div className="plain today-todo">
      {head && <div className="tt-head">☀️ {head}</div>}
      {items.length === 0 ? (
        <div className="tt-empty">🎉 วันนี้ไม่มีอะไรค้าง พักผ่อนได้เต็มที่</div>
      ) : (
        <>
          <div className="tt-sum">{items.length} อย่าง{urgent ? <b> · ด่วน {urgent}</b> : null}</div>
          {items.map((it, i) => (
            <button key={i} className={`tt-row press ${it.tone}`} onClick={() => { haptic(); it.on(); }}>
              <span className="tt-em">{it.em}</span>
              <span className="tt-b"><b>{it.t}</b><small>{it.s}</small></span>
              <IChevronR width={15} height={15} />
            </button>
          ))}
        </>
      )}
      {board.daily && board.daily.date === today && board.daily.items.some((x) => x.ref) && (
        <div className="tt-more">
          {board.daily.items.filter((x) => x.ref && board.announcements.some((a) => a.id === x.ref)).slice(0, 3).map((x, i) => (
            <button key={i} className="chip press" onClick={() => openAnn(x.ref!)}>{x.emoji} {x.text.slice(0, 28)}{x.text.length > 28 ? "…" : ""}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ✦ เครดิตลับ
const ROLL = [
  { k: "sm", t: "BM33 · LINE OA · App · Control Center" },
  { k: "gap" },
  { k: "sm", t: "คิด ออกแบบ และเขียนทุกบรรทัดโดย" },
  { k: "xl", t: "บิงโก" },
  { k: "md", t: "วีร์ทิวัตถ์ · ฝ่ายสื่อสารองค์กร" },
  { k: "gap" },
  { k: "sm", t: "บอทที่ตอบได้ทุกเรื่องของรุ่น" },
  { k: "sm", t: "แอปที่รวมทุกประกาศไว้ที่เดียว" },
  { k: "sm", t: "เซียมซีมังกร · ปฏิทิน · Red Zone" },
  { k: "sm", t: "เตือนรวมข้อความเดียว · ศูนย์ควบคุมของกรรมการ" },
  { k: "gap" },
  { k: "md", t: "ทำขึ้นเพื่อให้ไม่มีใครต้องไล่แชตดันอีกต่อไป 💙" },
  { k: "gap" },
  { k: "sm", t: "ขอบคุณกรรมการรุ่นและเพื่อน BM33 ทุกคน" },
  { k: "gap" },
  { k: "tiny", t: "✦ คุณเจอความลับแล้ว อย่าบอกใครนะ 🤫" },
] as const;

function Credits({ onClose }: { onClose: () => void }) {
  const stars = useMemo(() => Array.from({ length: 70 }, (_, i) => ({ x: (i * 73) % 100, y: (i * 37 + (i % 7) * 11) % 100, s: 1 + (i % 3), d: (i % 9) * 0.4 })), []);
  useEffect(() => { const t = setTimeout(onClose, 30_000); return () => clearTimeout(t); }, [onClose]);
  return (
    <Layer>
      <div className="credits" onClick={onClose} role="dialog" aria-label="เครดิต">
        {stars.map((st, i) => <i key={i} style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, animationDelay: `${st.d}s` }} />)}
        <div className="cr-glow" />
        <div className="cr-roll">
          <div className="cr-logo">33</div>
          {ROLL.map((r, i) => r.k === "gap" ? <div key={i} className="cr-gap" /> : <div key={i} className={`cr-${r.k}`}>{r.t}</div>)}
        </div>
        <div className="cr-tap">แตะเพื่อปิด</div>
      </div>
    </Layer>
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
