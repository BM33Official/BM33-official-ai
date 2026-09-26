import { requireAdmin } from "@/lib/bc/auth";
import { readForms } from "@/lib/bc/forms";
import { summarize } from "@/lib/bc/status";
import { thDateTime, relativeTh } from "@/lib/time";
import AddForm from "../ui/AddForm";
import FormEditRow from "../ui/FormEditRow";
import PageHead from "../ui/PageHead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Forms() {
  await requireAdmin();
  const forms = await readForms(true);
  const rows = await Promise.all(forms.map(async (f) => ({ f, s: await summarize(f) })));

  return (
    <div className="wrap">
      <PageHead icon="📝" title="ฟอร์ม & งาน" desc="ฟอร์ม/งานที่ทุกคนต้องทำ — ขึ้นในแท็บ “งาน & ฟอร์ม” ของแอปพร้อมเดดไลน์ ระบบรู้ว่าใครยังไม่ทำ และร่างข้อความเตือนเฉพาะคนที่ยังไม่ทำให้อัตโนมัติ"
        steps={["เพิ่มฟอร์ม + ลิงก์ + เดดไลน์", "(ถ้ามี) เชื่อมชีตคำตอบให้ตรวจเอง", "ใกล้เดดไลน์ → อนุมัติข้อความเตือนในกล่องรอตรวจ"]} />

      {rows.length > 0 && (
        <div className="card tablecard" style={{ marginBottom: 18 }}>
          <table>
            <thead><tr><th>ชื่อ</th><th>เดดไลน์</th><th>ทำแล้ว</th><th>ยังไม่ทำ</th><th>รอตรวจ</th><th>การตรวจ</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ f, s }) => (
                <tr key={f.form_id} style={f.status === "closed" ? { opacity: 0.55 } : undefined}>
                  <td><b>{f.name}</b>{f.status === "closed" && <span className="badge b-muted" style={{ marginLeft: 6 }}>ปิดแล้ว</span>}<div className="hint">{f.description}</div></td>
                  <td className="hint">{f.deadline_at ? `${thDateTime(f.deadline_at)} · ${relativeTh(f.deadline_at)}` : "-"}</td>
                  <td><span className="badge b-ok">{s.done}</span></td>
                  <td><span className="badge b-warn">{s.undone}</span></td>
                  <td>{s.claimed || "-"}</td>
                  <td>{f.access === "auto" ? "อัตโนมัติ" : "กดเอง"}</td>
                  <td><FormEditRow id={f.form_id} deadline={f.deadline_at ?? ""} link={f.link ?? ""} description={f.description ?? ""} status={f.status ?? ""} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ padding: "0 10px" }}>“ทำแล้ว/ยังไม่ทำ” นับเฉพาะคนที่ยืนยันตัวตนแล้ว</p>
        </div>
      )}
      <AddForm />
    </div>
  );
}
