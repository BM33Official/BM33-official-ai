// "วันนี้" — เปิดมาแล้วรู้ทันทีว่าต้องทำอะไร (ตัวเลขใหญ่ ไอคอน ไม่มีย่อหน้ายาว)
import Link from "next/link";
import {
  Sun, Inbox, Hand, IdCard, Receipt, Users, Smartphone, Sparkles, MessageSquare, PartyPopper,
  Megaphone, Upload, GraduationCap, Wallet, ChevronRight, CalendarDays, CheckCircle2,
} from "lucide-react";
import { requireAdmin } from "@/lib/bc/auth";
import { snapshot } from "@/lib/bc/sheets";
import { readRoster } from "@/lib/bc/roster";
import { pendingOutbox } from "@/lib/bc/outbox";
import { currentDaily, parseItems } from "@/lib/bc/daily";
import { messageQuota } from "@/lib/line";
import { budgetState, baht } from "@/lib/ai/usage";
import { readSlips } from "@/lib/bc/slips";
import { agenda, AGENDA_TH } from "@/lib/bc/agenda";
import { thLongDate, bkkDayKey, relativeTh, thShortDate } from "@/lib/time";
import { Kpi, Ring, Sq, type Tone } from "./ui/kit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KIND_TONE: Record<string, { tone: Tone; cls: string }> = {
  class: { tone: "blue", cls: "b-blue" }, exam: { tone: "red", cls: "b-red" }, deadline: { tone: "orange", cls: "b-orange" },
  event: { tone: "purple", cls: "b-purple" }, form: { tone: "green", cls: "b-green" },
};

const TEXT: Record<string, string> = { class: "#0058b8", exam: "var(--red-ink)", deadline: "var(--orange-ink)", event: "#8a2fb5", form: "var(--green-ink)" };

export default async function Today() {
  await requireAdmin();
  const now = Date.now();
  const today = bkkDayKey(now);
  const [s, roster, pending, daily, quota, budget, slips, items] = await Promise.all([
    snapshot(), readRoster(), pendingOutbox(), currentDaily(), messageQuota(), budgetState().catch(() => null), readSlips().catch(() => []),
    agenda(today, bkkDayKey(now + 13 * 86_400_000)),
  ]);
  const str = (v: unknown) => String(v ?? "");
  const verified = s.members.filter((m) => str(m.status) === "verified");
  const appUsers = verified.filter((m) => str(m.portal_confirmed_at)).length;
  const claims = s.status.filter((o) => str(o.state) === "claimed").length;
  const mismatch = s.members.filter((m) => str(m.onboarding_state) === "mismatch").length;
  const slipN = slips.filter((x) => x.status === "pending").length;
  const hour = Number(new Date(now + 7 * 3600_000).toISOString().slice(11, 13));
  const hello = hour < 12 ? "อรุณสวัสดิ์" : hour < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";

  const actions = [
    { n: pending.length, icon: Inbox, tone: "red" as Tone, label: "ข้อความรออนุมัติ", sub: "ตรวจแล้วกดส่ง", href: "/admin/inbox" },
    { n: slipN, icon: Receipt, tone: "teal" as Tone, label: "สลิปรอตรวจ", sub: "ฝ่ายการเงิน", href: "/admin/finance" },
    { n: claims, icon: Hand, tone: "orange" as Tone, label: "กด “กรอกแล้ว” รอยืนยัน", sub: "สิ่งที่ต้องกรอก", href: "/admin/inbox" },
    { n: mismatch, icon: IdCard, tone: "pink" as Tone, label: "ยืนยันตัวตนไม่ตรง", sub: "ตรวจกับเจ้าตัว", href: "/admin/inbox" },
  ].filter((a) => a.n > 0);

  const upcoming = items.filter((i) => i.kind !== "class" && new Date(i.at).getTime() > now - 3600_000).slice(0, 12);
  const todayClasses = items.filter((i) => i.day === today && i.kind === "class");
  const dItems = daily ? parseItems(daily.items) : [];

  return (
    <div className="wrap">
      <div className="pagehead">
        <div>
          <div className="eyebrow"><Sq icon={Sun} tone="orange" /> {thLongDate(new Date())}</div>
          <h1>{hello} 👋</h1>
        </div>
        <div className="row">
          <Link href="/admin/announcements" className="btn btn-primary"><Megaphone size={17} /> ประกาศใหม่</Link>
        </div>
      </div>

      {actions.length ? (
        <div className="grid g-auto">
          {actions.map((a) => (
            <Link key={a.label} href={a.href} className="action fade-in"><Sq icon={a.icon} tone={a.tone} size="lg" /><div><b>{a.label}</b><small>{a.sub}</small></div><span className="a-n">{a.n}</span></Link>
          ))}
        </div>
      ) : (
        <div className="allgood"><Sq icon={PartyPopper} tone="green" size="xl" /><div><b>ไม่มีอะไรค้าง</b><span className="hint">เมื่อมีข้อความใหม่ให้อนุมัติ ระบบจะทักคุณใน LINE</span></div></div>
      )}

      <div className="grid g4" style={{ marginTop: 18 }}>
        <Kpi icon={Users} tone="blue" value={verified.length} unit={`/ ${roster.length}`} label="เพื่อนลงทะเบียนแล้ว" href="/admin/members">
          <Ring value={verified.length} max={roster.length || 100} size={46} stroke={6} tone="blue" label="" />
        </Kpi>
        <Kpi icon={Smartphone} tone="indigo" value={appUsers} unit="คน" label="เปิดแอป BM33 แล้ว" href="/admin/members" />
        <Kpi icon={Sparkles} tone="purple" value={budget ? baht(budget.spent, budget.rate) : "—"} unit={budget ? `/ ${baht(budget.budget, budget.rate, 0)}` : ""} label="ค่า AI เดือนนี้" href="/admin/ai">
          {budget && <Ring value={budget.spent} max={budget.budget} size={46} stroke={6} tone={budget.pct > 0.8 ? "red" : "purple"} label="" />}
        </Kpi>
        <Kpi icon={MessageSquare} tone="line" value={quota.remaining === null ? "∞" : quota.remaining.toLocaleString()} label={`ข้อความ LINE เหลือเดือนนี้${quota.limit ? ` (จาก ${quota.limit.toLocaleString()})` : ""}`}>
          {quota.limit ? <Ring value={quota.limit - (quota.remaining ?? 0)} max={quota.limit} size={46} stroke={6} tone="line" label="" /> : null}
        </Kpi>
      </div>

      <div className="card-h" style={{ marginTop: 30 }}>
        <h2 style={{ margin: 0 }}>2 สัปดาห์ข้างหน้า</h2>
        <Link href="/admin/daily" className="btn btn-sm"><CalendarDays size={15} /> ปฏิทินเต็ม</Link>
      </div>
      {upcoming.length ? (
        <div className="strip">
          {upcoming.map((i, k) => {
            const t = KIND_TONE[i.kind];
            return (
              <div key={k} className="tl fade-in">
                <div className="row between"><span className={`badge ${t.cls}`}>{AGENDA_TH[i.kind]}</span><span className="hint">{thShortDate(i.at)}</span></div>
                <b>{i.title}</b>
                <div className="when" style={{ color: TEXT[i.kind] }}>{relativeTh(i.at)}</div>
              </div>
            );
          })}
        </div>
      ) : <div className="card"><span className="hint">ยังไม่มีเดดไลน์หรือนัดในอีก 2 สัปดาห์</span></div>}

      <div className="grid g2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="card-h"><h3><Sq icon={Sun} tone="yellow" /> สรุปวันนี้บนแอป</h3><Link href="/admin/daily" className="btn btn-sm">แก้ไข</Link></div>
          {daily ? (
            <div className="phone" style={{ background: "linear-gradient(160deg,#1e3a8a,#2563eb)" }}>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 17 }}>{daily.headline}</div>
              {dItems.map((i, k) => <div key={k} className="bubble" style={{ borderRadius: 14, maxWidth: "100%" }}>{i.emoji} {i.text}</div>)}
            </div>
          ) : <span className="hint">ระบบร่างให้อัตโนมัติทุกเช้า 05:30 น.</span>}
          {todayClasses.length > 0 && <div className="hint" style={{ marginTop: 10 }}>วันนี้มี {todayClasses.length} คาบในตาราง</div>}
        </div>
        <div className="list" style={{ alignSelf: "start" }}>
          {[
            { href: "/admin/announcements", icon: Megaphone, tone: "blue" as Tone, t: "ประกาศใหม่", s: "วางข้อความ → AI จัดให้ → ขึ้นแอป/ส่ง LINE" },
            { href: "/admin/schedule", icon: Upload, tone: "indigo" as Tone, t: "อัปโหลดตารางเรียน", s: "ไฟล์ PDF/รูป → AI อ่านเป็นตาราง" },
            { href: "/admin/forms", icon: CheckCircle2, tone: "green" as Tone, t: "สิ่งที่ต้องกรอก", s: "ดูว่าใครยังไม่ได้กรอก" },
            { href: "/admin/academic", icon: GraduationCap, tone: "purple" as Tone, t: "ตรวจจำข้อสอบ", s: "อัปโหลดใบแบ่งข้อ + เอกสาร" },
            { href: "/admin/finance", icon: Wallet, tone: "teal" as Tone, t: "เงินรุ่น", s: "ใครจ่ายแล้ว · สลิป · เตือน" },
          ].map((x) => (
            <Link key={x.href} href={x.href} className="li"><Sq icon={x.icon} tone={x.tone} /><div className="li-b"><b>{x.t}</b><small>{x.s}</small></div><ChevronRight className="chev" size={18} /></Link>
          ))}
        </div>
      </div>
    </div>
  );
}
