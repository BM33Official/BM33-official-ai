import { requireRole } from "@/lib/bc/auth";
import { readExams, ranking } from "@/lib/bc/academic";
import { readDraws, drawPhase, drawIds } from "@/lib/bc/draws";
import DrawPanel from "../ui/DrawPanel";
import PageHead from "../ui/PageHead";
import { thDateTime } from "@/lib/time";
import { readRoster } from "@/lib/bc/roster";
import ExamCreate from "../ui/ExamCreate";
import ExamActions from "../ui/ExamActions";
import MarkGrid from "../ui/MarkGrid";
import DocReminder from "../ui/DocReminder";
import AcademicBroadcast from "../ui/AcademicBroadcast";
import { bkkDate } from "@/lib/bc/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const digits = (s: string) => String(s ?? "").replace(/\D/g, "");

export default async function Academic({ searchParams }: { searchParams: { exam?: string } }) {
  await requireRole("academic");
  const [exams, rank, roster, draws] = await Promise.all([readExams(), ranking(), readRoster(), readDraws(true)]);
  const RED_ZONE_SIZE = rank.size;
  const drawRows = [...draws].reverse().slice(0, 12).map((d) => ({
    id: d.id, activity: d.activity, need: Number(d.need) || 0, pool: drawIds(d.pool_ids), selected: drawIds(d.selected_ids),
    status: d.status, phase: drawPhase(d), show: thDateTime(d.show_at), reveal: thDateTime(d.reveal_at), notified: d.notified,
  }));
  const people = rank.rows.map((r) => ({ sid: r.student_id, nickname: r.nickname, level: r.level, misses: r.misses }));
  const selected = searchParams?.exam ? exams.find((e) => e.exam_id === searchParams.exam) : undefined;
  const rows = roster.map((r) => ({ student_id: digits(r.student_id), nickname: r.nickname || r.full_name || digits(r.student_id), name: r.full_name || "" }));
  const initial = selected ? String(selected.not_memorized_ids ?? "").split(",").map(digits).filter(Boolean) : [];
  const initialDoc = selected ? String(selected.not_filled_ids ?? "").split(",").map(digits).filter(Boolean) : [];
  const examsLite = exams.map((e) => ({
    exam_id: e.exam_id, name: e.name, doc_link: e.doc_link ?? "", doc_title: e.doc_title ?? "",
    doc_reminder_at: e.doc_reminder_at ?? "", doc_reminder_status: e.doc_reminder_status ?? "",
  }));

  return (
    <div className="wrap">
      <PageHead icon="📘" title="วิชาการ & Red Zone" desc={`ติดตามการจำข้อสอบของทั้งรุ่น — Red Zone คิดแบบสะสมทุกข้อสอบ (ข้อสอบล่าสุดมีน้ำหนักมากกว่า) · ${RED_ZONE_SIZE} อันดับแรก = Red Zone · สมาชิกเห็นเฉพาะสถานะของตัวเองในแอป`}
        steps={["สร้างข้อสอบ", "ติ๊กคนที่ยังไม่ได้จำ", "ดูอันดับ / ส่งข้อความ / สุ่มผู้เข้าร่วม"]} />

      <div className="grid g2" style={{ marginBottom: 18 }}>
        <ExamCreate />
        <AcademicBroadcast exams={examsLite} />
      </div>

      <h2>ข้อสอบทั้งหมด</h2>
      <div className="card tablecard" style={{ marginBottom: 18 }}>
        {exams.length === 0 ? <p className="sub" style={{ margin: 0, padding: 14 }}>ยังไม่มีข้อสอบ — สร้างด้านบน</p> : (
          <table>
            <thead><tr><th>ชื่อ</th><th>วันสอบ</th><th>เอกสารแบ่งข้อ</th><th>ยังไม่ได้จำ</th><th></th></tr></thead>
            <tbody>
              {[...exams].reverse().map((e) => {
                const n = String(e.not_memorized_ids ?? "").split(",").filter(Boolean).length;
                return (
                  <tr key={e.exam_id}>
                    <td><b>{e.name}</b></td>
                    <td className="hint">{e.exam_date ? bkkDate(e.exam_date) : "-"}</td>
                    <td>{e.doc_link
                      ? <a className="badge b-blue" href={e.doc_link} target="_blank" rel="noopener noreferrer">มีลิงก์ ↗</a>
                      : <span className="badge b-muted">ไม่มี</span>}</td>
                    <td><span className="badge b-warn">{n}</span></td>
                    <td><ExamActions examId={e.exam_id} examName={e.name} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="grid" style={{ marginBottom: 18, gap: 14 }}>
          <MarkGrid examId={selected.exam_id} examName={selected.name} rows={rows} initial={initial} variant="memorize" />
          {selected.doc_link && (
            <>
              <MarkGrid examId={selected.exam_id} examName={selected.name} rows={rows} initial={initialDoc} variant="doc" />
              <DocReminder examId={selected.exam_id} />
            </>
          )}
        </div>
      )}

      <h2>🎲 สุ่มผู้เข้าร่วมกิจกรรม</h2>
      <DrawPanel people={people} draws={drawRows} />

      <h2>อันดับการจำข้อสอบ (คะแนนสะสม — มากอยู่บน)</h2>
      <div className="card tablecard">
        <table>
          <thead><tr><th>#</th><th>ชื่อเล่น</th><th>รหัส</th><th>พลาด (ครั้ง)</th><th>คะแนนสะสม</th><th>ข้อสอบที่พลาด</th><th>สถานะ</th></tr></thead>
          <tbody>
            {rank.rows.filter((r) => r.misses > 0).map((r, i) => (
              <tr key={r.student_id} style={r.redzone ? { background: "#fff1f1" } : undefined}>
                <td>{i + 1}</td>
                <td><b>{r.nickname}</b>{!r.lineUserId && <span className="badge b-muted" style={{ marginLeft: 6 }}>ยังไม่ลงทะเบียน</span>}</td>
                <td className="hint">{r.student_id}</td>
                <td>{r.misses}</td>
                <td>{r.score}</td>
                <td className="hint">{r.missedExams.join(", ")}</td>
                <td>{r.level === "red" ? <span className="badge b-danger">RED ZONE</span> : r.level === "close" ? <span className="badge b-warn">ใกล้ Red Zone</span> : <span className="badge b-muted">เฝ้าระวัง</span>}</td>
              </tr>
            ))}
            {rank.rows.filter((r) => r.misses > 0).length === 0 && (
              <tr><td colSpan={7} className="sub">ยังไม่มีใครถูกทำเครื่องหมาย</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
