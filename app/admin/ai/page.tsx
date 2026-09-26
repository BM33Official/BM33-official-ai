import { requireAdmin } from "@/lib/bc/auth";
import { readTable } from "@/lib/google-sheets";
import { readRoster } from "@/lib/bc/roster";
import { getConfigValue } from "@/lib/bc/config";
import { thDateTime } from "@/lib/time";
import PageHead from "../ui/PageHead";
import AiConsole from "../ui/AiConsole";
import ModelPicker from "../ui/ModelPicker";
import ExpandText from "../ui/ExpandText";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KIND: Record<string, string> = { answer: "b-ok", partial: "b-warn", cannot_answer: "b-danger", smalltalk: "b-blue" };

export default async function AiPage() {
  await requireAdmin();
  const [roster, model, chat, buffer, kb] = await Promise.all([
    readRoster(), getConfigValue("gemini_model"),
    readTable("BC_chatlog").catch(() => []),
    readTable("07_ข้อความทั้งหมด").catch(() => []),
    readTable("01_ฐานความรู้_AI").catch(() => []),
  ]);
  const recentChat = [...chat].reverse().slice(0, 40);
  const nw = buffer.filter((r) => { const s = String(r["สถานะเรียนรู้"] ?? "").trim(); return !s || s === "new"; }).length;
  const learned = kb.filter((r) => String(r["รหัสความรู้"] ?? "").startsWith("KB-AUTO")).reverse();
  const stats = { answer: 0, partial: 0, cannot_answer: 0, smalltalk: 0 } as Record<string, number>;
  for (const c of chat) stats[String(c.kind)] = (stats[String(c.kind)] ?? 0) + 1;

  return (
    <div className="wrap">
      <PageHead icon="🤖" title="AI & ความรู้" desc="บอทอ่าน “ทุกแถว” ในชีตของรุ่น + ข้อมูลสดจากแอปทุกครั้งที่มีคนถาม ถ้าไม่มีข้อมูลจะส่งการ์ดติดต่อประธานรุ่นเสมอ — ทดสอบได้ที่นี่ก่อนเพื่อน ๆ เจอ" />

      <div className="grid g2">
        <AiConsole roster={roster.map((r) => ({ sid: r.student_id, label: `${r.nickname} · ${r.full_name}` }))} />
        <ModelPicker current={model} />
      </div>

      <h2>💬 คำถามล่าสุดจากเพื่อน ๆ</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="badge b-ok">ตอบได้ {stats.answer}</span><span className="badge b-warn">บางส่วน {stats.partial}</span>
        <span className="badge b-danger">ส่งต่อประธาน {stats.cannot_answer}</span><span className="badge b-blue">คุยเล่น {stats.smalltalk}</span>
      </div>
      <div className="card chatlog">
        {recentChat.length === 0 && <p className="hint" style={{ margin: 0 }}>ยังไม่มีบันทึก (เริ่มเก็บตั้งแต่เวอร์ชันนี้)</p>}
        {recentChat.map((c, i) => (
          <div key={i} style={{ borderBottom: "1px solid var(--line-soft)", paddingBottom: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="q">{String(c.nickname || "ไม่ระบุ")}: {String(c.question)}</span>
              <span className="row" style={{ gap: 6 }}><span className={`badge ${KIND[String(c.kind)] ?? "b-muted"}`}>{String(c.kind)}</span><span className="hint" style={{ margin: 0 }}>{thDateTime(String(c.ts))} · {String(c.channel)}</span></span>
            </div>
            {String(c.reply) && <div className="a">{String(c.reply)}</div>}
          </div>
        ))}
      </div>

      <h2>📚 การเรียนรู้จากแชตกลุ่ม</h2>
      <div className="grid g4">
        <div className="card"><div className="label">ข้อความที่เก็บ</div><div className="stat">{buffer.length}</div></div>
        <div className="card"><div className="label">รอสรุป</div><div className="stat">{nw}</div></div>
        <div className="card"><div className="label">ความรู้ที่ AI เพิ่ม</div><div className="stat">{learned.length}</div></div>
        <div className="card"><div className="label">ความรู้ทั้งหมด</div><div className="stat">{kb.length}</div></div>
      </div>
      <p className="hint">ถ้าจำนวน “ข้อความที่เก็บ” ไม่ขยับ แปลว่าบอทไม่ได้อยู่ในกลุ่มหลักของรุ่น (LINE OpenChat ใส่บอทไม่ได้) — ให้กรรมการส่งประกาศมาทางแชตบอทโดยขึ้นต้นว่า “ประกาศ …” แทน</p>
      <div className="card tablecard">
        <table>
          <thead><tr><th>หมวด</th><th>หัวข้อ</th><th>คำตอบ</th><th>วันที่</th></tr></thead>
          <tbody>
            {learned.slice(0, 20).map((r, i) => (
              <tr key={i}><td>{String(r["หมวด"] ?? "")}</td><td>{String(r["หัวข้อ"] ?? "").slice(0, 40)}</td><td><ExpandText text={String(r["คำตอบ/ข้อความต้นทาง"] ?? "")} /></td><td className="hint">{String(r["วันที่ต้นทาง"] ?? "")}</td></tr>
            ))}
            {learned.length === 0 && <tr><td colSpan={4} className="hint">ยังไม่มี</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
