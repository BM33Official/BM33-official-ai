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
import AnnouncementRow from "../ui/AnnouncementRow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reminderText(json: string): string {
  let rem: Record<string, string> = {};
  try { rem = JSON.parse(json || "{}"); } catch { /* */ }
  return Object.keys(rem).map((k) => (k === "d0" ? "วันจริง" : k === "manual" ? "ส่งเอง" : `ก่อน ${k.slice(1)} วัน`)).join(", ");
}

export default async function Announcements({ searchParams }: { searchParams: { show?: string } }) {
  await requireAdmin();
  const [all, forms, committee] = await Promise.all([readAnnouncements(true), readForms(), readCommittee()]);
  const show = searchParams.show ?? "live";
  const list = all.filter((a) => (show === "all" ? true : a.status === show)).sort((a, b) => Number(b.pinned === "1") - Number(a.pinned === "1") || (b.created_at || "").localeCompare(a.created_at || ""));
  const count = (s: string) => all.filter((a) => a.status === s).length;
  const formsLite = forms.map((f) => ({ id: f.form_id, name: f.name }));
  const comm = committee.map((c) => ({ nickname: c.nickname, role: c.role }));
  const now = Date.now();

  return (
    <div className="wrap">
      <Head icon={Megaphone} tone="blue" title="ประกาศ" sub="ประกาศของกรรมการในกลุ่ม AI ดึงขึ้นแอปให้เอง · เขียนเพิ่มที่นี่ได้ แล้วเลือกว่าจะส่ง LINE ด้วยไหม"
        right={<Link href="/admin/broadcasts" className="btn btn-sm"><MessageSquareText size={15} /> ข้อความ LINE ขั้นสูง</Link>} />

      <AnnouncementEditor forms={formsLite} committee={comm} />

      <div className="row between" style={{ marginTop: 30 }}>
        <h2 style={{ margin: 0 }}>ทั้งหมด</h2>
        <div className="seg" style={{ margin: 0 }}>
          {[["live", `บนแอป ${count("live")}`], ["draft", `ร่าง ${count("draft")}`], ["hidden", `ซ่อน ${count("hidden")}`], ["all", "ทั้งหมด"]].map(([k, l]) => (
            <a key={k} href={`?show=${k}`} className={show === k ? "on" : ""}>{l}</a>
          ))}
        </div>
      </div>
      <div className="stack" style={{ marginTop: 14 }}>
        {list.length === 0 && <div className="card"><span className="hint">ยังไม่มีรายการในหมวดนี้</span></div>}
        {list.map((a) => (
          <AnnouncementRow key={a.id} forms={formsLite} committee={comm}
            a={{ id: a.id, title: a.title, summary: a.summary, body: a.body, author: a.author, author_role: a.author_role, category: a.category, deadline_at: a.deadline_at, event_at: a.event_at, location: a.location, links: parseLinks(a.links), pinned: a.pinned === "1", status: a.status, form_id: a.form_id }}
            meta={{ created: thDateTime(a.created_at, false), deadline: a.deadline_at ? thDateTime(a.deadline_at) : "", rel: a.deadline_at ? relativeTh(a.deadline_at) : "", overdue: !!a.deadline_at && new Date(a.deadline_at).getTime() < now, event: a.event_at ? thDateTime(a.event_at) : "", source: a.source, reminders: reminderText(a.reminders) }} />
        ))}
      </div>
    </div>
  );
}
