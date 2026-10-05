// endpoint รวมสำหรับ mutation ทั้งหมดของ control center (ต้องล็อกอิน + ตรวจสิทธิ์ตามบทบาท)
import { NextResponse } from "next/server";
import { currentRole, adminLineIds, roleCan, ROLE_LABEL } from "@/lib/bc/auth";
import { ensureBcTabs, digits } from "@/lib/bc/sheets";
import { inspectResponseSheet, addForm, getForm, updateForm } from "@/lib/bc/forms";
import { setStatus } from "@/lib/bc/status";
import {
  createBroadcast, patchBroadcast, getBroadcast, sendBroadcast, estimateRecipients,
} from "@/lib/bc/broadcast";
import { messageQuota } from "@/lib/line";
import {
  addExam, deleteExam, setNotMemorized, setNotFilled, scheduleDocReminder,
  academicBroadcast, academicPreview, getExam, AcademicMode, normMode,
} from "@/lib/bc/academic";
import {
  generateWeeklySummary, getSummary, sendSummaryToAll, updateSummary,
  scheduleSummary, unscheduleSummary,
} from "@/lib/bc/summary";
import {
  parseAnnouncement, createAnnouncement, updateAnnouncement, getAnnouncement, extractUrls, bulkUpdateAnnouncements,
} from "@/lib/bc/announcements";
import { generateDaily, updateDaily } from "@/lib/bc/daily";
import { saveScheduleRows, saveUniExamRows, publishUpload, readSchedule } from "@/lib/bc/schedule";
import { approveAndSend, rejectOutbox, updateOutboxText, reminderMessages } from "@/lib/bc/outbox";
import { addReminder } from "@/lib/bc/reminders";
import {
  upsertMonth, deleteMonth, applyPayments, markYearly, inspectFinanceSheet, importFinanceSheet, queueUnpaidReminder, PayChange,
} from "@/lib/bc/fees";
import { createDraw, cancelDraw } from "@/lib/bc/draws";
import { setConfig, hashPassword, ConfigKey } from "@/lib/bc/config";
import { saveCommittee } from "@/lib/bc/committee-admin";
import { answer } from "@/lib/ai/answer";
import { listFlashModels, activeModel } from "@/lib/gemini";
import { archivePack } from "@/lib/ai/knowledge";
import { readRoster } from "@/lib/bc/roster";
import { bust } from "@/lib/cache";
import { richMenuStatus, createRichMenuV2, linkRichMenu, unlinkRichMenu, setDefaultRichMenu } from "@/lib/bc/richmenu";
import { approverIds } from "@/lib/bc/config";
import { Broadcast, DailyItem, ScheduleItem, UniExam, Announcement } from "@/lib/bc/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONFIG_KEYS: ConfigKey[] = [
  "gemini_model", "approver_line_ids", "payment_info", "payment_link", "finance_sheet_link",
  "red_zone_size", "reminder_plan", "portal_notice", "semester_label", "president_student_id",
  "ai_budget_usd", "ai_price_json", "ai_user_daily_cap", "linktree_url", "payment_account_name", "payment_account_no", "slip_auto_approve", "usd_thb",
  "red_zone_enabled", "learn_groups",
];

export async function POST(req: Request) {
  const role = await currentRole();
  if (!role) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; [k: string]: unknown };
  const action = body.action ?? "";
  if (!roleCan(role, action)) {
    return NextResponse.json({ ok: false, error: `${ROLE_LABEL[role]}ใช้คำสั่งนี้ไม่ได้` }, { status: 403 });
  }
  const by = role === "admin" ? "admin" : role;
  const j = (x: Record<string, unknown>) => NextResponse.json({ ok: true, ...x });
  const acadOpts = (b: Record<string, unknown>) => ({
    template: b.template as string | undefined, link: b.link as string | undefined,
    examIds: Array.isArray(b.examIds) ? (b.examIds as unknown[]).map(String) : b.examId ? [String(b.examId)] : undefined,
  });

  try {
    await ensureBcTabs();
    switch (action) {
      // ── ฟอร์ม ─────────────────────────────────────────────────────────────
      case "form.inspect":
        return j({ ...(await inspectResponseSheet(String(body.link ?? ""))) });
      case "form.add":
        return j({ form_id: await addForm(body.form as Parameters<typeof addForm>[0]) });
      case "form.update": {
        const f = await getForm(String(body.id));
        if (!f) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
        await updateForm(f, body.patch as Record<string, string>);
        bust(`form:${f.form_id}`);
        return j({});
      }

      case "form.approveAll": {
        const f = await getForm(String(body.id));
        if (!f) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
        const { confirmAllClaims } = await import("@/lib/bc/status");
        const n = await confirmAllClaims(f.form_id, by);
        if (body.trust === true) await updateForm(f, { trust_claims: "1" });
        return j({ n });
      }
      case "form.trust": {
        const f = await getForm(String(body.id));
        if (!f) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
        await updateForm(f, { trust_claims: body.on === true ? "1" : "" });
        return j({});
      }
      case "form.remind": {
        const f = await getForm(String(body.id));
        if (!f) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
        // เข้า "เตือนรวม" รายการเดียว — ไปกดส่งที่ รออนุมัติ
        return j({ ...(await addReminder(`form:${f.form_id}`)) });
      }

      // ── บรอดแคสต์ (เดิม) ────────────────────────────────────────────────────
      case "broadcast.create":
        return j({ id: await createBroadcast(body.data as Partial<Broadcast>) });
      case "broadcast.update": {
        const b = await getBroadcast(String(body.id));
        if (!b) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
        await patchBroadcast(b, body.patch as Partial<Broadcast>);
        return j({});
      }
      case "broadcast.estimate": {
        const data = body.data as Partial<Broadcast>;
        const recipients = await estimateRecipients({
          segment_form_id: data.segment_form_id ?? "", segment_condition: data.segment_condition ?? "undone",
        } as Broadcast);
        return j({ count: recipients.length, quota: await messageQuota() });
      }
      case "broadcast.approveSend": {
        const b = await getBroadcast(String(body.id));
        if (!b) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
        if (b.schedule_at) {
          await patchBroadcast(b, { status: "scheduled", approved_by: by });
          return j({ scheduled: true });
        }
        await patchBroadcast(b, { status: "approved", approved_by: by });
        const fresh = await getBroadcast(b.id);
        return NextResponse.json({ ...(await sendBroadcast(fresh!, adminLineIds())) });
      }
      case "broadcast.delete": {
        const b = await getBroadcast(String(body.id));
        if (b) await patchBroadcast(b, { status: "canceled" });
        return j({});
      }
      case "status.set":
        await setStatus(String(body.student_id), String(body.form_id), body.state as "confirmed" | "none", "manual", String(body.note ?? ""));
        return j({});

      // ── วิชาการ ────────────────────────────────────────────────────────────
      case "academic.addExam":
        return j({ exam_id: await addExam({ name: String(body.name ?? ""), exam_date: String(body.exam_date ?? ""), doc_link: String(body.doc_link ?? ""), doc_title: String(body.doc_title ?? "") }) });
      case "academic.deleteExam":
        return NextResponse.json({ ok: await deleteExam(String(body.examId ?? "")) });
      case "academic.setMarks":
        await setNotMemorized(String(body.examId), (body.ids as string[]) ?? []);
        return j({});
      case "academic.setNotFilled":
        await setNotFilled(String(body.examId), (body.ids as string[]) ?? []);
        return j({});
      case "academic.saveCheck": {
        const { saveCheck } = await import("@/lib/bc/recall");
        return NextResponse.json({ ok: await saveCheck(String(body.examId ?? ""), (body.map as Record<string, number[]>) ?? {}, ((body.filled as number[]) ?? []).map(Number), (body.ids as string[]) ?? [], Number(body.count) || 0) });
      }
      case "academic.scheduleDoc":
        return NextResponse.json({ ok: await scheduleDocReminder(String(body.examId ?? ""), String(body.at ?? ""), String(body.template ?? "")) });
      case "academic.preview": {
        const p = await academicPreview(normMode(String(body.mode)), acadOpts(body));
        return j({ ...p });
      }
      case "academic.broadcast": {
        // ฝ่ายวิชาการกดส่ง = ส่งถึงเพื่อนทันที (ไม่ต้องรอแอดมินอนุมัติ) · ยังบันทึกประวัติใน รออนุมัติ > ประวัติ
        const r = await academicBroadcast(normMode(String(body.mode)), body.testMode !== false, adminLineIds(), { ...acadOpts(body), by: `${role}:web` });
        return NextResponse.json({ ...r });
      }
      case "draw.create": {
        const r = await createDraw({
          activity: String(body.activity ?? ""), need: Number(body.need ?? 1),
          pool: ((body.pool as string[]) ?? []).map(digits), showAt: String(body.showAt ?? ""), revealAt: String(body.revealAt ?? ""), note: String(body.note ?? ""),
        });
        return j({ id: r.id, selected: r.selected, poolSize: r.pool.length });
      }
      case "draw.cancel":
        return NextResponse.json({ ok: await cancelDraw(String(body.id ?? "")) });

      // ── สรุปเดิม (ยังใช้ได้) ────────────────────────────────────────────────
      case "summary.generate":
        return j({ id: (await generateWeeklySummary()).id });
      case "summary.update": {
        const s = await getSummary(String(body.id));
        if (!s) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
        await updateSummary(s, body.patch as Record<string, string>);
        return j({});
      }
      case "summary.schedule":
        return NextResponse.json({ ok: await scheduleSummary(String(body.id ?? ""), String(body.at ?? ""), body.body != null ? String(body.body) : undefined) });
      case "summary.unschedule":
        return NextResponse.json({ ok: await unscheduleSummary(String(body.id ?? "")) });
      case "summary.sendAll":
        return NextResponse.json({ ...(await sendSummaryToAll(String(body.id), body.testMode !== false, adminLineIds())) });
      case "summary.delete": {
        const s = await getSummary(String(body.id));
        if (s) await updateSummary(s, { status: "dismissed" });
        return j({});
      }

      // ── ประกาศบนแอป ────────────────────────────────────────────────────────
      case "announce.parse": {
        const text = String(body.text ?? "").trim();
        if (!text) return NextResponse.json({ ok: false, error: "ว่าง" }, { status: 400 });
        const p = await parseAnnouncement(text, String(body.author ?? ""));
        return j({ parsed: p ?? { is_announcement: true, required_for: "optional", title: text.split("\n")[0].slice(0, 40), summary: "", category: "ทั่วไป", deadline: "", event_time: "", location: "", links: extractUrls(text).map((u) => ({ url: u, label: "เปิดลิงก์" })) } });
      }
      case "announce.create": {
        const id = await createAnnouncement({ ...(body.data as Partial<Announcement>), source: "manual" }, { autoForm: body.todo === true });
        let code = "";
        // ติ๊ก "ส่ง LINE ด้วย" -> เข้ากล่องรออนุมัติ (ยังไม่ส่งจนกว่าจะกดอนุมัติ)
        if (body.sendLine === true) code = (await addReminder(`ann:${id}`)).code;
        return j({ id, code });
      }
      case "announce.update":
        return NextResponse.json({ ok: await updateAnnouncement(String(body.id), body.patch as Partial<Announcement>) });
      case "announce.remind": {
        const a = await getAnnouncement(String(body.id), true);
        if (!a) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
        return j({ ...(await addReminder(`ann:${a.id}`)) });
      }

      case "announce.bulk": {
        // เลือกหลายประกาศ: patch เดียวกันทุกอัน (จัดชุด/ซ่อน/ปักหมุด/หมวด) หรือ order = เรียงลำดับใหม่ตาม ids
        const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String).filter(Boolean) : [];
        if (!ids.length) return NextResponse.json({ ok: false, error: "ยังไม่ได้เลือก" });
        const allowed = ["status", "pinned", "category", "group_name", "sort_order"];
        const raw = (body.patch ?? {}) as Record<string, unknown>;
        const patch: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) if (allowed.includes(k)) patch[k] = String(v ?? "").slice(0, 60);
        const changes = body.order === true
          ? ids.map((id, i) => ({ id, patch: { ...patch, sort_order: String(i + 1) } }))
          : ids.map((id) => ({ id, patch }));
        return j({ n: await bulkUpdateAnnouncements(changes) });
      }
      case "announce.todo": {
        // ทุกคนต้องกรอก (ติดตามว่าใครกดติ๊กแล้ว) — รองรับหลายประกาศพร้อมกัน
        const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String) : [String(body.id ?? "")];
        const on = body.on !== false;
        const { setAnnouncementTodo } = await import("@/lib/bc/forms");
        const { parseLinks } = await import("@/lib/bc/announcements");
        let n = 0;
        for (const id of ids.filter(Boolean)) {
          const a = await getAnnouncement(id, true);
          if (!a) continue;
          const fid = await setAnnouncementTodo({ id: a.id, title: a.title, summary: a.summary, deadline_at: a.deadline_at, links: parseLinks(a.links), form_id: a.form_id }, on);
          if (fid !== a.form_id) await bulkUpdateAnnouncements([{ id: a.id, patch: { form_id: fid } }]);
          n++;
        }
        return j({ n });
      }
      case "announce.bulkRemind": {
        // ส่ง LINE หลายเรื่องรวมเป็น "เตือนรวม" รายการเดียว -> ไปกดส่งที่ รออนุมัติ
        const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String).filter(Boolean) : [];
        const { addToBatch } = await import("@/lib/bc/digest");
        const r = await addToBatch(ids.map((id) => `ann:${id}`), { notify: false });
        return j({ code: r?.item.code ?? "", n: r?.keys.length ?? 0 });
      }

      // ── สรุปวันนี้ ─────────────────────────────────────────────────────────
      case "daily.generate":
        return j({ ...(await generateDaily({ force: true })) });
      case "daily.update":
        return NextResponse.json({ ok: await updateDaily(String(body.id), { headline: body.headline as string | undefined, items: body.items as DailyItem[] | undefined, status: body.status as string | undefined }) });

      // ── ตารางเรียน / สอบ ───────────────────────────────────────────────────
      case "schedule.save":
        return j({ n: await saveScheduleRows((body.rows as Partial<ScheduleItem>[]) ?? []) });
      case "schedule.publish":
        return j({ n: await publishUpload(String(body.uploadId ?? "")) });
      case "schedule.discard": {
        const rows = (await readSchedule(true)).filter((r) => r.upload_id === String(body.uploadId) && r.status === "draft");
        return j({ n: await saveScheduleRows(rows.map((r) => ({ id: r.id, status: "deleted" }))) });
      }
      case "exam.save":
        return j({ n: await saveUniExamRows((body.rows as Partial<UniExam>[]) ?? []) });

      // ── กล่องรอตรวจ (ข้อความขาออก) ─────────────────────────────────────────
      case "outbox.approve": {
        const keys = Array.isArray(body.keys) ? (body.keys as unknown[]).map(String) : undefined;
        if (keys && !keys.length) return NextResponse.json({ ok: false, error: "ยังไม่ได้เลือกเรื่อง" });
        const r = await approveAndSend(String(body.id ?? ""), `web:${by}`, { keys });
        return NextResponse.json({ ok: r.ok, count: r.count, error: r.error });
      }
      case "outbox.digestNow": {
        // รวบรวมเรื่องที่ใกล้ถึงเข้า "เตือนรวม" ตอนนี้ (ไม่ส่ง LINE หาแอดมิน — อยู่ในหน้านี้แล้ว)
        const { addToBatch, reminderCandidates } = await import("@/lib/bc/digest");
        const sug = (await reminderCandidates()).filter((c) => c.suggested && (c.forAll || (c.undone?.size ?? 0) > 0)).map((c) => c.key);
        const r = await addToBatch(sug, { notify: false });
        return j({ code: r?.item.code ?? "", items: r?.keys.length ?? 0, people: r?.people ?? 0 });
      }
      case "outbox.batchAdd": {
        const { addToBatch } = await import("@/lib/bc/digest");
        const r = await addToBatch([String(body.key ?? "")], { notify: false });
        return j({ code: r?.item.code ?? "", items: r?.keys.length ?? 0 });
      }
      case "outbox.setDate": {
        // แก้วันในหน้า รออนุมัติ -> แก้ที่ต้นทางจริง (ประกาศ / สิ่งที่ต้องกรอก / ตารางสอบ) ให้แอปตรงกันทันที
        const [kind, id] = String(body.key ?? "").split(":");
        const dl = body.deadline === undefined ? undefined : String(body.deadline ?? "");
        const ev = body.event === undefined ? undefined : String(body.event ?? "");
        const iso = (v: string) => (v && isNaN(new Date(v).getTime()) ? null : v);
        if ((dl !== undefined && iso(dl) === null) || (ev !== undefined && iso(ev) === null)) return NextResponse.json({ ok: false, error: "วันเวลาไม่ถูกต้อง" });
        if (kind === "ann") {
          const patch: Partial<Announcement> = {};
          if (dl !== undefined) patch.deadline_at = dl;
          if (ev !== undefined) patch.event_at = ev;
          return NextResponse.json({ ok: await updateAnnouncement(id, patch) });
        }
        if (kind === "form") {
          const f = await getForm(id);
          if (!f) return NextResponse.json({ ok: false, error: "ไม่พบรายการ" });
          if (dl !== undefined) await updateForm(f, { deadline_at: dl });
          const annId = f.announcement_id;
          if (annId) {
            const patch: Partial<Announcement> = {};
            if (dl !== undefined) patch.deadline_at = dl;
            if (ev !== undefined) patch.event_at = ev;
            if (Object.keys(patch).length) await updateAnnouncement(annId, patch);
          }
          return j({});
        }
        if (kind === "exam" && ev) {
          const d = new Date(new Date(ev).getTime() + 7 * 3600_000).toISOString();
          return j({ n: await saveUniExamRows([{ id, date: d.slice(0, 10), start: d.slice(11, 16) }]) });
        }
        return NextResponse.json({ ok: false, error: "แก้วันของรายการนี้ไม่ได้" });
      }
      case "outbox.reject":
        return NextResponse.json({ ok: await rejectOutbox(String(body.id ?? ""), `web:${by}`) });
      case "outbox.update": {
        const text = String(body.text ?? "");
        const links = (body.links as { label: string; url: string }[]) ?? [];
        return NextResponse.json({ ok: await updateOutboxText(String(body.id), text, reminderMessages({ text, title: String(body.title ?? ""), links })) });
      }

      // ── การเงิน ────────────────────────────────────────────────────────────
      case "finance.month.save":
        await upsertMonth(body.month as Parameters<typeof upsertMonth>[0]);
        return j({});
      case "finance.month.delete":
        await deleteMonth(String(body.month ?? ""));
        return j({});
      case "finance.pay":
        return j({ n: await applyPayments((body.changes as PayChange[]) ?? [], by) });
      case "finance.yearly":
        return j({ n: await markYearly(String(body.sid ?? ""), (body.months as string[] | null) ?? null, by) });
      case "finance.inspect":
        return j({ ...(await inspectFinanceSheet(String(body.link ?? ""))) });
      case "finance.import":
        return j({ ...(await importFinanceSheet({
          sheetId: String(body.sheetId), tab: String(body.tab), idColumn: String(body.idColumn),
          months: (body.months as Record<string, string>) ?? {}, apply: body.apply === true, by,
        })) });
      case "finance.setting": {
        const key = String(body.key) as ConfigKey;
        if (!["payment_info", "payment_link", "finance_sheet_link", "payment_account_name", "payment_account_no", "slip_auto_approve", "red_zone_fees", "red_zone_fee_weight"].includes(key)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
        await setConfig(key, String(body.value ?? ""));
        return j({});
      }

      case "finance.settings": {
        // บันทึกหลายช่องพร้อมกันแบบไม่ชนกัน (เดิมยิงทีละช่องพร้อมกัน -> ค่าหาย)
        const allowed = ["payment_info", "payment_link", "finance_sheet_link", "payment_account_name", "payment_account_no", "slip_auto_approve", "red_zone_fees", "red_zone_fee_weight"];
        const values = (body.values ?? {}) as Record<string, unknown>;
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(values)) { if (!allowed.includes(k)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }); clean[k] = String(v ?? ""); }
        const { setConfigMany } = await import("@/lib/bc/config");
        await setConfigMany(clean, `by ${by}`);
        return j({});
      }
      case "finance.carry": {
        // ยอดค้างยกมา (เดือน) ต่อคน — ฝ่ายการเงินกรอกเองได้ ไม่ต้องนำเข้าไฟล์เก่า
        const map = (body.map ?? {}) as Record<string, unknown>;
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(map)) { const sid = digits(k); const n = Math.max(0, Math.min(24, Math.round(Number(v) || 0))); if (sid && n > 0) out[sid] = n; }
        const { setConfigMany } = await import("@/lib/bc/config");
        await setConfigMany({ fee_carry_json: JSON.stringify(out) }, `by ${by}`);
        return j({ n: Object.keys(out).length });
      }
      case "finance.slip.decide": {
        const { decideSlip } = await import("@/lib/bc/slips");
        return NextResponse.json({ ok: await decideSlip(String(body.id), body.approve === true, by, body.month ? String(body.month) : undefined) });
      }
      case "finance.remindUnpaid":
        return j({ ...(await queueUnpaidReminder({ month: body.month ? String(body.month) : undefined, note: String(body.note ?? ""), by })) });

      // ── ตั้งค่า ───────────────────────────────────────────────────────────
      case "settings.set": {
        const key = String(body.key) as ConfigKey;
        if (!CONFIG_KEYS.includes(key)) return NextResponse.json({ ok: false, error: "unknown key" }, { status: 400 });
        await setConfig(key, String(body.value ?? "").trim());
        if (key === "gemini_model") bust("gemini-models");
        return j({});
      }
      case "settings.password": {
        const r = String(body.role);
        if (!["academic", "finance"].includes(r)) return NextResponse.json({ ok: false, error: "role" }, { status: 400 });
        const pw = String(body.password ?? "").trim();
        if (pw && pw.length < 8) return NextResponse.json({ ok: false, error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัว" }, { status: 400 });
        await setConfig(`${r}_password_hash` as ConfigKey, pw ? hashPassword(pw) : "", pw ? "set via settings" : "disabled");
        return j({});
      }
      case "access.links": {
        const { accessLink } = await import("@/lib/bc/auth");
        const base = process.env.PUBLIC_BASE_URL || new URL(req.url).origin;
        return j({ finance: await accessLink("finance", base), academic: await accessLink("academic", base) });
      }
      case "settings.committee":
        return j({ n: await saveCommittee((body.rows as { student_id: string; nickname: string; role: string; contact_url: string }[]) ?? []) });

      // ── AI ─────────────────────────────────────────────────────────────────
      case "ai.ask": {
        const sid = digits(body.sid ?? "");
        const roster = sid ? await readRoster() : [];
        const me = roster.find((r) => r.student_id === sid);
        const r = await answer(String(body.question ?? ""), {
          studentId: me?.student_id, nickname: me?.nickname, verified: !!me || body.asAdmin === true,
          admin: body.asAdmin === true, channel: "console",
        });
        return j({ out: r.out, messages: r.messages, model: r.model, ms: r.ms, tokens: r.tokens, cached: r.cached, error: r.error, route: r.route, evidence: r.evidence });
      }
      case "ai.models":
        return j({ models: await listFlashModels().catch((e) => [`(list failed: ${String(e).slice(0, 80)})`]), active: await activeModel() });
      case "ai.pack": {
        const p = await archivePack();
        return j({ stats: p.stats });
      }
      case "ai.refresh": {
        bust("knowledge");
        (await import("@/lib/ai/corpus")).resetCorpus();
        return j({});
      }

      // ── กลุ่ม LINE ของบอท ──────────────────────────────────────────────────
      case "groups.list": {
        const { groupInfos } = await import("@/lib/bc/groups");
        // กลุ่มที่เคยมีข้อความใน buffer 07 (ก่อนเริ่มจำกลุ่ม) ก็แสดงด้วย
        const { readTable, getSheetTitles } = await import("@/lib/google-sheets");
        const raw = (await getSheetTitles().catch(() => [] as string[])).find((t) => t.startsWith("07"));
        const seen = raw ? Array.from(new Set((await readTable(raw).catch(() => [])).map((r) => String(r.groupId ?? "")).filter((x) => /^[CR][0-9a-f]{32}$/.test(x)))) : [];
        return j({ ...(await groupInfos(seen)) });
      }
      case "groups.leave": {
        const { leaveGroup } = await import("@/lib/bc/groups");
        await leaveGroup(String(body.id ?? ""));
        return j({});
      }

      // ── rich menu (เมนู 6 ปุ่มใน LINE) ─────────────────────────────────────
      case "richmenu.status":
        return j({ ...(await richMenuStatus()) });
      case "richmenu.create":
        return j({ id: await createRichMenuV2(new URL(req.url).origin) });
      case "richmenu.linkMe": {
        const st = await richMenuStatus();
        if (!st.ours) return NextResponse.json({ ok: false, error: "ยังไม่ได้สร้างเมนู" }, { status: 400 });
        const ids = await approverIds();
        for (const u of ids) await linkRichMenu(u, st.ours);
        return j({ linked: ids.length });
      }
      case "richmenu.unlinkMe": {
        for (const u of await approverIds()) await unlinkRichMenu(u).catch(() => {});
        return j({});
      }
      case "richmenu.setDefault": {
        const st = await richMenuStatus();
        if (!st.ours) return NextResponse.json({ ok: false, error: "ยังไม่ได้สร้างเมนู" }, { status: 400 });
        await setDefaultRichMenu(st.ours);
        return j({});
      }

      default:
        return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ ok: false, error: String((err as Error)?.message ?? err).slice(0, 400) }, { status: 500 });
  }
}
