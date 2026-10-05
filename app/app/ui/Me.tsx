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
  data, picture, lineName, section, onSectionDone, api, refresh, toast, go, openAnn, openHistory,
}: { data: AppData; picture: string; lineName?: string; section?: string; onSectionDone: () => void; api: Api; refresh: () => void; toast: (t: string) => void; go: (t: TabKey, section?: string) => void; openAnn: (id: string) => void; openHistory: () => void }) {
  const { mine, board } = data;
  const feesRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [slipMsg, setSlipMsg] = useState("");
  const [credits, setCredits] = useState(false);

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
        <h1>{lineName || mine.me.nickname}</h1>
        <div className="soft small">{lineName && lineName !== mine.me.nickname ? `${mine.me.nickname} · ` : ""}{mine.me.fullName}</div>
        {picture && <div className="tiny muted" style={{ marginTop: 4 }}>รูปและชื่อซิงก์จากโปรไฟล์ LINE ของคุณ</div>}
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
        {z.enabled ? (
          <button className="ring-it press" onClick={() => zoneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            <Ring v={z.level === "safe" ? 1 : 1 - Math.min(1, z.gauge)} color={ZONE_COLOR[z.level]} label={z.level === "safe" ? "✓" : z.level === "red" ? "RED" : `ค้าง ${z.strikes}`} />
            <span>Red Zone</span>
          </button>
        ) : (
          <button className="ring-it press" onClick={openHistory}>
            <Ring v={1} color="#4ade80" label="✓" />
            <span>Green Zone</span>
          </button>
        )}
      </div>

      {/* เงินรุ่น */}
      <div ref={feesRef} className="sect big"><h2>เงินรุ่น</h2>{f.yearly && <span className="chip done">แพ็กรายปี</span>}</div>
      {f.months.length === 0 ? (
        <div className="muted small" style={{ padding: "0 6px" }}>ฝ่ายการเงินยังไม่ได้เปิดรอบเงินรุ่นในระบบ</div>
      ) : (
        <div className="plain">
          <div className="me-amount" style={{ color: f.overdue ? "#fecdd3" : undefined }}>{f.outstanding > 0 ? `${f.outstanding.toLocaleString()} บาท` : f.carried ? "ค้างยกมา" : "จ่ายครบแล้ว 🎉"}</div>
          {f.carried > 0 && <div className="zone-fee" style={{ marginTop: 6 }}>📒 ค้างยกมาจากก่อนเริ่มใช้แอป {f.carried} เดือน · สอบถามยอดกับฝ่ายการเงิน</div>}
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
          {f.months.filter((m) => m.link && ["unpaid", "overdue", "upcoming", "partial"].includes(m.state)).map((m) => (
            <div key={m.month} className="fee-pay" style={{ marginTop: 10 }}>
              <div className="grow"><b>{m.label}</b><small>{m.amount ? `${m.amount.toLocaleString()} บาท` : ""}{m.due ? ` · ภายใน ${thDateTime(m.due, false)}` : ""}</small></div>
              <a className="go-btn" href={m.link} target="_blank" rel="noopener noreferrer">{m.link_label || "ชำระเงิน"}</a>
            </div>
          ))}
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

      {/* ปิด Red Zone อยู่ = ทุกคน Green Zone · แตะดูประวัติการเรียกเก็บเงินรุ่น/งานวิชาการ */}
      {!z.enabled && (
        <>
          <div ref={zoneRef} className="sect big"><h2>Green Zone</h2><span className="chip done">ทุกคนเริ่มต้นใหม่</span></div>
          <button className="plain press green-card" style={{ textAlign: "left", width: "100%" }} onClick={openHistory}>
            <span className="hist-dot" />
            <span style={{ flex: 1 }}>
              <div className="b" style={{ fontSize: 18, color: "#86efac" }}>คุณอยู่ใน Green Zone</div>
              <div className="soft small" style={{ marginTop: 3, lineHeight: 1.5 }}>แตะเพื่อดูประวัติการเรียกเก็บเงินรุ่นและงานวิชาการของคุณ</div>
            </span>
            <IChevronR width={16} height={16} />
          </button>
          {z.exams.filter((e) => !e.accepted && e.link).length > 0 && (
            <div className="plain zexams" style={{ marginTop: 10 }}>
              <div className="tiny muted b" style={{ margin: "0 2px 6px" }}>ข้อสอบที่ยังไม่ได้กรอก</div>
              {z.exams.filter((e) => !e.accepted && e.link).map((e) => (
                <div key={e.id} className="fee-pay" style={{ marginTop: 6 }}>
                  <div className="grow"><b>{e.name}</b>{e.date && <small>สอบ {thDateTime(e.date, false)}</small>}</div>
                  <a className="go-btn" href={e.link} target="_blank" rel="noopener noreferrer">ไปกรอก</a>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {z.enabled && (
        <>
      {/* red zone = ข้อสอบที่ยังไม่ได้กรอก + เงินรุ่นที่เลยกำหนด · แตะแล้วเห็นว่าค้างอะไร ไปกรอก/ยอมโดนได้เลย */}
      <div ref={zoneRef} className="sect big"><h2>Red Zone</h2><span className="chip" style={{ color: ZONE_COLOR[z.level] }}>ค้าง {z.strikes}/3</span></div>
      <div className="plain">
        <div className="gauge-wrap">
          <Gauge value={z.level === "safe" ? 0 : Math.max(0.12, z.gauge)} color={ZONE_COLOR[z.level]} />
          <div>
            <div className="b" style={{ fontSize: 20, color: ZONE_COLOR[z.level] }}>{z.title}</div>
            <div className="soft small" style={{ marginTop: 4, lineHeight: 1.5 }}>{z.text}</div>
          </div>
        </div>
        <div className="zlevels">{(["watch", "close", "red"] as const).map((lv, i) => <span key={lv} className={z.strikes >= i + 1 ? "on" : ""} style={{ ["--c" as string]: ZONE_COLOR[lv] }}>{i + 1}{i === 2 ? "+" : ""}<small>{lv === "watch" ? "เฝ้าระวัง" : lv === "close" ? "ใกล้" : "Red Zone"}</small></span>)}</div>

        {z.exams.length > 0 && (
          <div className="zexams">
            <div className="tiny muted b" style={{ margin: "14px 2px 6px" }}>ข้อสอบที่ยังไม่ได้กรอก ({z.exams.length})</div>
            {z.exams.map((e) => <ZoneExam key={e.id} e={e} api={api} refresh={refresh} toast={toast} preview={!!data.preview} />)}
          </div>
        )}
        {z.feeMisses > 0 && <button className="zone-fee press" onClick={() => feesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>💸 เงินรุ่นที่ค้าง: {z.feeMonths.join(", ")} <IChevronR width={13} height={13} /></button>}
        <div className="tiny muted" style={{ marginTop: 12, lineHeight: 1.55 }}>ค้าง = ข้อสอบที่ยังไม่ได้กรอก + เดือนเงินรุ่นที่เลยกำหนด · 1 เฝ้าระวัง · 2 ใกล้ · 3 ขึ้นไป Red Zone · “ยอมโดน” = ยังนับอยู่ แต่กรรมการจะไม่ตามเตือนข้อสอบนั้นอีก · เห็นแค่คุณกับกรรมการที่ดูแล</div>
      </div>

        </>
      )}

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

      <button className="credits-btn press" onClick={() => { haptic(20); setCredits(true); }}>
        <span className="cb-spark"><ISpark width={16} height={16} /></span>
        <span className="cb-t"><b>ใครสร้างแอปนี้?</b><small>ดูเครดิตเบื้องหลัง BM33 App ✦</small></span>
        <IChevronR width={16} height={16} />
      </button>
      <div className="tiny muted" style={{ textAlign: "center", padding: "2px 20px 0", lineHeight: 1.6 }}>BM33 App · ข้อมูลอัปเดตอัตโนมัติจากกรรมการรุ่น</div>
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
    if (fees.carried > 0 && !fees.outstanding) out.push({ em: "📒", t: `เงินรุ่นค้างยกมา ${fees.carried} เดือน`, s: "สอบถามยอดกับฝ่ายการเงิน", tone: "soon", on: onFees });
    if (fees.months.length && fees.outstanding > 0) {
      out.push({ em: "💸", t: `จ่ายเงินรุ่น ${fees.outstanding.toLocaleString()} บาท`, s: fees.overdue ? (mine.zone.enabled ? "เลยกำหนดแล้ว · นับใน Red Zone" : "เลยกำหนดแล้ว") : fees.next?.due ? `ภายใน ${thDateTime(fees.next.due)}` : "แนบสลิปในแอปได้เลย", tone: fees.overdue ? "urgent" : "soon", on: onFees });
    }
    const z = mine.zone;
    if (z.enabled && (z.level === "red" || z.level === "close")) {
      const open = z.exams.filter((e) => !e.accepted).length;
      out.push({ em: "📕", t: open ? `กรอกข้อสอบที่ค้าง (${open})` : "เคลียร์ Red Zone", s: `${z.title} · ค้าง ${z.strikes}/3`, tone: z.level === "red" ? "urgent" : "soon", on: onZone });
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

// ── ข้อสอบที่ยังไม่ได้กรอก 1 รายการ: ไปกรอก / จำไม่ได้ ยอมโดน ─────────────────
type ZE = { id: string; name: string; link: string; date: string; accepted: boolean };
function ZoneExam({ e, api, refresh, toast, preview }: { e: ZE; api: Api; refresh: () => void; toast: (t: string) => void; preview: boolean }) {
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [acc, setAcc] = useState(e.accepted);
  useEffect(() => setAcc(e.accepted), [e.accepted]);
  async function accept(on: boolean) {
    haptic(); setBusy(true);
    const r = await api("accept", { examId: e.id, on });
    setBusy(false); setAsk(false);
    if (r.ok) { setAcc(on); toast(on ? "รับทราบ ✓ กรรมการจะไม่ตามเตือนข้อสอบนี้แล้ว" : "ยกเลิกแล้ว ไปกรอกได้เลยนะ"); refresh(); }
    else toast(String(r.error ?? "ลองใหม่อีกครั้งนะ"));
  }
  return (
    <div className={`zx ${acc ? "acc" : ""}`}>
      <div className="zx-top">
        <span className="zx-ic">📝</span>
        <span className="zx-b"><b>{e.name}</b><small>{acc ? "ยอมโดนแล้ว · ยังนับใน Red Zone แต่ไม่ถูกตามแล้ว" : e.date ? `สอบ ${thDateTime(e.date, false)}` : "ยังไม่ได้กรอกข้อที่รับผิดชอบ"}</small></span>
      </div>
      {ask ? (
        <div className="zx-ask">
          <span>จำไม่ได้จริง ๆ ใช่ไหม? ข้อสอบนี้ยังนับเป็น “ค้าง” ใน Red Zone แต่กรรมการจะไม่ทักตามอีก</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" style={{ flex: 1, background: "linear-gradient(180deg,#fb7185,#e11d48)" }} disabled={busy} onClick={() => accept(true)}>ยอมโดน</button>
            <button className="btn sm ghost" style={{ flex: 1 }} onClick={() => setAsk(false)}>ไว้ก่อน</button>
          </div>
        </div>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          {e.link && !acc && <a className="btn sm" style={{ flex: 1.3 }} href={e.link} target="_blank" rel="noopener noreferrer">ไปกรอก</a>}
          {!acc ? <button className="btn sm ghost" style={{ flex: 1 }} disabled={preview || busy} onClick={() => { haptic(); setAsk(true); }}>จำไม่ได้ ยอมโดน</button>
            : <button className="btn sm ghost" style={{ flex: 1 }} disabled={preview || busy} onClick={() => accept(false)}>ยกเลิก ยอมโดน</button>}
        </div>
      )}
    </div>
  );
}

// ── ✦ เครดิต ────────────────────────────────────────────────────────────────
const NAME = "บิงโก";
const FEATS = ["🤖 บอทตอบได้ทุกเรื่องของรุ่น", "📱 แอปรวมทุกประกาศ", "🐉 เซียมซีมังกร", "📅 ปฏิทิน & ตาราง", "📕 Red Zone", "🔔 เตือนรวมข้อความเดียว", "🛠 ศูนย์ควบคุมกรรมการ"];

function Credits({ onClose }: { onClose: () => void }) {
  const stars = useMemo(() => Array.from({ length: 80 }, (_, i) => ({ x: (i * 73) % 100, y: (i * 37 + (i % 7) * 11) % 100, s: 1 + (i % 3), d: (i % 9) * 0.3 })), []);
  const confetti = useMemo(() => Array.from({ length: 46 }, (_, i) => ({
    x: 50 + Math.cos(i * 2.39) * (18 + (i % 5) * 7), r: (i * 47) % 360, d: 1.05 + (i % 6) * 0.07,
    c: ["#fcd34d", "#7cc4ff", "#fb7185", "#a78bfa", "#4ade80", "#ffffff"][i % 6], dx: Math.cos(i * 1.7) * 160, dy: -120 - (i % 7) * 34,
  })), []);
  const parts = ["บิง", "โก"]; // แยกเป็นพยางค์ (ตัดสระ/วรรณยุกต์ไทยแยกตัวไม่ได้)
  useEffect(() => { const t = setTimeout(onClose, 16_000); return () => clearTimeout(t); }, [onClose]);
  return (
    <Layer>
      <div className="credits" onClick={onClose} role="dialog" aria-label="เครดิต">
        {stars.map((st, i) => <i key={i} className="cr-star" style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, animationDelay: `${st.d}s` }} />)}
        <div className="cr-glow" />
        <div className="cr-rings"><span /><span /><span /></div>
        <div className="cr-stage">
          <div className="cr-logo">33</div>
          <div className="cr-kicker">BM33 · LINE OA · App · Control Center</div>
          <div className="cr-by">คิด ออกแบบ และเขียนทุกบรรทัดโดย</div>
          <div className="cr-name" aria-label={NAME}>
            {parts.map((p, i) => <span key={i} style={{ animationDelay: `${0.9 + i * 0.22}s` }}>{p}</span>)}
            <em className="cr-shine" />
          </div>
          <div className="cr-sub">วีร์ทิวัตถ์ · ฝ่ายสื่อสารองค์กร BM33</div>
          <div className="cr-orbit">{Array.from({ length: 8 }, (_, i) => <b key={i} style={{ ["--a" as string]: `${i * 45}deg`, animationDelay: `${i * -0.35}s` }}>✦</b>)}</div>
          <div className="cr-feats">{FEATS.map((f, i) => <span key={f} style={{ animationDelay: `${2.2 + i * 0.16}s` }}>{f}</span>)}</div>
          <div className="cr-thanks">ทำขึ้นเพื่อให้ไม่มีใครต้องไล่แชตดันอีกต่อไป 💙<br /><small>ขอบคุณกรรมการรุ่นและเพื่อน BM33 ทุกคน</small></div>
        </div>
        <div className="cr-confetti">{confetti.map((c, i) => <i key={i} style={{ left: `${c.x}%`, background: c.c, animationDelay: `${c.d}s`, ["--dx" as string]: `${c.dx}px`, ["--dy" as string]: `${c.dy}px`, ["--r" as string]: `${c.r}deg` }} />)}</div>
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
