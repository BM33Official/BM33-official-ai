import Link from "next/link";
import { requireAdmin } from "@/lib/bc/auth";
import { snapshot } from "@/lib/bc/sheets";
import { readRoster } from "@/lib/bc/roster";
import { pendingOutbox } from "@/lib/bc/outbox";
import { liveAnnouncements } from "@/lib/bc/announcements";
import { currentDaily, parseItems } from "@/lib/bc/daily";
import { nextUniExam, liveSchedule, examStart } from "@/lib/bc/schedule";
import { readForms } from "@/lib/bc/forms";
import { messageQuota } from "@/lib/line";
import { thDateTime, relativeTh, bkkDayKey, agoTh } from "@/lib/time";
import PageHead from "./ui/PageHead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Overview() {
  await requireAdmin();
  const [s, roster, pending, ann, daily, exam, sched, forms, quota] = await Promise.all([
    snapshot(), readRoster(), pendingOutbox(), liveAnnouncements(), currentDaily(), nextUniExam(), liveSchedule(), readForms(), messageQuota(),
  ]);
  const str = (v: unknown) => String(v ?? "");
  const verified = s.members.filter((m) => str(m.status) === "verified");
  const appUsers = verified.filter((m) => str(m.portal_confirmed_at)).length;
  const claims = s.status.filter((o) => str(o.state) === "claimed").length;
  const mismatch = s.members.filter((m) => str(m.onboarding_state) === "mismatch").length;
  const drafts = s.announcements.filter((a) => str(a.status) === "draft").length;
  const today = bkkDayKey();
  const todayClasses = sched.filter((x) => x.date === today).length;
  const soon = ann.filter((a) => a.deadline_at && new Date(a.deadline_at).getTime() > Date.now()).sort((a, b) => a.deadline_at.localeCompare(b.deadline_at)).slice(0, 5);
  const openForms = forms.filter((f) => f.status !== "closed");

  const todos = [
    { n: pending.length, icon: "✉️", bg: "#e8f0fe", label: "ข้อความรออนุมัติส่ง", sub: "เตือนเดดไลน์ / ผลสุ่ม — ตรวจแล้วกดส่ง หรือพิมพ์ approve ใน LINE", href: "/admin/inbox" },
    { n: claims, icon: "🙋", bg: "#fff2e2", label: "มีคนกด “ทำแล้ว” รอตรวจ", sub: "ยืนยันหรือปฏิเสธในกล่องรอตรวจ", href: "/admin/inbox" },
    { n: mismatch, icon: "🪪", bg: "#ffe9ea", label: "ยืนยันตัวตนไม่ตรง", sub: "มีคนขอยืนยันซ้ำ/ข้อมูลไม่ตรงทะเบียน", href: "/admin/inbox" },
    { n: drafts, icon: "📝", bg: "#eef0fe", label: "ประกาศฉบับร่าง", sub: "ยังไม่ขึ้นแอป", href: "/admin/announcements" },
  ].filter((t) => t.n > 0);

  return (
    <div className="wrap">
      <PageHead icon="🏠" title="ภาพรวมวันนี้" desc="ดูว่าตอนนี้มีอะไรต้องทำ และแอปของเพื่อน ๆ กำลังแสดงอะไรอยู่" />

      <h2 style={{ marginTop: 0 }}>ต้องทำตอนนี้</h2>
      {todos.length === 0 ? (
        <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}><span style={{ fontSize: 26 }}>🎉</span><div><b>ไม่มีอะไรค้าง</b><div className="hint">ระบบจะเตือนใน LINE ของคุณเมื่อมีข้อความใหม่ให้อนุมัติ</div></div></div>
      ) : (
        <div className="grid g2">
          {todos.map((t) => (
            <Link key={t.label} href={t.href} className="todo">
              <span className="t-ic" style={{ background: t.bg }}>{t.icon}</span>
              <div><b>{t.label}</b><div className="hint" style={{ marginTop: 2 }}>{t.sub}</div></div>
              <span className="t-n">{t.n}</span>
            </Link>
          ))}
        </div>
      )}

      <h2>ตัวเลขสำคัญ</h2>
      <div className="grid g4">
        <div className="card"><div className="label">ยืนยันตัวตนแล้ว</div><div className="stat">{verified.length}<small> / {roster.length} คน</small></div><div className="hint">เปิดแอปแล้ว {appUsers} คน</div></div>
        <div className="card"><div className="label">ประกาศบนแอป</div><div className="stat">{ann.length}<small> รายการ</small></div><div className="hint">{soon.length ? `ใกล้เดดไลน์ ${soon.length} รายการ` : "ไม่มีเดดไลน์ใกล้"}</div></div>
        <div className="card"><div className="label">สอบถัดไป</div><div className="stat" style={{ fontSize: exam ? 22 : 32 }}>{exam ? relativeTh(examStart(exam).toISOString()) : "—"}</div><div className="hint">{exam ? `${exam.name} · ${thDateTime(examStart(exam).toISOString())}` : "ยังไม่มีสอบในระบบ"}</div></div>
        <div className="card"><div className="label">โควตาข้อความ LINE</div><div className="stat">{quota.remaining === null ? "∞" : quota.remaining.toLocaleString()}</div><div className="hint">ใช้ไป {quota.used.toLocaleString()}{quota.limit ? ` / ${quota.limit.toLocaleString()}` : ""} เดือนนี้</div></div>
      </div>

      <div className="grid g2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}><b>☀️ สรุปวันนี้ที่แอปแสดงอยู่</b><Link className="btn btn-sm" href="/admin/daily">แก้ไข</Link></div>
          {daily ? (
            <>
              <div style={{ margin: "10px 0 6px", fontWeight: 800 }}>{daily.headline}</div>
              {parseItems(daily.items).map((i, k) => <div key={k} className="hint" style={{ fontSize: 13.5 }}>{i.emoji} {i.text}</div>)}
              <div className="hint" style={{ marginTop: 8 }}>{daily.date === today ? "ของวันนี้" : `ของวันที่ ${daily.date} (วันนี้ยังไม่สร้าง)`} · {daily.source === "edited" ? "แก้โดยแอดมิน" : "AI ร่าง"} · {agoTh(daily.updated_at)}</div>
            </>
          ) : <p className="hint">ยังไม่มี — ระบบจะร่างให้อัตโนมัติทุกเช้า 05:30 น. หรือกด “แก้ไข” เพื่อสร้างตอนนี้</p>}
        </div>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}><b>⏰ ใกล้เดดไลน์</b><Link className="btn btn-sm" href="/admin/announcements">ประกาศทั้งหมด</Link></div>
          {soon.length === 0 && openForms.filter((f) => f.deadline_at).length === 0 ? <p className="hint">ไม่มีเดดไลน์ที่กำลังจะมาถึง</p> : (
            <table style={{ marginTop: 8 }}><tbody>
              {soon.map((a) => <tr key={a.id}><td><b>{a.title}</b></td><td className="hint">{thDateTime(a.deadline_at)}</td><td><span className="badge b-warn">{relativeTh(a.deadline_at)}</span></td></tr>)}
              {openForms.filter((f) => f.deadline_at && new Date(f.deadline_at).getTime() > Date.now()).map((f) => <tr key={f.form_id}><td><b>📝 {f.name}</b></td><td className="hint">{thDateTime(f.deadline_at!)}</td><td><span className="badge b-warn">{relativeTh(f.deadline_at!)}</span></td></tr>)}
            </tbody></table>
          )}
          <div className="hint" style={{ marginTop: 10 }}>ระบบจะร่างข้อความเตือน (ก่อน 3 วัน · 1 วัน · เช้าวันจริง) เข้ากล่องรอตรวจ และทักคุณใน LINE ให้พิมพ์ approve</div>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 18 }}>
        <div className="card">
          <b>📱 แอปสมาชิก</b>
          <p className="hint">เพื่อน ๆ เปิดจากเมนู LINE ได้ที่ <b>liff.line.me/2011755768-aSlCqo7l</b> · วันนี้มีคาบเรียน {todayClasses} คาบในระบบ</p>
          <div className="row"><a className="btn btn-primary btn-sm" href="/app?preview=6801101071" target="_blank" rel="noreferrer">ดูแอปแบบพรีวิว</a><Link className="btn btn-sm" href="/admin/members">ใครเปิดแอปแล้วบ้าง</Link></div>
        </div>
        <div className="card">
          <b>🧭 เริ่มจากตรงไหนดี</b>
          <ol className="hint" style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.9 }}>
            <li>ประกาศใหม่ → เมนู <b>ประกาศ</b> (วางข้อความจากกลุ่มได้เลย AI จัดให้)</li>
            <li>ตารางเรียน block ใหม่ → <b>ตารางเรียน & สอบ</b> → อัปโหลดไฟล์</li>
            <li>เงินรุ่น → ให้ฝ่ายการเงินใช้เมนู <b>การเงิน</b> (มีรหัสผ่านของตัวเอง)</li>
            <li>ข้อความจะส่งถึงเพื่อน ๆ ต่อเมื่อคุณ <b>อนุมัติ</b> เท่านั้น</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
