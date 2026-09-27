import { requireAdmin } from "@/lib/bc/auth";
import { readForms } from "@/lib/bc/forms";
import { readBroadcasts } from "@/lib/bc/broadcast";
import Composer from "../ui/Composer";
import Link from "next/link";
import { MessageSquareText, ArrowLeft } from "lucide-react";
import { Head } from "../ui/kit";
import RowActions from "../ui/RowActions";
import { bkkDateTime } from "@/lib/bc/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  draft: "b-muted", pending: "b-warn", approved: "b-blue",
  scheduled: "b-blue", sent: "b-ok", canceled: "b-danger",
};
const STATUS_TH: Record<string, string> = {
  draft: "ร่าง", pending: "รออนุมัติ", approved: "อนุมัติแล้ว",
  scheduled: "ตั้งเวลา", sent: "ส่งแล้ว", canceled: "ยกเลิก",
};

export default async function Broadcasts({ searchParams }: { searchParams: { edit?: string } }) {
  await requireAdmin();
  const [forms, broadcasts] = await Promise.all([readForms(), readBroadcasts()]);
  const formOpts = forms.map((f) => ({ form_id: f.form_id, name: f.name }));
  const queue = [...broadcasts].reverse();
  const editing = searchParams?.edit ? broadcasts.find((b) => b.id === searchParams.edit) : undefined;

  return (
    <div className="wrap">
      <Head icon={MessageSquareText} tone="line" title="ข้อความ LINE ขั้นสูง" sub="ออกแบบการ์ด/รูป ตั้งเวลา ส่งซ้ำอัตโนมัติ — เรื่องทั่วไปใช้หน้าประกาศ แล้วติ๊ก “ส่ง LINE ด้วย” ง่ายกว่า"
        right={<Link href="/admin/announcements" className="btn btn-sm"><ArrowLeft size={15} /> กลับไปประกาศ</Link>} />

      <Composer forms={formOpts} initial={editing} />

      <h2>คิว & ประวัติ</h2>
      <div className="card tablecard">
        {queue.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>ยังไม่มีบรอดแคสต์</p>
        ) : (
          <table>
            <thead><tr><th>ข้อความ</th><th>ส่งถึง</th><th>สถานะ</th><th>เวลา</th><th>ผล</th><th></th></tr></thead>
            <tbody>
              {queue.map((b) => {
                const res = b.result_json ? (JSON.parse(b.result_json) as { count?: number; testMode?: boolean }) : null;
                return (
                  <tr key={b.id}>
                    <td><b>{b.title || b.body_text.slice(0, 30) || "(ว่าง)"}</b>{b.test_mode === "1" && <span className="badge b-muted" style={{ marginLeft: 6 }}>ทดสอบ</span>}</td>
                    <td className="hint">{b.segment_form_id ? forms.find((f) => f.form_id === b.segment_form_id)?.name || "ฟอร์ม" : "ทุกคน"} · {b.segment_condition}</td>
                    <td><span className={`badge ${STATUS_BADGE[b.status] || "b-muted"}`}>{STATUS_TH[b.status] || b.status}</span></td>
                    <td className="hint">{b.schedule_at ? bkkDateTime(b.schedule_at) : b.sent_at ? bkkDateTime(b.sent_at) : "-"}</td>
                    <td className="hint">{res ? `${res.count} คน${res.testMode ? " (ทดสอบ)" : ""}` : "-"}</td>
                    <td><RowActions id={b.id} status={b.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
