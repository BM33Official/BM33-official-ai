// ประกาศ (รวม "ประกาศบนแอป" + "บรอดแคสต์ LINE" ไว้ที่เดียว)
import Link from "next/link";
import { Megaphone, MessageSquareText } from "lucide-react";
import { requireAdmin } from "@/lib/bc/auth";
import { readAnnouncements, parseLinks } from "@/lib/bc/announcements";
import { readForms } from "@/lib/bc/forms";
import { readCommittee } from "@/lib/bc/committee";
import { thDateTime, relativeTh } from "@/lib/time";
import { Head } from "../ui/kit";
import AnnouncementEditor from "../ui/AnnouncementEditor";
import AnnouncementBoard, { type Track } from "../ui/AnnouncementBoard";
import { statusForForm } from "@/lib/bc/status";
import { readRoster } from "@/lib/bc/roster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reminderText(json: string): string {
  let rem: Record<string, string> = {};
  try { rem = JSON.parse(json || "{}"); } catch { /* */ }
  return Object.keys(rem).map((k) => (k === "d0" ? "วันจริง" : k === "manual" ? "ส่งเอง" : `ก่อน ${k.slice(1)} วัน`)).join(", ");
}

export default async function Announcements() {
  await requireAdmin();
  const [all, forms, committee, roster] = await Promise.all([readAnnouncements(true), readForms(), readCommittee(), readRoster()]);
  // ประกาศที่ "ทุกคนต้องกรอก" -> ใครกดติ๊กแล้ว / ยังไม่กด / ยังไม่ลงทะเบียน (เทียบกับรายชื่อทั้งรุ่น)
  const label = (sid: string) => { const r = roster.find((x) => x.student_id === sid); return `${r?.nickname || r?.full_name || sid} #${Number(sid.slice(-3))}`; };
  const tracks: Record<string, Track> = {};
  await Promise.all(all.map(async (a) => {
    const f = forms.find((x) => x.status !== "deleted" && ((a.form_id && x.form_id === a.form_id) || x.announcement_id === a.id));
    if (!f) return;
    const st = await statusForForm(f).catch(() => []);
    const by = new Map(st.map((x) => [String(x.member.matched_student_id).replace(/\D/g, ""), x.state]));
    const order = [...roster].sort((p, q) => p.student_id.localeCompare(q.student_id));
    tracks[a.id] = {
      formId: f.form_id, total: roster.length,
      done: order.filter((r) => by.get(r.student_id) === "done" || by.get(r.student_id) === "claimed").map((r) => label(r.student_id)),
      pending: order.filter((r) => by.get(r.student_id) === "none").map((r) => label(r.student_id)),
      unreg: order.filter((r) => !by.has(r.student_id)).map((r) => label(r.student_id)),
    };
  }));
  const formsLite = forms.map((f) => ({ id: f.form_id, name: f.name }));
  const comm = committee.map((c) => ({ nickname: c.nickname, role: c.role }));
  const now = Date.now();

  return (
    <div className="wrap">
      <Head icon={Megaphone} tone="blue" title="ประกาศ" sub="ประกาศของกรรมการในกลุ่ม AI ดึงขึ้นแอปให้เอง · เขียนเพิ่มที่นี่ได้ แล้วเลือกว่าจะส่ง LINE ด้วยไหม"
        right={<Link href="/admin/broadcasts" className="btn btn-sm"><MessageSquareText size={15} /> ข้อความ LINE ขั้นสูง</Link>} />

      <AnnouncementEditor forms={formsLite} committee={comm} />

      <AnnouncementBoard forms={formsLite} committee={comm} items={all.map((a) => ({
        track: tracks[a.id] ?? null,
        a: { id: a.id, title: a.title, summary: a.summary, body: a.body, author: a.author, author_role: a.author_role, category: a.category, deadline_at: a.deadline_at, event_at: a.event_at, location: a.location, links: parseLinks(a.links), pinned: a.pinned === "1", status: a.status, form_id: a.form_id, group: (a.group_name ?? "").trim(), order: Number(a.sort_order) || 0, created_at: a.created_at || "" },
        meta: { created: thDateTime(a.created_at, false), deadline: a.deadline_at ? thDateTime(a.deadline_at) : "", rel: a.deadline_at ? relativeTh(a.deadline_at) : "", overdue: !!a.deadline_at && new Date(a.deadline_at).getTime() < now, event: a.event_at ? thDateTime(a.event_at) : "", source: a.source, reminders: reminderText(a.reminders) },
      }))} />
    </div>
  );
}
