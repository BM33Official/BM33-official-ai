import { requireAdmin } from "@/lib/bc/auth";
import { ensureBcTabs } from "@/lib/bc/sheets";
import { readForms } from "@/lib/bc/forms";
import { summarize } from "@/lib/bc/status";
import AddForm from "../ui/AddForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Forms() {
  requireAdmin();
  await ensureBcTabs();
  const forms = await readForms();
  const rows = await Promise.all(forms.map(async (f) => ({ f, s: await summarize(f) })));

  return (
    <div className="wrap">
      <h1>ฟอร์มที่ติดตาม</h1>
      <p className="sub">เพิ่มฟอร์ม/การเงินให้ AI ตามว่าใครยังไม่ทำ แล้วใช้ยิงบรอดแคสต์เฉพาะคนที่ยังไม่ทำ</p>

      {rows.length > 0 && (
        <div className="card tablecard" style={{ marginBottom: 18 }}>
          <table>
            <thead><tr><th>ชื่อ</th><th>ประเภท</th><th>ทำแล้ว</th><th>ยังไม่ทำ</th><th>รอตรวจ</th><th>การตรวจ</th><th>ชีต</th></tr></thead>
            <tbody>
              {rows.map(({ f, s }) => (
                <tr key={f.form_id}>
                  <td><b>{f.name}</b></td>
                  <td>{f.type}</td>
                  <td><span className="badge b-ok">{s.done}</span></td>
                  <td><span className="badge b-warn">{s.undone}</span></td>
                  <td>{s.claimed || "-"}</td>
                  <td>{f.access === "auto" ? "อัตโนมัติ" : "แมนนวล"}</td>
                  <td className="hint">{f.response_tab}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AddForm />
    </div>
  );
}
