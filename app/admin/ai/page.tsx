// AI & งบ — เห็นค่าใช้จ่ายเป็นกราฟ · ลองถามบอท · ป้อนแชตกลุ่มให้ AI รู้เรื่องล่าสุด
import Link from "next/link";
import { Sparkles, Gauge, MessagesSquare, Database, FlaskConical, BookOpen, Settings2 } from "lucide-react";
import { requireAdmin } from "@/lib/bc/auth";
import { readTable } from "@/lib/google-sheets";
import { readRoster } from "@/lib/bc/roster";
import { getConfigValue } from "@/lib/bc/config";
import { budgetState, baht } from "@/lib/ai/usage";
import { corpusIndex, corpusStats } from "@/lib/ai/corpus";
import { bkkDayKey } from "@/lib/time";
import { Head, Sq, Ring, Bars, Meter, type Tone } from "../ui/kit";
import AiConsole from "../ui/AiConsole";
import ModelPicker from "../ui/ModelPicker";
import ExpandText from "../ui/ExpandText";
import ChatImport from "../ui/ChatImport";
import RecentQuestions from "../ui/RecentQuestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FEATURE: Record<string, { th: string; tone: Tone }> = {
  answer: { th: "ตอบคำถาม", tone: "blue" }, digest: { th: "เรียนรู้จากแชต", tone: "purple" }, image: { th: "อ่านรูป", tone: "pink" },
  announce: { th: "จัดประกาศ", tone: "orange" }, daily: { th: "สรุปวันนี้", tone: "yellow" }, slip: { th: "ตรวจสลิป", tone: "teal" },
  academic: { th: "ตรวจจำข้อสอบ", tone: "indigo" }, timetable: { th: "อ่านตาราง", tone: "green" }, summary: { th: "สรุปอื่น ๆ", tone: "gray" }, router: { th: "อื่น ๆ", tone: "gray" },
};
const SRC_TH: Record<string, string> = { current: "ข้อมูลปัจจุบัน", index: "ดัชนี", kb: "ฐานความรู้", ann: "ประกาศ", link: "ลิงก์", chat: "แชตรุ่น", buffer: "ข้อความล่าสุด", dir: "รายชื่อ" };
const ROUTE_TH: Record<string, [string, string]> = { rule: ["กฎ", "b-green"], cache: ["แคช", "b-green"], ai: ["AI", "b-blue"], "ai+search": ["AI+ค้น", "b-purple"], budget: ["งบหมด", "b-red"], cap: ["เกินโควตา", "b-orange"] };
const KIND_TH: Record<string, [string, string]> = { answer: ["ตอบได้", "b-green"], partial: ["บางส่วน", "b-orange"], cannot_answer: ["ส่งต่อประธาน", "b-red"], smalltalk: ["คุยเล่น", "b-blue"] };

export default async function AiPage() {
  await requireAdmin();
  const [roster, model, chat, kb, b, ix] = await Promise.all([
    readRoster(), getConfigValue("gemini_model"),
    readTable("BC_chatlog").catch(() => []),
    readTable("01_ฐานความรู้_AI").catch(() => []),
    budgetState(),
    corpusIndex().catch(() => null),
  ]);
  const cs = ix ? corpusStats(ix) : null;
  const recent = [...chat].reverse().slice(0, 400);
  const learned = kb.filter((r) => String(r["รหัสความรู้"] ?? "").startsWith("KB-AUTO")).reverse();
  const month = bkkDayKey().slice(0, 7);
  const dim = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const byDay = new Map(b.byDay.map((d) => [d.day, d.usd]));
  const today = Number(bkkDayKey().slice(8));
  const days = Array.from({ length: today }, (_, i) => byDay.get(`${month}-${String(i + 1).padStart(2, "0")}`) ?? 0);
  const feats = Object.entries(b.byFeature).sort((x, y) => y[1].usd - x[1].usd);
  const routes: Record<string, number> = {};
  const routeOf = (m: unknown) => { const r = String(m ?? "").split(":")[0]; return r in ROUTE_TH ? r : ""; }; // แถวเก่าเก็บชื่อโมเดล
  for (const c of chat) { const r = routeOf(c.model) || "ai"; routes[r] = (routes[r] ?? 0) + 1; }
  const free = (routes.rule ?? 0) + (routes.cache ?? 0);
  const modeTh = b.mode === "normal" ? "ปกติ" : b.mode === "lean" ? "ประหยัด (ใช้เกิน 80%)" : "ปิด AI ชั่วคราว (งบหมด)";

  return (
    <div className="wrap">
      <Head icon={Sparkles} tone="purple" title="AI & งบ" sub="บอทค้นเฉพาะข้อมูลที่เกี่ยวกับคำถาม (ไม่ส่งทั้งชีตทุกครั้ง) · คำถามง่าย ๆ ตอบจากกฎ/แคชฟรี · ใกล้หมดงบระบบประหยัดเอง"
        right={<Link href="/admin/settings#ai" className="btn btn-sm"><Settings2 size={15} /> ตั้งงบ</Link>} />

      <div className="grid g2">
        <div className="card">
          <div className="card-h"><h3 className="row" style={{ gap: 10, margin: 0 }}><Sq icon={Gauge} tone="purple" /> งบเดือนนี้</h3><span className={`badge ${b.mode === "normal" ? "b-green" : b.mode === "lean" ? "b-orange" : "b-red"}`}>{modeTh}</span></div>
          <div className="row" style={{ gap: 24, alignItems: "center" }}>
            <Ring value={b.spent} max={b.budget} size={130} stroke={14} tone={b.pct > 0.8 ? "red" : "purple"} label={baht(b.spent, b.rate)} sub={`จาก ${baht(b.budget, b.rate, 0)}`} />
            <div className="stack" style={{ gap: 10 }}>
              <div><div className="bignum" style={{ fontSize: 28, color: b.projected > b.budget ? "var(--red-ink)" : undefined }}>{baht(b.projected, b.rate)}</div><div className="hint">คาดว่าทั้งเดือน</div></div>
              <div><div className="bignum" style={{ fontSize: 28 }}>{b.avgAnswer ? `${(b.avgAnswer * b.rate * 100).toFixed(1)} สต.` : "—"}</div><div className="hint">ต่อ 1 คำถาม (เฉลี่ย)</div></div>
            </div>
          </div>
          <div className="label" style={{ marginTop: 18 }}>รายวัน (วันนี้ {baht(b.today, b.rate)})</div>
          <Bars values={days.length ? days : [0]} title={(i) => `${i + 1} · ${baht(days[i] ?? 0, b.rate)}`} />
          <div className="hint" style={{ marginTop: 4 }}>1 – {dim} {month}</div>
        </div>

        <div className="card">
          <div className="card-h"><h3 style={{ margin: 0 }}>ใช้ไปกับอะไร</h3><span className="hint">{b.calls.toLocaleString()} ครั้ง</span></div>
          {feats.length ? (
            <>
              <Meter parts={feats.map(([f, v]) => ({ value: v.usd, tone: FEATURE[f]?.tone ?? "gray" }))} />
              <div className="list" style={{ marginTop: 12 }}>
                {feats.map(([f, v]) => (
                  <div key={f} className="li" style={{ padding: "8px 12px" }}>
                    <span style={{ width: 12, height: 12, borderRadius: 4, flex: "none" }} className={`c-${FEATURE[f]?.tone ?? "gray"}`} />
                    <div className="li-b"><b>{FEATURE[f]?.th ?? f}</b><small>{v.calls.toLocaleString()} ครั้ง</small></div>
                    <b>{baht(v.usd, b.rate)}</b>
                  </div>
                ))}
              </div>
            </>
          ) : <span className="hint">ยังไม่มีการใช้เดือนนี้</span>}
          {chat.length > 0 && <div className="hint" style={{ marginTop: 12 }}>คำถามทั้งหมด {chat.length.toLocaleString()} · ตอบฟรีจากกฎ/แคช {free.toLocaleString()} ({Math.round((free / chat.length) * 100)}%) · จำกัด {b.cap} คำถาม/คน/วัน</div>}
        </div>
      </div>

      <h2 className="row" style={{ gap: 10 }}><Sq icon={FlaskConical} tone="blue" /> ลองถามบอท</h2>
      <div className="split-side">
        <AiConsole roster={roster.map((r) => ({ sid: r.student_id, label: `${r.nickname} · ${r.full_name}` }))} />
        <ModelPicker current={model} />
      </div>

      <h2 className="row" style={{ gap: 10 }}><Sq icon={Database} tone="teal" /> AI รู้อะไรบ้าง</h2>
      <div className="split-side">
        <ChatImport />
        <div className="card">
          {cs ? (
            <>
              <div className="bignum">{cs.chunks.toLocaleString()}</div><div className="hint">ชิ้นความรู้ที่ค้นได้ ({(cs.chars / 1_000_000).toFixed(1)} ล้านตัวอักษร)</div>
              <div className="list" style={{ marginTop: 12 }}>
                {Object.entries(cs.by).sort((x, y) => y[1] - x[1]).map(([k, n]) => <div key={k} className="li" style={{ padding: "7px 12px" }}><div className="li-b"><b>{SRC_TH[k] ?? k}</b></div><span className="hint">{n.toLocaleString()}</span></div>)}
              </div>
            </>
          ) : <span className="hint">อ่านคลังความรู้ไม่ได้</span>}
        </div>
      </div>

      <h2 className="row" style={{ gap: 10 }}><Sq icon={MessagesSquare} tone="line" /> คำถามล่าสุดจากเพื่อน ๆ</h2>
      <RecentQuestions rows={recent.map((c) => ({ ts: String(c.ts ?? ""), nickname: String(c.nickname ?? ""), question: String(c.question ?? ""), reply: String(c.reply ?? ""), kind: String(c.kind ?? ""), route: routeOf(c.model) }))} />

      <details className="more" style={{ marginTop: 22 }}>
        <summary><BookOpen size={16} /> ความรู้ที่ AI สรุปจากแชตเอง ({learned.length})</summary>
        <div className="list" style={{ marginTop: 10 }}>
          {learned.slice(0, 30).map((r, i) => (
            <div key={i} className="li" style={{ display: "block" }}>
              <b>{String(r["หัวข้อ"] ?? "").slice(0, 80)}</b> <span className="hint">{String(r["หมวด"] ?? "")} · {String(r["วันที่ต้นทาง"] ?? "")}</span>
              <ExpandText text={String(r["คำตอบ/ข้อความต้นทาง"] ?? "")} />
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
