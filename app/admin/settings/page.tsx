// ตั้งค่า — จัดเป็นกลุ่มแบบแอป Settings ของ iPhone
import { Settings, Crown, KeyRound, Smartphone, LayoutGrid, Bell, Sparkles, Info, Link2, Users, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import GroupsPanel from "../ui/GroupsPanel";
import RedZoneSwitch from "../ui/RedZoneSwitch";
import { readMembers } from "@/lib/bc/members";
import { requireAdmin } from "@/lib/bc/auth";
import { getConfig } from "@/lib/bc/config";
import { readCommittee, seedCommitteeIfEmpty } from "@/lib/bc/committee";
import { readRoster } from "@/lib/bc/roster";
import { Head, Sq, type Tone } from "../ui/kit";
import { ConfigField, RolePassword, CommitteeEditor, RichMenuPanel, AccessLinks, BudgetBaht } from "../ui/SettingsForms";
import type { LucideIcon } from "lucide-react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function Group({ id, icon, tone, title, children }: { id?: string; icon: LucideIcon; tone: Tone; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginTop: 28 }}>
      <h2 className="row" style={{ gap: 10, marginTop: 0 }}><Sq icon={icon} tone={tone} /> {title}</h2>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  await requireAdmin();
  await seedCommitteeIfEmpty().catch(() => 0);
  const [cfg, committee, roster, members] = await Promise.all([getConfig(), readCommittee(), readRoster(), readMembers()]);
  // กรรมการที่ลงทะเบียนกับบอทแล้วเท่านั้น ที่บอทจับประกาศจากกลุ่มได้ (รู้ว่าเป็นกรรมการจาก LINE user id)
  const verifiedSids = new Set(members.filter((m) => m.status === "verified" && (m.line_user_id || m.liff_user_id)).map((m) => String(m.matched_student_id).replace(/\D/g, "")));
  const committeeReady = committee.map((c) => ({ nickname: c.nickname, role: c.role, ok: verifiedSids.has(String(c.student_id).replace(/\D/g, "")) }));
  const rosterLite = roster.map((r) => ({ sid: r.student_id, label: `${r.nickname} · ${r.full_name}`, nickname: r.nickname }));

  return (
    <div className="wrap">
      <Head icon={Settings} tone="gray" title="ตั้งค่า" sub="ทุกอย่างเก็บในแท็บ BC_config ของชีต — ไม่ต้องเข้า Vercel" />

      <Group icon={Users} tone="line" title="กลุ่ม LINE ของบอท">
        <GroupsPanel learnAll={(cfg.learn_groups ?? "").trim() === "*"} />
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-h"><h3 style={{ margin: 0 }}>กรรมการที่บอทจับประกาศจากกลุ่มได้</h3><span className="badge b-muted">{committeeReady.filter((c) => c.ok).length}/{committeeReady.length}</span></div>
          <p className="hint" style={{ marginTop: 0 }}>บอทรู้ว่าใครเป็นกรรมการจากบัญชี LINE ที่ลงทะเบียนแล้ว · ข้อความประกาศ (มีลิงก์/เดดไลน์/@All) ของคนที่ยังไม่ลงทะเบียนจะไม่ขึ้นแอปอัตโนมัติ — ให้กรรมการคนนั้นแอดบอทแล้วพิมพ์ชื่อลงทะเบียน</p>
          <div className="list">
            {committeeReady.map((c, i) => (
              <div key={i} className="li" style={{ padding: "8px 12px" }}>
                {c.ok ? <CheckCircle2 size={18} color="#34c759" /> : <AlertTriangle size={18} color="#ff9500" />}
                <div className="li-b"><b>{c.nickname}</b><small>{c.role}</small></div>
                <span className={`badge ${c.ok ? "b-green" : "b-orange"}`}>{c.ok ? "พร้อม" : "ยังไม่ลงทะเบียน"}</span>
              </div>
            ))}
          </div>
        </div>
      </Group>

      <Group icon={ShieldCheck} tone="green" title="Red Zone">
        <div className="card row between" style={{ gap: 14 }}>
          <div className="hint" style={{ flex: 1, minWidth: 220 }}>ปิด = ทุกคนอยู่ <b>Green Zone</b> ทั้งในแอปและ control center (กดดูประวัติเงินรุ่น/วิชาการได้) · ข้อมูลข้อสอบและเงินรุ่นยังเก็บตามปกติ เปิดเมื่อไรก็นับจากข้อมูลจริงทันที</div>
          <RedZoneSwitch on={(cfg.red_zone_enabled ?? "").trim() !== "0"} canEdit />
        </div>
      </Group>

      <Group icon={Link2} tone="blue" title="ลิงก์เข้าตรงของแต่ละฝ่าย">
        <AccessLinks />
        <p className="hint" style={{ marginTop: 8 }}>ส่งลิงก์นี้ให้ฝ่ายนั้นทาง LINE ส่วนตัว — เปิดแล้วเข้าได้ 60 วันโดยไม่ต้องพิมพ์รหัส · เปลี่ยนรหัสผ่านเมื่อไร ลิงก์เก่าใช้ไม่ได้ทันที</p>
      </Group>

      <Group icon={KeyRound} tone="orange" title="รหัสผ่านของแต่ละฝ่าย">
        <div className="grid g2">
          <RolePassword role="finance" label="ฝ่ายการเงิน" enabled={!!cfg.finance_password_hash} />
          <RolePassword role="academic" label="ฝ่ายวิชาการ" enabled={!!cfg.academic_password_hash || !!process.env.ACADEMIC_PANEL_PASSWORD} />
        </div>
      </Group>

      <Group icon={Crown} tone="yellow" title="กรรมการรุ่น">
        <CommitteeEditor rows={committee.map((c) => ({ student_id: c.student_id, nickname: c.nickname, role: c.role, contact_url: c.contact_url }))} roster={rosterLite} />
      </Group>

      <Group id="ai" icon={Sparkles} tone="purple" title="งบ AI">
        <div className="card">
          <BudgetBaht usd={Number(cfg.ai_budget_usd) > 0 ? Number(cfg.ai_budget_usd) : 10} rate={Number(cfg.usd_thb) > 0 ? Number(cfg.usd_thb) : 33} />
          <ConfigField k="ai_user_daily_cap" label="คำถามต่อคนต่อวัน" value={cfg.ai_user_daily_cap ?? "30"} hint="กันคนเดียวใช้งบหมด" />
          <ConfigField k="ai_price_json" label="ราคาโมเดล (ดอลลาร์ต่อ 1 ล้าน token)" value={cfg.ai_price_json ?? ""} placeholder='{"in":0.5,"cached":0.05,"out":3}' hint="ว่าง = ใช้ค่าเริ่มต้น · ใส่ตามหน้าราคาของ Google ถ้าเปลี่ยน" />
        </div>
      </Group>

      <Group icon={Smartphone} tone="indigo" title="แอปสมาชิก">
        <div className="card">
          <ConfigField k="portal_notice" label="ข้อความด่วนบนหัวแอป (ว่าง = ไม่แสดง)" value={cfg.portal_notice ?? ""} textarea placeholder="เช่น พรุ่งนี้งดเรียนช่วงบ่าย ตามประกาศคณะ" />
          <div className="grid g2">
            <ConfigField k="semester_label" label="ชื่อภาคเรียน" value={cfg.semester_label ?? ""} placeholder="ปี 2 ภาคเรียนที่ 1/2569" />
            <ConfigField k="red_zone_size" label="จำนวนคนใน Red Zone" value={cfg.red_zone_size ?? "6"} />
          </div>
          <ConfigField k="linktree_url" label="LinkTree วิชาการ" value={cfg.linktree_url ?? ""} placeholder="https://linktr.ee/BM33AcademicLinks" hint="ใช้ในเมนู LINE และให้บอทตอบเมื่อถามหาลิงก์วิชาการ" />
        </div>
      </Group>

      <Group icon={LayoutGrid} tone="line" title="เมนู LINE">
        <RichMenuPanel />
      </Group>

      <Group icon={Bell} tone="red" title="การเตือน & การอนุมัติ">
        <div className="card">
          <ConfigField k="reminder_plan" label="เตือนก่อนเดดไลน์กี่วัน (คั่นด้วย ,)" value={cfg.reminder_plan ?? "3,1,0"} hint="0 = เช้าวันเดดไลน์ · ระบบร่างไป “รออนุมัติ” เวลา 08:00–21:00 น. แล้วทักคุณใน LINE" />
          <ConfigField k="approver_line_ids" label="LINE user ID ของผู้อนุมัติ" value={cfg.approver_line_ids ?? ""} placeholder={process.env.ADMIN_LINE_USER_IDS ?? ""} hint="ว่าง = ใช้แอดมินจาก Vercel (ADMIN_LINE_USER_IDS)" />
        </div>
      </Group>

      <Group icon={Info} tone="gray" title="ข้อมูลระบบ">
        <div className="list">
          <div className="li"><div className="li-b"><b>ลิงก์แอปสมาชิก</b><small>https://liff.line.me/2011755768-aSlCqo7l</small></div></div>
          <div className="li"><div className="li-b"><b>Service account (ใช้แชร์ชีต)</b><small style={{ wordBreak: "break-all" }}>{process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}</small></div></div>
          <a className="li" href={`https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`} target="_blank" rel="noreferrer"><div className="li-b"><b>เปิด Google Sheet หลัก</b></div></a>
          <div className="li"><div className="li-b"><b>คำสั่งในแชตบอท (แอดมิน)</b><small>approve · approve 123 · approve all · reject 123 · “ประกาศ …”</small></div></div>
          <div className="li"><div className="li-b"><b>ในกลุ่ม LINE</b><small>บอทเงียบเสมอ — อ่านอย่างเดียวเพื่อเก็บข้อมูล ไม่ตอบแม้ถูกแท็ก</small></div></div>
        </div>
      </Group>
    </div>
  );
}
