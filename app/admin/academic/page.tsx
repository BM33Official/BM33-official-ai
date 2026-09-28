// วิชาการ & Red Zone — ① ดูโซนทั้งรุ่นในแวบเดียว ② ตรวจจำข้อสอบด้วย AI ③ ส่งข้อความ/สุ่มคน (ของเสริม)
import Link from "next/link";
import { GraduationCap, Flame, ScanSearch, MessageCircle, Dices, ListOrdered, Plus, Hand } from "lucide-react";
import { requireRole } from "@/lib/bc/auth";
import { readExams, ranking } from "@/lib/bc/academic";
import { readDraws, drawPhase, drawIds } from "@/lib/bc/draws";
import { readRoster } from "@/lib/bc/roster";
import { thDateTime } from "@/lib/time";
import { bkkDate } from "@/lib/bc/format";
import { Head, Sq, Empty } from "../ui/kit";
import DrawPanel from "../ui/DrawPanel";
import ExamCreate from "../ui/ExamCreate";
import ExamActions from "../ui/ExamActions";
import MarkGrid from "../ui/MarkGrid";
import AcademicBroadcast from "../ui/AcademicBroadcast";
import LiveSync from "../ui/LiveSync";
import RecallWizard from "../ui/RecallWizard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const digits = (s: string) => String(s ?? "").replace(/\D/g, "");
const LEVEL_TH = { red: "Red Zone", close: "ใกล้ Red Zone", watch: "เฝ้าระวัง", safe: "ปลอดภัย" } as const;

export default async function Academic({ searchParams }: { searchParams: { exam?: string } }) {
  const role = await requireRole("academic");
  // ฝ่ายวิชาการเห็นแค่ว่า "มีเงินรุ่นค้าง" (ไม่เห็นเดือน/ยอด) — รายละเอียดอยู่หน้าการเงิน
  const [exams, rank, roster, draws] = await Promise.all([readExams(), ranking(), readRoster(), readDraws(true)]);
  const byNew = [...exams].sort((a, b) => (b.exam_date || b.created_at || "").localeCompare(a.exam_date || a.created_at || ""));
  const selected = searchParams?.exam ? exams.find((e) => e.exam_id === searchParams.exam) : byNew[0];
  const levelOf = new Map(rank.rows.map((r) => [r.student_id, r]));
  const students = roster.map((r) => ({ sid: digits(r.student_id), no: Number(digits(r.student_id).slice(-3)), nickname: r.nickname || r.full_name })).sort((a, b) => a.no - b.no);
  const counts = { red: 0, close: 0, watch: 0, safe: 0 };
  for (const r of rank.rows) counts[r.level]++;

  const drawRows = [...draws].reverse().slice(0, 12).map((d) => ({
    id: d.id, activity: d.activity, need: Number(d.need) || 0, pool: drawIds(d.pool_ids), selected: drawIds(d.selected_ids),
    status: d.status, phase: drawPhase(d), show: thDateTime(d.show_at), reveal: thDateTime(d.reveal_at), notified: d.notified,
  }));
  const people = rank.rows.map((r) => ({ sid: r.student_id, nickname: r.nickname, level: r.level, misses: r.misses }));
  const hasAny = (r: (typeof rank.rows)[number]) => r.misses > 0 || r.feeMisses > 0;
  const rows = roster.map((r) => ({ student_id: digits(r.student_id), nickname: r.nickname || r.full_name || digits(r.student_id), name: r.full_name || "" }));
  const initial = selected ? String(selected.not_memorized_ids ?? "").split(",").map(digits).filter(Boolean) : [];
  const accepted = selected ? String(selected.accepted_ids ?? "").split(",").map(digits).filter(Boolean) : [];
  const examsLite = byNew.map((e) => {
    const acc = new Set(String(e.accepted_ids ?? "").split(",").map(digits));
    return {
      exam_id: e.exam_id, name: e.name, date: e.exam_date ?? "", doc_link: e.doc_link ?? "",
      pending: String(e.not_memorized_ids ?? "").split(",").map(digits).filter((x) => x && !acc.has(x)).length,
      doc_reminder_at: e.doc_reminder_at ?? "", doc_reminder_status: e.doc_reminder_status ?? "",
    };
  });
  const strikes = (r: (typeof rank.rows)[number]) => r.misses + r.feeMisses;

  return (
    <div className="wrap">
      <Head icon={GraduationCap} tone="purple" title="วิชาการ & Red Zone" sub="สร้างข้อสอบ → AI หรือคุณติ๊กว่าใครยังไม่ได้กรอก → ส่งเตือนได้ทันที · ค้าง 1 = เฝ้าระวัง · 2 = ใกล้ · 3 ขึ้นไป = Red Zone" />
      <div style={{ marginTop: -8, marginBottom: 14 }}><LiveSync /></div>

      <div className="card">
        <div className="card-h">
          <h3 className="row" style={{ gap: 10, margin: 0 }}><Sq icon={Flame} tone="red" /> Red Zone ตอนนี้</h3>
          <div className="row" style={{ gap: 18 }}>
            <span><span className="bignum" style={{ color: "var(--red-ink)", fontSize: 30 }}>{counts.red}</span> <span className="hint">คน</span></span>
            <span><span className="bignum" style={{ color: "var(--orange-ink)", fontSize: 30 }}>{counts.close}</span> <span className="hint">ใกล้</span></span>
          </div>
        </div>
        <div className="dots zone-dots">
          {students.map((s) => {
            const r = levelOf.get(s.sid);
            const lv = r?.level ?? "safe";
            return <span key={s.sid} className={`d ${lv === "safe" ? "none" : lv}`} title={`${s.nickname} · ${LEVEL_TH[lv]}${r?.misses ? ` · ยังไม่ได้กรอก ${r.misses} ข้อสอบ` : ""}${r?.feeMisses ? " · เงินรุ่นค้าง" : ""}`}>{s.no}</span>;
          })}
        </div>
        <div className="legend" style={{ marginTop: 12 }}>
          <span><i style={{ background: "#ff3b30" }} />Red Zone {counts.red}</span><span><i style={{ background: "#ff9500" }} />ใกล้ {counts.close}</span>
          <span><i style={{ background: "#ffd60a" }} />เฝ้าระวัง {counts.watch}</span><span><i style={{ background: "#e5e5ea" }} />ปลอดภัย {counts.safe}</span>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>นับ “ค้าง” = ข้อสอบที่ยังไม่ได้กรอก + เดือนเงินรุ่นที่เลยกำหนด · ค้าง 1 = เฝ้าระวัง · 2 = ใกล้ · 3 ขึ้นไป = Red Zone · เพื่อนแต่ละคนเห็นเฉพาะของตัวเองในแอป (แตะแล้วเห็นว่าค้างข้อสอบไหน ไปกรอกหรือกด “ยอมโดน” ได้)</div>
      </div>

      <h2 className="row" style={{ gap: 10 }}><Sq icon={ScanSearch} tone="blue" /> ตรวจจำข้อสอบ</h2>
      <div className="seg" style={{ maxWidth: "100%", overflowX: "auto", flexWrap: "nowrap" }}>
        {byNew.slice(0, 8).map((e) => <Link key={e.exam_id} href={`/admin/academic?exam=${e.exam_id}`} className={selected?.exam_id === e.exam_id ? "on" : ""} style={{ whiteSpace: "nowrap" }}>{e.name}</Link>)}
        <Link href="/admin/academic?exam=new" className={searchParams?.exam === "new" ? "on" : ""} style={{ whiteSpace: "nowrap" }}><Plus size={14} /> ข้อสอบใหม่</Link>
      </div>
      {searchParams?.exam === "new" || !selected ? <ExamCreate /> : (
        <>
          <div className="row between" style={{ marginBottom: 10 }}>
            <div><b style={{ fontSize: 18 }}>{selected.name}</b> <span className="hint">{selected.exam_date ? bkkDate(selected.exam_date) : ""}{selected.check_at ? ` · ตรวจล่าสุด ${thDateTime(selected.check_at)}` : ""} · ยังไม่ได้กรอก {initial.length} คน{accepted.length ? ` (ยอมโดน ${accepted.length})` : ""}</span></div>
            <ExamActions examId={selected.exam_id} examName={selected.name} />
          </div>
          <RecallWizard key={selected.exam_id} exam={{ id: selected.exam_id, name: selected.name, assign: selected.assign_json ?? "", count: Number(selected.question_count2) || 0 }} students={students} initialIds={initial} />
          <details className="more">
            <summary><Hand size={16} /> ติ๊กเองทีละคน (ไม่ใช้ AI) — ใครยังไม่ได้กรอก</summary>
            <div className="stack" style={{ marginTop: 10 }}>
              <MarkGrid examId={selected.exam_id} examName={selected.name} rows={rows} initial={initial} accepted={accepted} />
            </div>
          </details>
          {/* ตามเตือนเฉพาะข้อสอบนี้ — ตัวเลขอัปเดตทันทีหลังบันทึก */}
          <div style={{ marginTop: 12 }}><AcademicBroadcast key={selected.exam_id} exams={examsLite} lockExam={selected.exam_id} version={initial.join(",") + "|" + accepted.join(",")} /></div>
        </>
      )}
      {exams.length === 0 && searchParams?.exam !== "new" && <div className="hint" style={{ marginTop: 8 }}>ยังไม่มีข้อสอบ — ตั้งชื่อด้านบนแล้วกดสร้าง</div>}

      <h2 className="row" style={{ gap: 10 }}><Sq icon={MessageCircle} tone="line" /> ส่งข้อความถึงเพื่อน <span className="hint" style={{ fontWeight: 500 }}>เลือก 1 ใน 3 แบบ · กดส่งแล้วถึงเพื่อนทันที</span></h2>
      <AcademicBroadcast exams={examsLite} />

      <details className="more" style={{ marginTop: 22 }}>
        <summary><Dices size={16} /> สุ่มผู้เข้าร่วมกิจกรรม</summary>
        <div style={{ marginTop: 10 }}><DrawPanel people={people} draws={drawRows} /></div>
      </details>
      <details className="more">
        <summary><ListOrdered size={16} /> อันดับเต็ม (เรียงตามคะแนนสะสม — ข้อสอบล่าสุดมีน้ำหนักมากกว่า · สีตามจำนวนที่ค้าง)</summary>
        {rank.rows.some(hasAny) ? (
          <div className="list" style={{ marginTop: 10 }}>
            {rank.rows.filter(hasAny).map((r, i) => (
              <div key={r.student_id} className="li">
                <span className={`ic ${r.level === "red" ? "c-red" : r.level === "close" ? "c-orange" : "c-yellow"}`} style={{ fontWeight: 800, fontSize: 13 }}>{i + 1}</span>
                <div className="li-b"><b>{r.nickname} <span className="hint">#{Number(r.student_id.slice(-3))}</span>{!r.lineUserId && <span className="badge" style={{ marginLeft: 6 }}>ยังไม่ลงทะเบียน</span>}</b><small>ค้าง {strikes(r)} · {r.misses > 0 ? `ยังไม่ได้กรอก ${r.misses} ข้อสอบ · ` : ""}{r.feeMisses > 0 ? `💸 เงินรุ่นค้าง${role === "admin" ? ` ${r.feeMonths.join(", ")}` : ""} · ` : ""}คะแนน {r.score}{r.missedExams.length ? ` · ${r.missedExams.join(", ")}` : ""}</small></div>
                <span className={`badge ${r.level === "red" ? "b-red" : r.level === "close" ? "b-orange" : ""}`}>{LEVEL_TH[r.level]}</span>
              </div>
            ))}
          </div>
        ) : <div className="card" style={{ marginTop: 10 }}><Empty icon={GraduationCap} title="ยังไม่มีใครถูกนับ" sub="ตรวจข้อสอบแรกด้านบน" /></div>}
      </details>
    </div>
  );
}
