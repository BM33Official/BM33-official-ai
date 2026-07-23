import { requireAuth } from "@/lib/bc/auth";
import { ensureBcTabs } from "@/lib/bc/sheets";
import { readExams, ranking, RED_ZONE_SIZE } from "@/lib/bc/academic";
import { readRoster } from "@/lib/bc/roster";
import ExamCreate from "../ui/ExamCreate";
import MarkGrid from "../ui/MarkGrid";
import AcademicBroadcast from "../ui/AcademicBroadcast";
import { bkkDate } from "@/lib/bc/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const digits = (s: string) => String(s ?? "").replace(/\D/g, "");

export default async function Academic({ searchParams }: { searchParams: { exam?: string } }) {
  requireAuth();
  await ensureBcTabs();
  const [exams, rank, roster] = await Promise.all([readExams(), ranking(), readRoster()]);
  const selected = searchParams?.exam ? exams.find((e) => e.exam_id === searchParams.exam) : undefined;
  const rows = roster.map((r) => ({ student_id: digits(r.student_id), nickname: r.nickname || r.full_name || digits(r.student_id), name: r.full_name || "" }));
  const initial = selected ? String(selected.not_memorized_ids ?? "").split(",").map(digits).filter(Boolean) : [];

  return (
    <div className="wrap">
      <h1>วิชาการ — ติดตามการท่องข้อสอบ</h1>
      <p className="sub">สร้างข้อสอบ → ติ๊กคนที่ยังไม่ท่อง → ระบบจัดอันดับ &amp; แจ้งเตือนอัตโนมัติ (red zone {RED_ZONE_SIZE} คน)</p>

      <div className="grid g2" style={{ marginBottom: 18 }}>
        <ExamCreate />
        <AcademicBroadcast />
      </div>

      <h2>ข้อสอบทั้งหมด</h2>
      <div className="card tablecard" style={{ marginBottom: 18 }}>
        {exams.length === 0 ? <p className="sub" style={{ margin: 0 }}>ยังไม่มีข้อสอบ — สร้างด้านบน</p> : (
          <table>
            <thead><tr><th>ชื่อ</th><th>วันสอบ</th><th>จำนวนข้อ</th><th>ยังไม่ท่อง</th><th></th></tr></thead>
            <tbody>
              {[...exams].reverse().map((e) => {
                const n = String(e.not_memorized_ids ?? "").split(",").filter(Boolean).length;
                return (
                  <tr key={e.exam_id}>
                    <td><b>{e.name}</b></td>
                    <td className="hint">{e.exam_date ? bkkDate(e.exam_date) : "-"}</td>
                    <td>{e.question_count || "-"}</td>
                    <td><span className="badge b-warn">{n}</span></td>
                    <td><a className="btn btn-sm" href={`/admin/academic?exam=${e.exam_id}`}>ทำเครื่องหมาย</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div style={{ marginBottom: 18 }}>
          <MarkGrid examId={selected.exam_id} examName={selected.name} rows={rows} initial={initial} />
        </div>
      )}

      <h2>อันดับการท่องข้อสอบ (คนพลาดมากอยู่บน)</h2>
      <div className="card tablecard">
        <table>
          <thead><tr><th>#</th><th>ชื่อเล่น</th><th>รหัส</th><th>พลาด (ครั้ง)</th><th>ข้อสอบที่พลาด</th><th>สถานะ</th></tr></thead>
          <tbody>
            {rank.rows.filter((r) => r.misses > 0).map((r, i) => (
              <tr key={r.student_id} style={r.redzone ? { background: "#ffe9e9" } : undefined}>
                <td>{i + 1}</td>
                <td><b>{r.nickname}</b>{!r.lineUserId && <span className="badge b-muted" style={{ marginLeft: 6 }}>ยังไม่ลงทะเบียน</span>}</td>
                <td className="hint">{r.student_id}</td>
                <td>{r.misses}</td>
                <td className="hint">{r.missedExams.join(", ")}</td>
                <td>{r.redzone ? <span className="badge b-danger">RED ZONE</span> : <span className="hint">ห่าง red zone {r.distanceToRed}</span>}</td>
              </tr>
            ))}
            {rank.rows.filter((r) => r.misses > 0).length === 0 && (
              <tr><td colSpan={6} className="sub">ยังไม่มีใครถูกทำเครื่องหมาย</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
