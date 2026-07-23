// endpoint รวมสำหรับ mutation ทั้งหมดของ control center (ต้องล็อกอิน)
import { NextResponse } from "next/server";
import { isAuthed, adminLineIds } from "@/lib/bc/auth";
import { ensureBcTabs } from "@/lib/bc/sheets";
import { inspectResponseSheet, addForm } from "@/lib/bc/forms";
import { setStatus } from "@/lib/bc/status";
import {
  createBroadcast, patchBroadcast, getBroadcast, sendBroadcast, estimateRecipients,
} from "@/lib/bc/broadcast";
import { messageQuota } from "@/lib/line";
import {
  addExam, deleteExam, setNotMemorized, setNotFilled, scheduleDocReminder,
  academicBroadcast, academicPreview, getExam, AcademicMode,
} from "@/lib/bc/academic";
import {
  generateWeeklySummary, getSummary, sendSummaryToAll, updateSummary,
  scheduleSummary, unscheduleSummary,
} from "@/lib/bc/summary";
import { Broadcast } from "@/lib/bc/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAuthed()) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; [k: string]: unknown };
  const action = body.action ?? "";

  try {
    await ensureBcTabs();
    switch (action) {
      case "form.inspect":
        return NextResponse.json({ ok: true, ...(await inspectResponseSheet(String(body.link ?? ""))) });

      case "form.add": {
        const id = await addForm(body.form as Parameters<typeof addForm>[0]);
        return NextResponse.json({ ok: true, form_id: id });
      }

      case "broadcast.create": {
        const id = await createBroadcast(body.data as Partial<Broadcast>);
        return NextResponse.json({ ok: true, id });
      }

      case "broadcast.update": {
        const b = await getBroadcast(String(body.id));
        if (!b) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
        await patchBroadcast(b, body.patch as Partial<Broadcast>);
        return NextResponse.json({ ok: true });
      }

      case "broadcast.estimate": {
        const data = body.data as Partial<Broadcast>;
        const recipients = await estimateRecipients({
          segment_form_id: data.segment_form_id ?? "",
          segment_condition: data.segment_condition ?? "undone",
        } as Broadcast);
        const quota = await messageQuota();
        return NextResponse.json({ ok: true, count: recipients.length, quota });
      }

      case "broadcast.approveSend": {
        const b = await getBroadcast(String(body.id));
        if (!b) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
        // มีเวลานัด -> ตั้ง scheduled/approved ให้ cron ส่ง; ไม่มี -> ส่งเดี๋ยวนี้
        if (b.schedule_at) {
          await patchBroadcast(b, { status: "scheduled", approved_by: "admin" });
          return NextResponse.json({ ok: true, scheduled: true });
        }
        await patchBroadcast(b, { status: "approved", approved_by: "admin" });
        const fresh = await getBroadcast(b.id);
        const result = await sendBroadcast(fresh!, adminLineIds());
        return NextResponse.json({ ...result });
      }

      case "broadcast.delete": {
        const b = await getBroadcast(String(body.id));
        if (b) await patchBroadcast(b, { status: "canceled" });
        return NextResponse.json({ ok: true });
      }

      case "status.set": {
        await setStatus(
          String(body.student_id), String(body.form_id),
          body.state as "confirmed" | "none", "manual", String(body.note ?? "")
        );
        return NextResponse.json({ ok: true });
      }

      case "academic.addExam": {
        const id = await addExam({
          name: String(body.name ?? ""),
          exam_date: String(body.exam_date ?? ""),
          doc_link: String(body.doc_link ?? ""),
          doc_title: String(body.doc_title ?? ""),
        });
        return NextResponse.json({ ok: true, exam_id: id });
      }
      case "academic.deleteExam": {
        const ok = await deleteExam(String(body.examId ?? ""));
        return NextResponse.json({ ok });
      }
      case "academic.setMarks": {
        await setNotMemorized(String(body.examId), (body.ids as string[]) ?? []);
        return NextResponse.json({ ok: true });
      }
      case "academic.setNotFilled": {
        await setNotFilled(String(body.examId), (body.ids as string[]) ?? []);
        return NextResponse.json({ ok: true });
      }
      case "academic.scheduleDoc": {
        const ok = await scheduleDocReminder(String(body.examId ?? ""), String(body.at ?? ""));
        return NextResponse.json({ ok });
      }
      case "academic.preview": {
        const exam = body.examId ? await getExam(String(body.examId)) : null;
        const p = await academicPreview(body.mode as AcademicMode, exam);
        return NextResponse.json({ ok: true, ...p });
      }
      case "academic.broadcast": {
        const exam = body.examId ? await getExam(String(body.examId)) : null;
        const r = await academicBroadcast(body.mode as AcademicMode, body.testMode !== false, adminLineIds(), exam);
        return NextResponse.json({ ...r });
      }

      case "summary.generate": {
        const s = await generateWeeklySummary();
        return NextResponse.json({ ok: true, id: s.id });
      }
      case "summary.update": {
        const s = await getSummary(String(body.id));
        if (!s) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
        await updateSummary(s, body.patch as Record<string, string>);
        return NextResponse.json({ ok: true });
      }
      case "summary.schedule": {
        const ok = await scheduleSummary(String(body.id ?? ""), String(body.at ?? ""), body.body != null ? String(body.body) : undefined);
        return NextResponse.json({ ok });
      }
      case "summary.unschedule": {
        const ok = await unscheduleSummary(String(body.id ?? ""));
        return NextResponse.json({ ok });
      }
      case "summary.sendAll": {
        const r = await sendSummaryToAll(String(body.id), body.testMode !== false, adminLineIds());
        return NextResponse.json({ ...r });
      }
      case "summary.delete": {
        const s = await getSummary(String(body.id));
        if (s) await updateSummary(s, { status: "dismissed" });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
