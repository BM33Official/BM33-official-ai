// สุ่มผู้เข้าร่วมกิจกรรมจาก red zone (BC_draws)
// - แอดมิน/ฝ่ายวิชาการสร้าง: ชื่อกิจกรรม + จำนวนที่ต้องการ + pool (ค่าเริ่มต้น = red zone สะสม)
// - ระบบสุ่มด้วย crypto ตอนสร้าง (บันทึกผลไว้เป็นความลับ) แล้ว "เล่นแอนิเมชัน" ตามเวลา show_at
// - ทุกคนเห็นหน้าต่างสุ่มแบบไม่ระบุชื่อ · เฉพาะคนใน pool ได้รู้ผลของตัวเองเมื่อถึง reveal_at
import { randomInt } from "crypto";
import { readKey, readKeyFresh, appendRecord, patchRecord, nowISO, newId, digits } from "@/lib/bc/sheets";
import { Draw } from "@/lib/bc/types";
import { ranking } from "@/lib/bc/academic";

export type DrawPhase = "upcoming" | "drawing" | "revealed" | "canceled";

const ids = (s: string) => String(s ?? "").split(",").map(digits).filter(Boolean);

export async function readDraws(force = false): Promise<Draw[]> {
  const rows = force ? await readKeyFresh<Draw>("draws") : await readKey<Draw>("draws");
  return rows.filter((d) => d.id);
}

export function drawPhase(d: Draw, now = Date.now()): DrawPhase {
  if (d.status === "canceled") return "canceled";
  const show = new Date(d.show_at).getTime() || 0;
  const reveal = new Date(d.reveal_at).getTime() || show;
  if (now < show) return "upcoming";
  if (now < reveal) return "drawing";
  return "revealed";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function defaultPool(): Promise<string[]> {
  const { rows } = await ranking();
  return rows.filter((r) => r.level === "red").map((r) => r.student_id);
}

export async function createDraw(input: {
  activity: string; need: number; pool?: string[]; showAt?: string; revealAt?: string; note?: string;
}): Promise<{ id: string; selected: string[]; pool: string[] }> {
  const pool = Array.from(new Set((input.pool?.length ? input.pool : await defaultPool()).map(digits).filter(Boolean)));
  if (!input.activity.trim()) throw new Error("ต้องใส่ชื่อกิจกรรม");
  if (pool.length === 0) throw new Error("ยังไม่มีใครใน pool (red zone ว่าง) — เลือกรายชื่อเองได้");
  const need = Math.max(1, Math.min(pool.length, Math.round(input.need || 1)));
  const selected = shuffle(pool).slice(0, need);
  const showAt = input.showAt && !isNaN(new Date(input.showAt).getTime()) ? new Date(input.showAt).toISOString() : new Date().toISOString();
  const reveal = input.revealAt && !isNaN(new Date(input.revealAt).getTime())
    ? new Date(input.revealAt).toISOString()
    : new Date(new Date(showAt).getTime() + 90_000).toISOString(); // ค่าเริ่มต้น: เปิดผล 90 วิหลังเริ่มสุ่ม
  const id = newId("DR");
  await appendRecord("draws", {
    id, activity: input.activity.trim(), need: String(need), pool_ids: pool.join(","), selected_ids: selected.join(","),
    status: "scheduled", show_at: showAt, reveal_at: reveal, created_at: nowISO(), note: input.note ?? "", notified: "",
  });
  return { id, selected, pool };
}

export async function cancelDraw(id: string): Promise<boolean> {
  const d = (await readDraws(true)).find((x) => x.id === id);
  if (!d?.__row) return false;
  await patchRecord("draws", d.__row, d as never, { status: "canceled" });
  return true;
}

export async function markDrawNotified(id: string, state: string): Promise<void> {
  const d = (await readDraws(true)).find((x) => x.id === id);
  if (d?.__row) await patchRecord("draws", d.__row, d as never, { notified: state });
}

// มุมมองสำหรับแอปสมาชิก — ไม่มีรายชื่อใครทั้งสิ้น ยกเว้นผลของตัวเอง
export interface DrawView {
  id: string;
  activity: string;
  need: number;
  poolSize: number;
  phase: DrawPhase;
  show_at: string;
  reveal_at: string;
  inPool: boolean;
  selected: boolean | null; // null = ยังไม่ถึงเวลาเปิดผล หรือไม่ได้อยู่ใน pool
}

export async function drawsForStudent(studentId: string, now = Date.now()): Promise<DrawView[]> {
  const sid = digits(studentId);
  const out: DrawView[] = [];
  for (const d of await readDraws()) {
    const phase = drawPhase(d, now);
    if (phase === "canceled") continue;
    const show = new Date(d.show_at).getTime();
    const reveal = new Date(d.reveal_at).getTime();
    // แสดงตั้งแต่ 30 นาทีก่อนเริ่ม จนถึง 3 วันหลังเปิดผล
    if (now < show - 30 * 60_000 || now > reveal + 3 * 86_400_000) continue;
    const pool = ids(d.pool_ids);
    const inPool = !!sid && pool.includes(sid);
    out.push({
      id: d.id,
      activity: d.activity,
      need: Number(d.need) || 0,
      poolSize: pool.length,
      phase,
      show_at: d.show_at,
      reveal_at: d.reveal_at,
      inPool,
      selected: inPool && phase === "revealed" ? ids(d.selected_ids).includes(sid) : null,
    });
  }
  return out.sort((a, b) => b.show_at.localeCompare(a.show_at));
}

export { ids as drawIds };
