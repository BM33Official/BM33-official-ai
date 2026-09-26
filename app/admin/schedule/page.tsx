import { requireRole } from "@/lib/bc/auth";
import { readSchedule, readUniExams, readUploads } from "@/lib/bc/schedule";
import { bkkDayKey, thDateTime } from "@/lib/time";
import PageHead from "../ui/PageHead";
import TimetableUpload from "../ui/TimetableUpload";
import ScheduleTable from "../ui/ScheduleTable";
import UniExamTable from "../ui/UniExamTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SchedulePage({ searchParams }: { searchParams: { m?: string } }) {
  await requireRole("admin");
  const [sched, exams, uploads] = await Promise.all([readSchedule(true), readUniExams(true), readUploads()]);
  const pendingUploads = uploads.filter((u) => u.status === "parsed").reverse();
  const live = sched.filter((s) => s.status === "live");
  const months = Array.from(new Set(live.map((s) => s.date.slice(0, 7)).filter(Boolean))).sort();
  const cur = searchParams.m ?? (months.find((m) => m >= bkkDayKey().slice(0, 7)) ?? months.at(-1) ?? "");
  const shown = live.filter((s) => s.date.startsWith(cur)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const strip = (s: typeof sched[number]) => ({ id: s.id, date: s.date, start: s.start, end: s.end, subject: s.subject, topic: s.topic, lecturer: s.lecturer, building: s.building, room: s.room, kind: s.kind, status: s.status, block: s.block, note: s.note });

  return (
    <div className="wrap">
      <PageHead icon="🗓" title="ตารางเรียน & สอบ" desc="ข้อมูลในแท็บ “ตาราง” และตัวนับถอยหลังสอบบนหน้าแรกของแอป"
        steps={["อัปโหลดไฟล์ตารางของ block", "ตรวจ/แก้ในตาราง “รอตรวจ”", "กดเผยแพร่ขึ้นแอป"]} />

      <TimetableUpload />

      {pendingUploads.map((u) => {
        const rows = sched.filter((s) => s.upload_id === u.id && s.status === "draft");
        if (!rows.length) return null;
        return (
          <div key={u.id}>
            <h2>🟡 รอตรวจ: {u.block} <span className="hint" style={{ fontWeight: 600 }}>· {u.filename} · {u.summary} · {thDateTime(u.created_at)}</span></h2>
            <ScheduleTable rows={rows.map(strip)} uploadId={u.id} allowAdd block={u.block} />
          </div>
        );
      })}

      <h2>📝 สอบของมหาวิทยาลัย (นับถอยหลังบนแอป)</h2>
      <p className="hint" style={{ marginTop: -6 }}>สอบที่ AI เจอในไฟล์จะมาอยู่ที่นี่เป็น “ร่าง” — เปลี่ยนเป็น “แสดง” เพื่อให้ขึ้นตัวนับถอยหลัง · ระบบจะร่างข้อความเตือนก่อนสอบ 3 วัน และ 1 วัน ให้อนุมัติ</p>
      <UniExamTable rows={exams.map((e) => ({ id: e.id, name: e.name, date: e.date, start: e.start, end: e.end, building: e.building, room: e.room, block: e.block, note: e.note, status: e.status }))} />

      <h2>✅ ตารางที่แสดงบนแอป</h2>
      <div className="pill-tabs">
        {months.map((m) => <a key={m} href={`?m=${m}`} className={m === cur ? "on" : ""}>{m}</a>)}
        {months.length === 0 && <span className="hint" style={{ padding: 8 }}>ยังไม่มีตารางที่เผยแพร่</span>}
      </div>
      <ScheduleTable key={cur} rows={shown.map(strip)} allowAdd />
    </div>
  );
}
