import { requireAuth } from "@/lib/bc/auth";
import { ensureBcTabs } from "@/lib/bc/sheets";
import { readSummaries } from "@/lib/bc/summary";
import SummaryPanel from "../ui/SummaryPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SummaryPage() {
  requireAuth();
  await ensureBcTabs();
  const all = await readSummaries();
  const pending = all
    .filter((s) => s.status === "pending")
    .map((s) => ({ id: s.id, kind: s.kind, title: s.title, body: s.body, created_at: s.created_at }))
    .reverse();

  return (
    <div className="wrap">
      <h1>สรุป / รอส่ง</h1>
      <p className="sub">AI สรุปงานรายสัปดาห์ + เตือนเดดไลน์ที่ใกล้ถึง มาให้ตรวจก่อนส่งถึงทุกคน — เพื่อน ๆ ก็ทักบอทถาม &quot;งานค้าง&quot; เพื่อดูงานของตัวเองได้</p>
      <SummaryPanel items={pending} />
    </div>
  );
}
