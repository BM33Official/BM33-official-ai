// สิ่งที่ต้องกรอก — AI ดึงจากประกาศให้เอง · หน้านี้บอกชัด ๆ ว่าใครกรอกแล้ว/ยังไม่กรอก + เตือน + ยืนยันทีเดียว
import { ClipboardCheck, Sparkles, Bell, Link2, PlusCircle, AlarmClock, CheckCheck, UserX } from "lucide-react";
import { requireAdmin } from "@/lib/bc/auth";
import { readForms } from "@/lib/bc/forms";
import { statusForForm } from "@/lib/bc/status";
import { readRoster } from "@/lib/bc/roster";
import { thDateTime, relativeTh } from "@/lib/time";
import { Head, Ring, Empty, Sq } from "../ui/kit";
import AddForm from "../ui/AddForm";
import FormEditRow from "../ui/FormEditRow";
import ActButton from "../ui/ActButton";
import TrustSwitch from "../ui/TrustSwitch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const digits = (s: string) => String(s ?? "").replace(/\D/g, "");
type P = { sid: string; no: number; name: string };

function Names({ people, tone }: { people: P[]; tone: "red" | "orange" | "green" | "gray" }) {
  if (!people.length) return <span className="hint">—</span>;
  return <div className="namechips">{people.map((p) => <span key={p.sid} className={`nc nc-${tone}`}><b>{p.no}</b>{p.name}</span>)}</div>;
}

export default async function Forms() {
  await requireAdmin();
  const [forms, roster] = await Promise.all([readForms(true), readRoster()]);
  const person = (sid: string): P => { const r = roster.find((x) => x.student_id === sid); return { sid, no: Number(sid.slice(-3)), name: r?.nickname || r?.full_name || sid }; };
  const byNo = (a: P, b: P) => a.no - b.no;
  const now = Date.now();
  const rows = await Promise.all(forms.filter((f) => f.status !== "deleted").map(async (f) => {
    const st = await statusForForm(f).catch(() => []);
    const reg = new Set(st.map((s) => digits(s.member.matched_student_id)));
    const pick = (k: string) => st.filter((s) => s.state === k).map((s) => person(digits(s.member.matched_student_id))).sort(byNo);
    return {
      f, done: pick("done"), claimed: pick("claimed"), todo: pick("none"),
      unreg: roster.filter((r) => !reg.has(r.student_id)).map((r) => person(r.student_id)).sort(byNo),
      left: f.deadline_at ? new Date(f.deadline_at).getTime() - now : Infinity,
    };
  }));
  const open = rows.filter((r) => r.f.status !== "closed").sort((a, b) => a.left - b.left);
  const urgent = open.filter((r) => r.left > 0 && r.left < 3 * 86_400_000 && r.todo.length);
  const rest = open.filter((r) => !urgent.includes(r));
  const closed = rows.filter((r) => r.f.status === "closed");
  const missing = open.reduce((a, r) => a + r.todo.length, 0);
  const waiting = open.reduce((a, r) => a + r.claimed.length, 0);

  const card = ({ f, done, claimed, todo, unreg, left }: (typeof rows)[number]) => {
    const total = done.length + claimed.length + todo.length;
    const late = left < 0;
    const soon = left >= 0 && left < 3 * 86_400_000;
    return (
      <div key={f.form_id} className="card fade-in" style={f.status === "closed" ? { opacity: 0.6 } : undefined}>
        <div className="row" style={{ gap: 16, flexWrap: "nowrap", alignItems: "flex-start" }}>
          <Ring value={done.length} max={total || 1} size={76} stroke={9} tone={total && done.length === total ? "green" : late ? "red" : soon ? "orange" : "blue"} label={done.length} sub={`/${total}`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 6, marginBottom: 4 }}>
              {f.source === "auto" ? <span className="badge b-purple"><Sparkles size={12} /> AI ดึงจากประกาศ</span> : <span className="badge">เพิ่มเอง</span>}
              <span className="badge">{f.access === "auto" ? "เช็กจากชีตคำตอบ" : "เพื่อนกดเอง"}</span>
              {f.status === "closed" && <span className="badge">ปิดแล้ว</span>}
            </div>
            <h3 style={{ fontSize: 19, margin: "2px 0" }}>{f.name}</h3>
            <div className="hint" style={{ color: late ? "var(--red-ink)" : soon ? "var(--orange-ink)" : undefined, fontWeight: late || soon ? 800 : undefined }}>
              {f.deadline_at ? `ปิด ${thDateTime(f.deadline_at)} · ${relativeTh(f.deadline_at)}` : "ไม่มีเดดไลน์"}
              {f.link && <> · <a href={f.link} target="_blank" rel="noreferrer"><Link2 size={13} /> เปิดฟอร์ม</a></>}
            </div>
          </div>
          {f.access !== "auto" && <TrustSwitch id={f.form_id} on={f.trust_claims === "1"} />}
        </div>

        <div className="who">
          <div className="who-col">
            <div className="who-h"><span className="dot red" />ยังไม่กรอก <b>{todo.length}</b>
              {f.status !== "closed" && todo.length > 0 && !late && (
                <ActButton action="form.remind" payload={{ id: f.form_id }} className="btn-sm btn-primary" doneText="เพิ่มเข้า “เตือนรวม” #{code} แล้ว → ไปกดส่งที่ รออนุมัติ"><Bell size={14} /> เตือน {todo.length} คนนี้</ActButton>
              )}
            </div>
            <Names people={todo} tone="red" />
          </div>
          {claimed.length > 0 && (
            <div className="who-col">
              <div className="who-h"><span className="dot orange" />บอกว่ากรอกแล้ว รอยืนยัน <b>{claimed.length}</b>
                <ActButton action="form.approveAll" payload={{ id: f.form_id }} className="btn-sm btn-green"><CheckCheck size={14} /> ยืนยันทั้งหมด</ActButton>
                {f.trust_claims !== "1" && f.access !== "auto" && (
                  <ActButton action="form.approveAll" payload={{ id: f.form_id, trust: true }} className="btn-sm" confirmText="ยืนยันทุกคนตอนนี้ และต่อไปใครกด “กรอกแล้ว” ในงานนี้ นับว่าเสร็จเลยโดยไม่ต้องตรวจ?">ยืนยัน + ต่อไปไม่ต้องตรวจ</ActButton>
                )}
              </div>
              <Names people={claimed} tone="orange" />
            </div>
          )}
          <details className="who-col">
            <summary className="who-h" style={{ cursor: "pointer" }}><span className="dot green" />กรอกแล้ว <b>{done.length}</b> <span className="hint">แตะเพื่อดูชื่อ</span></summary>
            <Names people={done} tone="green" />
          </details>
          {unreg.length > 0 && (
            <details className="who-col">
              <summary className="who-h" style={{ cursor: "pointer" }}><UserX size={14} color="#8e8e93" />ยังไม่ลงทะเบียนแอป <b>{unreg.length}</b> <span className="hint">ระบบติดตามไม่ได้ ต้องบอกเอง</span></summary>
              <Names people={unreg} tone="gray" />
            </details>
          )}
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
          <FormEditRow id={f.form_id} deadline={f.deadline_at ?? ""} link={f.link ?? ""} description={f.description ?? ""} status={f.status ?? ""} />
        </div>
      </div>
    );
  };

  return (
    <div className="wrap">
      <Head icon={ClipboardCheck} tone="green" title="สิ่งที่ต้องกรอก" sub="AI เพิ่มให้เองเมื่อเจอประกาศที่มีฟอร์ม · ดูได้ทันทีว่าใครกรอกแล้ว ใครยังไม่กรอก" />
      <div className="grid g3" style={{ marginBottom: 18 }}>
        <div className="card"><div className="bignum">{open.length}</div><div className="hint">งานที่เปิดอยู่</div></div>
        <div className="card"><div className="bignum" style={{ color: missing ? "var(--red-ink)" : undefined }}>{missing}</div><div className="hint">ช่องที่ยังไม่กรอก (รวมทุกงาน)</div></div>
        <div className="card"><div className="bignum" style={{ color: waiting ? "var(--orange-ink)" : undefined }}>{waiting}</div><div className="hint">รอคุณยืนยัน</div></div>
      </div>

      {urgent.length > 0 && (
        <>
          <h2 className="row" style={{ gap: 10 }}><Sq icon={AlarmClock} tone="red" /> ใกล้เดดไลน์ (ภายใน 3 วัน)</h2>
          <div className="stack">{urgent.map(card)}</div>
        </>
      )}
      {rest.length > 0 && <h2 className="row" style={{ gap: 10 }}><Sq icon={ClipboardCheck} tone="green" /> กำลังเปิด</h2>}
      {rest.length ? <div className="stack">{rest.map(card)}</div>
        : !urgent.length && <div className="card"><Empty icon={ClipboardCheck} title="ตอนนี้ไม่มีอะไรต้องกรอก" sub="เมื่อมีประกาศที่ให้กรอกฟอร์ม ระบบจะเพิ่มมาที่นี่เอง" /></div>}

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
