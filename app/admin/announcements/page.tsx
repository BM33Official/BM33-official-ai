import { requireAdmin } from "@/lib/bc/auth";
import { readAnnouncements, parseLinks } from "@/lib/bc/announcements";
import { readForms } from "@/lib/bc/forms";
import { readCommittee } from "@/lib/bc/committee";
import { thDateTime, relativeTh } from "@/lib/time";
import PageHead from "../ui/PageHead";
import AnnouncementEditor from "../ui/AnnouncementEditor";
import AnnouncementRow from "../ui/AnnouncementRow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE: Record<string, string> = { group: "🤖 จับจากกลุ่ม", forward: "📨 ส่งผ่านบอท", manual: "✍️ แอดมิน" };

function reminderText(json: string): string {
  let rem: Record<string, string> = {};
  try { rem = JSON.parse(json || "{}"); } catch { /* */ }
  return Object.keys(rem).map((k) => (k === "d0" ? "วันจริง" : `ก่อน ${k.slice(1)} วัน`)).join(", ");
}

export default async function Announcements({ searchParams }: { searchParams: { show?: string } }) {
  await requireAdmin();
  const [all, forms, committee] = await Promise.all([readAnnouncements(true), readForms(), readCommittee()]);
  const show = searchParams.show ?? "live";
  const list = all.filter((a) => (show === "all" ? true : a.status === show)).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const count = (s: string) => all.filter((a) => a.status === s).length;
  const formsLite = forms.map((f) => ({ id: f.form_id, name: f.name }));
  const comm = committee.map((c) => ({ nickname: c.nickname, role: c.role }));

  return (
    <div className="wrap">
      <PageHead icon="📣" title="ประกาศบนแอป" desc="ทุกประกาศที่เพื่อน ๆ เห็นในแท็บ “ประกาศ” ของแอป — ประกาศของกรรมการในกลุ่มถูกดึงเข้ามาเองอัตโนมัติ หรือวางข้อความที่นี่ก็ได้"
        steps={["วางข้อความ → ✨ ให้ AI จัดให้", "ตรวจหัวข้อ/เดดไลน์/ปุ่มลิงก์", "เผยแพร่ — ใกล้เดดไลน์ระบบร่างข้อความเตือนให้เอง"]} />

      <AnnouncementEditor forms={formsLite} committee={comm} />

      <h2>รายการประกาศ</h2>
      <div className="pill-tabs">
        {[["live", `บนแอป (${count("live")})`], ["draft", `ร่าง (${count("draft")})`], ["hidden", `ซ่อน (${count("hidden")})`], ["all", `ทั้งหมด (${all.length})`]].map(([k, l]) => (
          <a key={k} href={`?show=${k}`} className={show === k ? "on" : ""}>{l}</a>
        ))}
      </div>
      {list.length === 0 && <div className="card"><p className="hint" style={{ margin: 0 }}>ยังไม่มีรายการในหมวดนี้</p></div>}
      {list.map((a) => (
        <AnnouncementRow key={a.id} forms={formsLite} committee={comm}
          a={{ id: a.id, title: a.title, summary: a.summary, body: a.body, author: a.author, author_role: a.author_role, category: a.category, deadline_at: a.deadline_at, event_at: a.event_at, location: a.location, links: parseLinks(a.links), pinned: a.pinned === "1", status: a.status, form_id: a.form_id }}
          meta={{ created: thDateTime(a.created_at), deadline: a.deadline_at ? thDateTime(a.deadline_at) : "", rel: a.deadline_at ? relativeTh(a.deadline_at) : "", source: SOURCE[a.source] ?? a.source, reminders: reminderText(a.reminders) }} />
      ))}
    </div>
  );
}
