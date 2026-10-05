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
import AnnouncementBoard from "../ui/AnnouncementBoard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reminderText(json: string): string {
  let rem: Record<string, string> = {};
  try { rem = JSON.parse(json || "{}"); } catch { /* */ }
  return Object.keys(rem).map((k) => (k === "d0" ? "วันจริง" : k === "manual" ? "ส่งเอง" : `ก่อน ${k.slice(1)} วัน`)).join(", ");
}

export default async function Announcements() {
  await requireAdmin();
  const [all, forms, committee] = await Promise.all([readAnnouncements(true), readForms(), readCommittee()]);
  const formsLite = forms.map((f) => ({ id: f.form_id, name: f.name }));
  const comm = committee.map((c) => ({ nickname: c.nickname, role: c.role }));
  const now = Date.now();

  return (
    <div className="wrap">
      <Head icon={Megaphone} tone="blue" title="ประกาศ" sub="ประกาศของกรรมการในกลุ่ม AI ดึงขึ้นแอปให้เอง · เขียนเพิ่มที่นี่ได้ แล้วเลือกว่าจะส่ง LINE ด้วยไหม"
        right={<Link href="/admin/broadcasts" className="btn btn-sm"><MessageSquareText size={15} /> ข้อความ LINE ขั้นสูง</Link>} />

      <AnnouncementEditor forms={formsLite} committee={comm} />

      <AnnouncementBoard forms={formsLite} committee={comm} items={all.map((a) => ({
        a: { id: a.id, title: a.title, summary: a.summary, body: a.body, author: a.author, author_role: a.author_role, category: a.category, deadline_at: a.deadline_at, event_at: a.event_at, location: a.location, links: parseLinks(a.links), pinned: a.pinned === "1", status: a.status, form_id: a.form_id, group: (a.group_name ?? "").trim(), order: Number(a.sort_order) || 0, created_at: a.created_at || "" },
        meta: { created: thDateTime(a.created_at, false), deadline: a.deadline_at ? thDateTime(a.deadline_at) : "", rel: a.deadline_at ? relativeTh(a.deadline_at) : "", overdue: !!a.deadline_at && new Date(a.deadline_at).getTime() < now, event: a.event_at ? thDateTime(a.event_at) : "", source: a.source, reminders: reminderText(a.reminders) },
      }))} />
    </div>
  );
}
