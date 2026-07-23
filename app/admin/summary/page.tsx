import { requireAdmin } from "@/lib/bc/auth";
import { ensureBcTabs } from "@/lib/bc/sheets";
import { readSummaries } from "@/lib/bc/summary";
import SummaryPanel from "../ui/SummaryPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SummaryPage() {
  requireAdmin();
  await ensureBcTabs();
  const all = await readSummaries();
  const items = all
    .filter((s) => s.status === "pending" || s.status === "scheduled")
    .map((s) => ({ id: s.id, kind: s.kind, title: s.title, body: s.body, status: s.status, schedule_at: s.schedule_at ?? "", created_at: s.created_at }))
    .reverse();

  return (
    <div className="wrap">
      <h1>สรุป / รอส่ง</h1>
      <p className="sub">ศูนย์รวมข้อความอัตโนมัติที่ระบบร่างไว้ให้ตรวจก่อนส่งถึงทุกคน</p>

      <div className="grid g2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="row" style={{ gap: 8, marginBottom: 4 }}>
            <span className="badge b-warn">🔔 เตือนเดดไลน์</span>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            เมื่อมีข้อสอบ/งานใกล้ถึงกำหนด ระบบจะเด้งเตือนแอดมินทาง LINE ทันที และร่างข้อความมาโผล่ที่นี่ให้ตรวจก่อนส่งถึงเพื่อน ๆ
          </p>
        </div>
        <div className="card">
          <div className="row" style={{ gap: 8, marginBottom: 4 }}>
            <span className="badge b-blue">📋 สรุปสัปดาห์</span>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            AI รวบรวมงานค้าง เดดไลน์ และ red zone มาร่างเป็นสรุปประจำสัปดาห์ · แก้ได้ · เลือก “ส่งเลย” หรือ “ตั้งเวลาส่ง” ก็ได้
          </p>
        </div>
      </div>

      <SummaryPanel items={items} />
    </div>
  );
}
