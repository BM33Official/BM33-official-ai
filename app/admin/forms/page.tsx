// สิ่งที่ต้องกรอก — AI ดึงจากประกาศให้เอง · หน้านี้ไว้ดูว่าใครยังไม่กรอก แก้ และเพิ่มที่ AI พลาด
import { ClipboardCheck, Sparkles, Hand, Bell, Link2, PlusCircle } from "lucide-react";
import { requireAdmin } from "@/lib/bc/auth";
import { readForms } from "@/lib/bc/forms";
import { statusForForm } from "@/lib/bc/status";
import { readRoster } from "@/lib/bc/roster";
import { thDateTime, relativeTh } from "@/lib/time";
import { Head, Ring, Empty } from "../ui/kit";
import AddForm from "../ui/AddForm";
import FormEditRow from "../ui/FormEditRow";
import ActButton from "../ui/ActButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const digits = (s: string) => String(s ?? "").replace(/\D/g, "");

export default async function Forms() {
  await requireAdmin();
  const [forms, roster] = await Promise.all([readForms(true), readRoster()]);
  const nick = new Map(roster.map((r) => [r.student_id, r.nickname || r.full_name]));
  const rows = await Promise.all(forms.map(async (f) => ({ f, st: await statusForForm(f) })));
  const now = Date.now();
  const open = rows.filter(({ f }) => f.status !== "closed").sort((a, b) => (a.f.deadline_at || "9").localeCompare(b.f.deadline_at || "9"));
  const closed = rows.filter(({ f }) => f.status === "closed");

  const card = ({ f, st }: (typeof rows)[number]) => {
    const done = st.filter((s) => s.state === "done").length;
    const claimed = st.filter((s) => s.state === "claimed").length;
    const late = f.deadline_at && new Date(f.deadline_at).getTime() < now;
    const soon = f.deadline_at && !late && new Date(f.deadline_at).getTime() - now < 2 * 86_400_000;
    const sorted = [...st].sort((a, b) => digits(a.member.matched_student_id).localeCompare(digits(b.member.matched_student_id)));
    return (
      <div key={f.form_id} className="card fade-in" style={f.status === "closed" ? { opacity: 0.6 } : undefined}>
        <div className="row" style={{ gap: 16, flexWrap: "nowrap", alignItems: "flex-start" }}>
          <Ring value={done} max={st.length || 1} size={78} stroke={9} tone={done === st.length && st.length ? "green" : late ? "red" : "blue"} label={done} sub={`/${st.length}`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 6, marginBottom: 4 }}>
              {f.source === "auto" ? <span className="badge b-purple"><Sparkles size={12} /> AI ดึงจากประกาศ</span> : <span className="badge">เพิ่มเอง</span>}
              <span className="badge">{f.access === "auto" ? "เช็กจากชีตคำตอบ" : "เพื่อนกด “กรอกแล้ว” เอง"}</span>
              {f.status === "closed" && <span className="badge">ปิดแล้ว</span>}
            </div>
            <h3 style={{ fontSize: 19, margin: "2px 0" }}>{f.name}</h3>
            <div className="hint" style={{ color: late ? "var(--red-ink)" : soon ? "var(--orange-ink)" : undefined, fontWeight: late || soon ? 700 : undefined }}>
              {f.deadline_at ? `ปิด ${thDateTime(f.deadline_at)} · ${relativeTh(f.deadline_at)}` : "ไม่มีเดดไลน์"}
              {f.link && <> · <a href={f.link} target="_blank" rel="noreferrer"><Link2 size={13} /> เปิดฟอร์ม</a></>}
            </div>
          </div>
        </div>
        {st.length > 0 && (
          <div className="dots" style={{ marginTop: 14 }}>
            {sorted.map((s) => {
              const id = digits(s.member.matched_student_id);
              return <span key={id} className={`d ${s.state === "done" ? "ok" : s.state === "claimed" ? "warn" : "none"}`} title={`${id.slice(-3)} ${nick.get(id) ?? ""} · ${s.state === "done" ? "กรอกแล้ว" : s.state === "claimed" ? "บอกว่ากรอกแล้ว (รอยืนยัน)" : "ยังไม่กรอก"}`}>{id.slice(-3).replace(/^0+/, "")}</span>;
            })}
          </div>
        )}
        <div className="row between" style={{ marginTop: 14 }}>
          <div className="legend"><span><i style={{ background: "#34c759" }} />กรอกแล้ว {done}</span>{claimed > 0 && <span><i style={{ background: "#ff9500" }} />รอยืนยัน {claimed}</span>}<span><i style={{ background: "#e5e5ea" }} />ยังไม่กรอก {st.length - done - claimed}</span></div>
          <div className="row" style={{ gap: 8 }}>
            {f.status !== "closed" && st.length - done > 0 && (
              <ActButton action="form.remind" payload={{ id: f.form_id }} className="btn-sm btn-primary" confirmText={`ร่างข้อความเตือน ${st.length - done} คนที่ยังไม่กรอก? (ยังไม่ส่ง — ไปรออนุมัติก่อน)`}
                done={(r) => `ร่างแล้ว #${r.code} → ไปที่ “รออนุมัติ”`}><Bell size={15} /> เตือนคนที่ยังไม่กรอก</ActButton>
            )}
            <FormEditRow id={f.form_id} deadline={f.deadline_at ?? ""} link={f.link ?? ""} description={f.description ?? ""} status={f.status ?? ""} />
          </div>
        </div>
        {claimed > 0 && <div className="hint" style={{ marginTop: 8 }}><Hand size={13} /> สีส้ม = เพื่อนกดว่ากรอกแล้ว ยืนยันได้ที่ “รออนุมัติ”</div>}
      </div>
    );
  };

  return (
    <div className="wrap">
      <Head icon={ClipboardCheck} tone="green" title="สิ่งที่ต้องกรอก" sub="AI เพิ่มให้เองเมื่อเจอประกาศที่มีฟอร์มให้กรอก — เพื่อนเห็นในแอปพร้อมเดดไลน์ · แต่ละช่องคือเพื่อน 1 คน" />
      {open.length ? <div className="stack">{open.map(card)}</div>
        : <div className="card"><Empty icon={ClipboardCheck} title="ตอนนี้ไม่มีอะไรต้องกรอก" sub="เมื่อมีประกาศที่ให้กรอกฟอร์ม ระบบจะเพิ่มมาที่นี่เอง" /></div>}

      <details className="more" style={{ marginTop: 22 }}>
        <summary><PlusCircle size={16} /> AI พลาดไป? เพิ่มเอง</summary>
        <div style={{ marginTop: 12 }}><AddForm /></div>
      </details>
      {closed.length > 0 && (
        <details className="more">
          <summary>ปิดแล้ว ({closed.length})</summary>
          <div className="stack" style={{ marginTop: 12 }}>{closed.map(card)}</div>
        </details>
      )}
    </div>
  );
}
