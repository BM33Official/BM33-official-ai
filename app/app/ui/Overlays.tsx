"use client";
import { useEffect, useState } from "react";
import type { AppData, Candidate } from "./useApp";
import { haptic } from "./useApp";
import { Layer } from "./Chrome";
import { countdownParts, thDateTime } from "@/lib/time";

// ── หน้าต่างสุ่มผู้เข้าร่วม (red zone gacha) ───────────────────────────────────
// ทุกคนเห็นว่า "กำลังสุ่ม" แบบไม่มีชื่อใคร · คนใน pool เท่านั้นที่ได้รู้ผลของตัวเอง
export function DrawOverlay({ data, now }: { data: AppData; now: number }) {
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  useEffect(() => {
    try { setDismissed(JSON.parse(localStorage.getItem("bm33.draws") || "{}")); } catch { /* */ }
  }, []);
  const save = (d: Record<string, string>) => { setDismissed(d); try { localStorage.setItem("bm33.draws", JSON.stringify(d)); } catch { /* */ } };

  const mineById = new Map(data.mine.draws.map((d) => [d.id, d]));
  const draws = data.board.draws.map((d) => ({ ...d, mine: mineById.get(d.id) }));
  // เฟสจากเวลาจริงของเครื่อง (แอนิเมชันเริ่มตรงเวลาทุกเครื่อง)
  const phase = (d: (typeof draws)[number]) => {
    const show = new Date(d.show_at).getTime(), rev = new Date(d.reveal_at).getTime();
    return now < show ? "upcoming" : now < rev ? "drawing" : "revealed";
  };
  const live = draws.find((d) => phase(d) === "drawing" && dismissed[d.id] !== "drawing" && dismissed[d.id] !== "revealed");
  const result = draws.find((d) => phase(d) === "revealed" && d.mine?.inPool && dismissed[d.id] !== "revealed");
  // คนนอก pool: แจ้งว่าสุ่มเสร็จแล้ว (เฉพาะช่วง 10 นาทีหลังเปิดผล และยังไม่เคยปิด)
  const done = draws.find((d) => phase(d) === "revealed" && !d.mine?.inPool && dismissed[d.id] !== "revealed" && now - new Date(d.reveal_at).getTime() < 10 * 60_000);
  const upcoming = draws.find((d) => phase(d) === "upcoming");
  const minimized = draws.find((d) => phase(d) === "drawing" && dismissed[d.id] === "drawing");

  const current = result ?? live ?? done;
  useEffect(() => { if (current) haptic(30); }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) {
    const pill = minimized ?? upcoming;
    if (!pill) return null;
    const isUp = phase(pill) === "upcoming";
    const c = countdownParts(isUp ? pill.show_at : pill.reveal_at, now);
    return (
      <button className="draw-pill glass tint-rose press" onClick={() => { if (!isUp) save({ ...dismissed, [pill.id]: "" }); }}>
        <span className="pulse-dot" style={{ color: "#fb7185" }} />
        {isUp ? `สุ่ม "${pill.activity}" เริ่มใน ${c.h ? `${c.h} ชม. ` : ""}${c.m} นาที` : `กำลังสุ่ม "${pill.activity}" · ${c.m}:${String(c.s).padStart(2, "0")}`}
      </button>
    );
  }

  const ph = phase(current);
  const c = countdownParts(current.reveal_at, now);
  return (
    <div className="draw-ov on">
      <div className="draw-card glass">
        {ph === "drawing" ? (
          <>
            <span className="chip urgent"><i className="pulse-dot" />กำลังสุ่มสด</span>
            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.3 }}>สุ่มผู้เข้าร่วม<br />“{current.activity}”</h2>
            <div className="soft small">สุ่ม {current.need} คน จากกลุ่มที่ต้องเร่งจำข้อสอบ · ไม่มีการเปิดเผยชื่อ</div>
            <div className="slots">
              {[0, 1, 2].map((i) => (
                <div className="slot" key={i}>
                  <div className="reel" style={{ animationDuration: `${0.35 + i * 0.12}s` }}>
                    {["🎯", "🍀", "📘", "⭐", "🎲", "💙", "🎯", "🍀", "📘", "⭐", "🎲", "💙"].map((e, k) => <i key={k}>{e}</i>)}
                  </div>
                </div>
              ))}
            </div>
            <div className="b" style={{ fontSize: 28, fontVariantNumeric: "tabular-nums" }}>{c.m}:{String(c.s).padStart(2, "0")}</div>
            <div className="soft small">{current.mine?.inPool ? "คุณอยู่ในรายชื่อสุ่มครั้งนี้ ผลจะขึ้นเฉพาะที่หน้าจอของคุณ 🔒" : "ผลจะแจ้งเฉพาะคนที่เกี่ยวข้องเท่านั้น"}</div>
            <button className="btn ghost sm" onClick={() => save({ ...dismissed, [current.id]: "drawing" })}>ย่อหน้าต่าง</button>
          </>
        ) : current.mine?.inPool ? (
          current.mine.selected ? (
            <>
              <div style={{ fontSize: 56 }}>🎯</div>
              <h2 style={{ margin: 0, fontSize: 24 }}>คุณได้รับเลือก!</h2>
              <div className="soft" style={{ lineHeight: 1.6 }}>ได้ร่วม “{current.activity}” นะ ขอบคุณที่ช่วยรุ่น 💙<br />รายละเอียดเพิ่มเติมฝ่ายวิชาการจะแจ้งอีกครั้ง</div>
              <div className="tiny muted">ผลนี้เห็นเฉพาะคุณ 🔒</div>
              <button className="btn block" onClick={() => save({ ...dismissed, [current.id]: "revealed" })}>รับทราบ</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 56 }}>🍀</div>
              <h2 style={{ margin: 0, fontSize: 24 }}>รอดแล้ว!</h2>
              <div className="soft" style={{ lineHeight: 1.6 }}>รอบนี้คุณไม่ได้ถูกเลือกให้ร่วม “{current.activity}”<br />แต่อย่าลืมทยอยจำข้อสอบให้ครบน้า 📘</div>
              <div className="tiny muted">ผลนี้เห็นเฉพาะคุณ 🔒</div>
              <button className="btn block" onClick={() => save({ ...dismissed, [current.id]: "revealed" })}>โล่งใจ 😮‍💨</button>
            </>
          )
        ) : (
          <>
            <div style={{ fontSize: 50 }}>✅</div>
            <h2 style={{ margin: 0, fontSize: 22 }}>สุ่มเสร็จแล้ว</h2>
            <div className="soft">ผล “{current.activity}” แจ้งเฉพาะคนที่เกี่ยวข้องแล้ว<br />คุณไม่ได้อยู่ในรายชื่อสุ่มครั้งนี้ ✨</div>
            <div className="tiny muted">{thDateTime(current.reveal_at)}</div>
            <button className="btn block" onClick={() => save({ ...dismissed, [current.id]: "revealed" })}>ปิด</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── หน้าเข้าสู่ระบบครั้งแรก ─────────────────────────────────────────────────
export function Splash({ text = "กำลังเปิด BM33…" }: { text?: string }) {
  return (
    <div className="center-stage" style={{ flexDirection: "column" }}>
      <div className="logo-mark fade-in">BM33</div>
      <div className="splash-text fade-in">{text}</div>
    </div>
  );
}

export function ConfirmScreen({ candidate, picture, onYes, onNo }: { candidate: Candidate; picture?: string; onYes: () => Promise<string>; onNo: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="center-stage">
      <div className="onb glass fade-in">
        <div className="tiny muted b">ยืนยันตัวตน · ครั้งเดียวเท่านั้น</div>
        <h1>นี่คือคุณใช่ไหม?</h1>
        <div className="who-card">
          <div className="avatar" style={{ width: 56, height: 56 }}>{picture ? <img src={picture} alt="" /> : candidate.nickname.slice(0, 1)}</div>
          <div>
            <div className="b" style={{ fontSize: 20 }}>{candidate.nickname}</div>
            <div className="soft small">{candidate.fullName}</div>
            <div className="tiny muted">เลขที่ {candidate.number} · รหัสลงท้าย {candidate.sid.slice(-3)}</div>
          </div>
        </div>
        <div className="soft small" style={{ lineHeight: 1.55 }}>กดยืนยันแล้ว ครั้งต่อไปเปิดแอปจากเมนู LINE จะเข้าบัญชีนี้ทันที ไม่ต้องล็อกอินอีก</div>
        {err && <div className="err">{err}</div>}
        <button className="btn block" disabled={busy} onClick={async () => { setBusy(true); const e = await onYes(); setErr(e); setBusy(false); }}>
          {busy ? "กำลังยืนยัน…" : "ใช่ นี่คือฉัน"}
        </button>
        <button className="btn ghost block" onClick={onNo}>ไม่ใช่</button>
      </div>
    </div>
  );
}

export function RegisterScreen({ name, onSubmit }: { name?: string; onSubmit: (name: string, last3: string) => Promise<string> }) {
  const [n, setN] = useState("");
  const [d, setD] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="center-stage">
      <form className="onb glass fade-in" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(await onSubmit(n, d)); setBusy(false); }}>
        <div className="tiny muted b">ยินดีต้อนรับสู่ BM33 App{name ? ` · ${name}` : ""}</div>
        <h1>ขอรู้จักหน่อย 👋</h1>
        <div className="soft small" style={{ lineHeight: 1.55 }}>ยืนยันตัวตนครั้งเดียว แล้วแอปจะจำคุณไว้ตลอด (ข้อมูลเงินรุ่น งานค้าง และสถานะส่วนตัวจะเห็นได้เฉพาะคุณ)</div>
        <div className="field">
          <label>ชื่อเล่น ชื่อจริง</label>
          <input value={n} onChange={(e) => setN(e.target.value)} placeholder="เช่น บิงโก วีร์ทิวัตถ์" autoComplete="off" />
        </div>
        <div className="field">
          <label>เลข 3 ตัวท้ายของรหัสนักศึกษา</label>
          <input value={d} onChange={(e) => setD(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="เช่น 071" />
        </div>
        {err && <div className="err">{err}</div>}
        <button className="btn block" disabled={busy || d.length !== 3}>{busy ? "กำลังค้นหา…" : "ถัดไป"}</button>
      </form>
    </div>
  );
}

export function OutsideLine() {
  return (
    <div className="center-stage">
      <div className="onb glass fade-in" style={{ textAlign: "center", alignItems: "center" }}>
        <div className="logo-mark">BM33</div>
        <h1>เปิดผ่าน LINE นะ</h1>
        <div className="soft small" style={{ lineHeight: 1.6 }}>แอปนี้ใช้บัญชี LINE ยืนยันตัวตนอัตโนมัติ<br />เปิดจากเมนูในแชต BM33 Official ได้เลย</div>
        <a className="btn block" href="https://liff.line.me/2011755768-aSlCqo7l">เปิดใน LINE</a>
      </div>
    </div>
  );
}
