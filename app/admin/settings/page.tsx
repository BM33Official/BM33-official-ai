import { requireAdmin } from "@/lib/bc/auth";
import { getConfig } from "@/lib/bc/config";
import { readCommittee, seedCommitteeIfEmpty } from "@/lib/bc/committee";
import { readRoster } from "@/lib/bc/roster";
import PageHead from "../ui/PageHead";
import { ConfigField, RolePassword, CommitteeEditor, RichMenuPanel } from "../ui/SettingsForms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  await seedCommitteeIfEmpty().catch(() => 0);
  const [cfg, committee, roster] = await Promise.all([getConfig(), readCommittee(), readRoster()]);
  const rosterLite = roster.map((r) => ({ sid: r.student_id, label: `${r.nickname} · ${r.full_name}`, nickname: r.nickname }));

  return (
    <div className="wrap">
      <PageHead icon="⚙️" title="ตั้งค่า" desc="ตั้งค่าทั้งหมดของระบบ — เก็บในแท็บ BC_config ของชีต (ไม่ต้องเข้า Vercel)" />

      <h2 style={{ marginTop: 0 }}>👑 กรรมการรุ่น</h2>
      <CommitteeEditor rows={committee.map((c) => ({ student_id: c.student_id, nickname: c.nickname, role: c.role, contact_url: c.contact_url }))} roster={rosterLite} />

      <h2>🔑 รหัสผ่านของแต่ละฝ่าย</h2>
      <div className="grid g2">
        <RolePassword role="finance" label="ฝ่ายการเงิน" enabled={!!cfg.finance_password_hash} />
        <RolePassword role="academic" label="ฝ่ายวิชาการ" enabled={!!cfg.academic_password_hash || !!process.env.ACADEMIC_PANEL_PASSWORD} />
      </div>

      <h2>📱 แอปสมาชิก</h2>
      <div className="card">
        <ConfigField k="portal_notice" label="ข้อความด่วนบนหัวแอป (ว่าง = ไม่แสดง)" value={cfg.portal_notice ?? ""} textarea placeholder="เช่น พรุ่งนี้งดเรียนช่วงบ่าย ตามประกาศคณะ" />
        <ConfigField k="semester_label" label="ชื่อภาคเรียน (แสดงในหน้าตาราง)" value={cfg.semester_label ?? ""} placeholder="เช่น ปี 2 ภาคเรียนที่ 1/2569" />
        <ConfigField k="red_zone_size" label="จำนวนคนใน Red Zone" value={cfg.red_zone_size ?? "6"} hint="อันดับแรก ๆ ของคะแนนสะสม (ค่าเริ่มต้น 6)" />
      </div>

      <h2>📲 เมนู LINE</h2>
      <RichMenuPanel />

      <h2>🔔 การเตือน & การอนุมัติ</h2>
      <div className="card">
        <ConfigField k="reminder_plan" label="เตือนก่อนเดดไลน์กี่วัน (คั่นด้วย ,)" value={cfg.reminder_plan ?? "3,1,0"} hint="0 = เช้าวันเดดไลน์ · ระบบร่างเข้ากล่องรอตรวจเวลา 08:00–21:00 น. และทักคุณใน LINE" />
        <ConfigField k="approver_line_ids" label="LINE user ID ของผู้อนุมัติ (พิมพ์ approve ได้)" value={cfg.approver_line_ids ?? ""} placeholder={process.env.ADMIN_LINE_USER_IDS ?? ""} hint="ว่าง = ใช้แอดมินจาก Vercel (ADMIN_LINE_USER_IDS)" />
      </div>

      <h2>ℹ️ ข้อมูลระบบ</h2>
      <div className="card">
        <div className="kv">
          <div>ลิงก์แอปสมาชิก</div><div><b>https://liff.line.me/2011755768-aSlCqo7l</b></div>
          <div>Service account (ใช้แชร์ชีต)</div><div><code>{process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}</code></div>
          <div>ชีตหลัก</div><div><a href={`https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`} target="_blank" rel="noreferrer">เปิด Google Sheet</a></div>
          <div>คำสั่งในแชตบอท (แอดมิน)</div><div className="hint" style={{ margin: 0 }}>approve · approve 123 · approve all · reject 123 · “ประกาศ …” (กรรมการส่งประกาศขึ้นแอป)</div>
        </div>
      </div>
    </div>
  );
}
