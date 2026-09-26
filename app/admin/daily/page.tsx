import { requireAdmin } from "@/lib/bc/auth";
import { readDailies, parseItems, currentDaily } from "@/lib/bc/daily";
import { bkkDayKey, thDateTime } from "@/lib/time";
import PageHead from "../ui/PageHead";
import DailyEditor from "../ui/DailyEditor";
import GenerateButton from "../ui/GenerateButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DailyPage() {
  await requireAdmin();
  const [all, cur] = await Promise.all([readDailies(true), currentDaily()]);
  const today = bkkDayKey();
  const hist = [...all].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  return (
    <div className="wrap">
      <PageHead icon="☀️" title="สรุปวันนี้" desc="การ์ด “สรุปวันนี้” บนหน้าแรกของแอป — AI ร่างใหม่ทุกเช้า 05:30 น. จากประกาศ ฟอร์ม ตารางเรียน สอบ และเงินรุ่น (ถ้าแก้เองแล้ว AI จะไม่เขียนทับ)"
        right={<GenerateButton action="daily.generate" label="✨ สร้างสรุปวันนี้ใหม่" />} />

      {cur ? (
        <>
          {cur.date !== today && <div className="msg msg-err">ตอนนี้แอปยังแสดงสรุปของวันที่ {cur.date} — กด “สร้างสรุปวันนี้ใหม่” หรือรอระบบสร้างรอบถัดไป</div>}
          <DailyEditor id={cur.id} headline={cur.headline} items={parseItems(cur.items)} status={cur.status} date={cur.date} />
        </>
      ) : (
        <div className="card"><p className="hint" style={{ margin: 0 }}>ยังไม่มีสรุป — กดปุ่มด้านบนเพื่อสร้างตอนนี้</p></div>
      )}

      <h2>ย้อนหลัง</h2>
      <div className="card tablecard">
        <table>
          <thead><tr><th>วันที่</th><th>ประโยคเปิด</th><th>รายการ</th><th>ที่มา</th><th>สถานะ</th><th>แก้ล่าสุด</th></tr></thead>
          <tbody>
            {hist.map((d) => (
              <tr key={d.id}><td>{d.date}</td><td>{d.headline}</td><td>{parseItems(d.items).length}</td><td className="hint">{d.source === "edited" ? "แก้โดยแอดมิน" : "AI"}</td><td><span className={`badge ${d.status === "live" ? "b-ok" : "b-muted"}`}>{d.status}</span></td><td className="hint">{thDateTime(d.updated_at)}</td></tr>
            ))}
            {hist.length === 0 && <tr><td colSpan={6} className="hint">ยังไม่มี</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
