"use client";
import { useEffect, useState } from "react";
import type { AppData } from "./useApp";
import type { TabKey } from "./Chrome";
import { initialOf } from "./Chrome";
import { IChevronR, IClock, IPin, IWallet, IDoc, IShield, ISpark } from "./icons";
import { bkkParts, bkkDayKey, countdownParts, thDateTime, relativeTh, dayDiff, TH_DAYS, TH_MONTHS } from "@/lib/time";

export function useNow(ms = 1000, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, active]);
  return now;
}

export function greeting(now: number): string {
  const h = bkkParts(now).hh;
  if (h >= 5 && h < 11) return "อรุณสวัสดิ์";
  if (h >= 11 && h < 13) return "สวัสดีตอนเที่ยง";
  if (h >= 13 && h < 17) return "สวัสดีตอนบ่าย";
  if (h >= 17 && h < 21) return "สวัสดีตอนเย็น";
  return "ดึกแล้วนะ";
}

export function deadlineTone(iso: string, now: number): "urgent" | "soon" | "info" | "done" {
  if (!iso) return "info";
  const ms = new Date(iso).getTime() - now;
  if (ms < 0) return "done";
  if (ms < 2 * 86_400_000) return "urgent";
  if (ms < 5 * 86_400_000) return "soon";
  return "info";
}

export function DeadlineChip({ iso, now, prefix = "" }: { iso: string; now: number; prefix?: string }) {
  if (!iso) return null;
  const tone = deadlineTone(iso, now);
  const over = tone === "done";
  return (
    <span className={`chip ${over ? "" : tone}`}>
      {tone === "urgent" && <i className="pulse-dot" />}
      {!over && tone !== "urgent" && <IClock width={13} height={13} />}
      {prefix}{over ? "ปิดแล้ว" : relativeTh(iso, now)}
    </span>
  );
}

const WHERE = (b: string, r: string) => [b, r && (/\d/.test(r) ? `ห้อง ${r}` : r)].filter(Boolean).join(" · ");

export default function Home({
  data, active, picture, openAnn, go,
}: {
  data: AppData; active: boolean; picture: string;
  openAnn: (id: string) => void; go: (t: TabKey, section?: string) => void;
}) {
  const now = useNow(1000, active);
  const { board, mine } = data;
  const p = bkkParts(now);
  const today = bkkDayKey(now);
  const nextExam = board.exams.find((e) => new Date(e.at).getTime() > now - 3 * 3600_000);
  const todays = board.schedule.filter((s) => s.date === today);
  const tomorrowKey = bkkDayKey(now + 86_400_000);
  const tomorrows = board.schedule.filter((s) => s.date === tomorrowKey);
  const undone = mine.forms.filter((f) => f.state !== "done").length;
  const zone = mine.zone;
  const fees = mine.fees;
  const latest = board.announcements.slice(0, 6);

  return (
    <div className="col stagger">
      <div className="hello">
        <div>
          <div className="when">{`วัน${TH_DAYS[p.dow]}ที่ ${p.d} ${TH_MONTHS[p.m]}`}</div>
          <h1>{greeting(now)},<br />{mine.me.nickname} 👋</h1>
        </div>
        <button className="avatar press" onClick={() => go("me")} aria-label="ของฉัน">
          {picture ? <img src={picture} alt="" /> : initialOf(mine.me.nickname)}
        </button>
      </div>

      {board.notice && (
        <div className="notice glass tint-gold"><span>📣</span><span className="selectable">{board.notice}</span></div>
      )}

      <div className="home-grid">
        <div>
          {/* นับถอยหลังสอบ */}
          <section className="glass countdown tint-blue">
            <div className="orb" />
            {nextExam ? (
              <>
                <div className="label">นับถอยหลังสอบ</div>
                <div className="name">{nextExam.name}</div>
                <Digits iso={nextExam.at} now={now} />
                <div className="meta">
                  <span className="chip"><IClock width={13} height={13} />{thDateTime(nextExam.at)}{nextExam.end ? `–${nextExam.end}` : ""}</span>
                  {(nextExam.building || nextExam.room) && <span className="chip"><IPin width={13} height={13} />{WHERE(nextExam.building, nextExam.room)}</span>}
                </div>
              </>
            ) : (
              <>
                <div className="label">นับถอยหลังสอบ</div>
                <div className="name">ยังไม่มีสอบในระบบ</div>
                <p className="soft small" style={{ margin: 0 }}>พอฝ่ายวิชาการลงตารางสอบ จะเริ่มนับถอยหลังให้ตรงนี้อัตโนมัติ</p>
              </>
            )}
          </section>

          {/* วันนี้ */}
          <section className="glass card">
            <div className="row between" style={{ marginBottom: 4 }}>
              <b style={{ fontSize: 17 }}>{todays.length ? "คาบเรียนวันนี้" : tomorrows.length ? "วันนี้ว่าง · พรุ่งนี้มีเรียน" : "วันนี้"}</b>
              <button className="small b" style={{ color: "var(--sky)" }} onClick={() => go("schedule")}>ตารางทั้งหมด</button>
            </div>
            {todays.length ? (
              <div className="timeline">
                {todays.map((s) => {
                  const st = new Date(`${s.date}T${s.start || "00:00"}:00+07:00`).getTime();
                  const en = new Date(`${s.date}T${s.end || s.start || "23:59"}:00+07:00`).getTime();
                  const live = now >= st && now <= en;
                  return (
                    <div key={s.id} className={`tl ${live ? "now" : ""}`} style={{ opacity: now > en ? 0.55 : 1 }}>
                      <div className="time">{s.start}<small>{s.end}</small></div>
                      <div className="body">
                        <div className="subj">{s.subject}{live && <span className="chip done" style={{ marginLeft: 8, height: 22 }}>กำลังเรียน</span>}</div>
                        {s.topic && <div className="soft small" style={{ marginTop: 2 }}>{s.topic}</div>}
                        <div className="where">
                          {(s.building || s.room) && <span className="chip"><IPin width={12} height={12} />{WHERE(s.building, s.room)}</span>}
                          {s.lecturer && <span className="chip">อ.{s.lecturer}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : tomorrows.length ? (
              <div className="timeline">
                {tomorrows.slice(0, 4).map((s) => (
                  <div key={s.id} className="tl">
                    <div className="time">{s.start}<small>{s.end}</small></div>
                    <div className="body"><div className="subj">{s.subject}</div>{(s.building || s.room) && <div className="where"><span className="chip"><IPin width={12} height={12} />{WHERE(s.building, s.room)}</span></div>}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="soft small" style={{ margin: "6px 0 0" }}>{board.schedule.length ? "ไม่มีคาบเรียนวันนี้และพรุ่งนี้ พักผ่อนให้เต็มที่ 🌤️" : "ยังไม่มีตารางเรียนในระบบ"}</p>
            )}
          </section>

          {/* สรุปประจำวัน */}
          {board.daily && (
            <section className="glass card daily">
              <div className="row between" style={{ marginBottom: 6 }}>
                <span className="chip info"><ISpark width={13} height={13} />สรุปวันนี้</span>
                <span className="tiny muted">อัปเดต {thDateTime(board.daily.updated_at || board.daily.date)}</span>
              </div>
              <div className="headline" style={{ margin: "6px 0 4px" }}>{board.daily.headline}</div>
              {board.daily.items.map((it, i) => (
                <button key={i} className="item" style={{ width: "100%", textAlign: "left" }}
                  onClick={() => { if (it.ref && board.announcements.some((a) => a.id === it.ref)) openAnn(it.ref); else if (it.ref?.startsWith("F-")) go("news", "forms"); }}>
                  <div className="em">{it.emoji}</div>
                  <div>
                    <div className="txt">{it.text}</div>
                    {it.at && <div style={{ marginTop: 6 }}><DeadlineChip iso={it.at} now={now} /></div>}
                  </div>
                </button>
              ))}
            </section>
          )}
        </div>

        <div>
          {/* สถานะของฉัน */}
          <div className="tiles">
            <button className={`glass tile press ${fees.overdue ? "tint-rose" : ""}`} onClick={() => go("me", "fees")}>
              <div className="row between"><span className="t-label">เงินรุ่น</span><IWallet width={18} height={18} /></div>
              <div>
                <div className="t-val">{fees.months.length === 0 ? "—" : fees.outstanding > 0 ? `${fees.outstanding.toLocaleString()}฿` : "ครบ ✓"}</div>
                <div className="t-sub">{fees.months.length === 0 ? "ยังไม่มีข้อมูล" : fees.outstanding > 0 ? (fees.overdue ? "เลยกำหนดแล้ว" : "ยังไม่ได้จ่าย") : fees.yearly ? "แพ็กรายปี" : "จ่ายครบแล้ว"}</div>
              </div>
            </button>
            <button className={`glass tile press ${undone ? "tint-gold" : ""}`} onClick={() => go("news", "forms")}>
              <div className="row between"><span className="t-label">งานค้าง</span><IDoc width={18} height={18} /></div>
              <div>
                <div className="t-val">{undone ? `${undone} งาน` : "ไม่มี ✓"}</div>
                <div className="t-sub">{undone ? "แตะเพื่อดู" : "เคลียร์หมดแล้ว"}</div>
              </div>
            </button>
            <button className={`glass tile press ${zone.level === "red" ? "tint-rose" : zone.level === "close" ? "tint-gold" : ""}`} onClick={() => go("me", "zone")}>
              <div className="row between"><span className="t-label">จำข้อสอบ</span><IShield width={18} height={18} /></div>
              <div>
                <div className="t-val" style={{ fontSize: 16 }}>{zone.title}</div>
                <div className="t-sub">🔒 เห็นเฉพาะคุณ</div>
              </div>
            </button>
          </div>

          {/* ประกาศล่าสุด */}
          <div className="sect"><h2>ประกาศล่าสุด</h2><button className="more" onClick={() => go("news")}>ดูทั้งหมด</button></div>
          {latest.length ? (
            <div className="hscroll">
              {latest.map((a) => {
                const dl = a.deadline_at || a.event_at;
                return (
                  <button key={a.id} className={`glass ann-mini press ${deadlineTone(a.deadline_at, now) === "urgent" ? "ann urgent" : ""}`} onClick={() => openAnn(a.id)}>
                    <div className="row between"><span className="cat">{a.category}</span>{dl && <DeadlineChip iso={dl} now={now} />}</div>
                    <div className="ttl clamp2">{a.title}</div>
                    <div className="sum clamp3">{a.summary}</div>
                    <div className="tiny muted" style={{ marginTop: "auto" }}>{a.author}{a.author_role ? ` · ${a.author_role}` : ""}</div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="glass empty">ยังไม่มีประกาศใหม่ ✨</div>
          )}

          {/* เซียมซี */}
          <button className="glass fortune-teaser tint-gold press" onClick={() => go("fortune")}>
            <MiniWheel />
            <div style={{ textAlign: "left", flex: 1 }}>
              <div className="b" style={{ fontSize: 17 }}>เซียมซีประจำวัน</div>
              <div className="soft small" style={{ marginTop: 3 }}>
                {mine.fortune.last_day === today ? `วันนี้เขย่าไปแล้ว · สะสม ${countOf(mine.fortune.collected)}/200` : "ใบแรกของวันการันตี “ไข่มุก” ขึ้นไป ✨"}
              </div>
            </div>
            <IChevronR width={20} height={20} />
          </button>

          {tomorrows.length > 0 && todays.length > 0 && (
            <div className="glass card">
              <div className="row between"><b>พรุ่งนี้</b><span className="tiny muted">{tomorrows.length} คาบ · เริ่ม {tomorrows[0].start} น.</span></div>
              <div className="soft small" style={{ marginTop: 6 }}>{tomorrows.map((s) => s.subject).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}</div>
            </div>
          )}
          {nextExam && dayDiff(nextExam.at, now) <= 14 && (
            <div className="tiny muted" style={{ textAlign: "center", padding: "0 10px" }}>สู้ ๆ นะ {mine.me.nickname} อีกแค่ {Math.max(0, dayDiff(nextExam.at, now))} วันก็สอบแล้ว 💙</div>
          )}
        </div>
      </div>
    </div>
  );
}

function countOf(b64: string): number {
  if (!b64) return 0;
  try {
    const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
    let n = 0;
    for (let i = 0; i < bin.length; i++) { let x = bin.charCodeAt(i); while (x) { n += x & 1; x >>= 1; } }
    return n;
  } catch { return 0; }
}

export function Digits({ iso, now }: { iso: string; now: number }) {
  const c = countdownParts(iso, now);
  return (
    <div className="digits">
      {[[c.d, "วัน"], [c.h, "ชั่วโมง"], [c.m, "นาที"], [c.s, "วินาที"]].map(([v, l]) => (
        <div key={l as string} className="digit"><b>{String(v).padStart(2, "0")}</b><span>{l}</span></div>
      ))}
    </div>
  );
}

export function MiniWheel({ size = 76 }: { size?: number }) {
  const segs = 12;
  return (
    <svg className="mini-wheel" width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id="mwg" cx="40%" cy="35%"><stop offset="0" stopColor="#fff3c4" /><stop offset=".55" stopColor="#f5b325" /><stop offset="1" stopColor="#8a5a07" /></radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#mwg)" />
      {Array.from({ length: segs }).map((_, i) => {
        const a = (i / segs) * Math.PI * 2;
        return <line key={i} x1={50} y1={50} x2={50 + Math.cos(a) * 44} y2={50 + Math.sin(a) * 44} stroke="rgba(90,55,0,.45)" strokeWidth="1.2" />;
      })}
      <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(255,250,220,.8)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="12" fill="#fff6d6" stroke="#b7790e" strokeWidth="2" />
    </svg>
  );
}
