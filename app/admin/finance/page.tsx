import { requireRole } from "@/lib/bc/auth";
import { readRoster } from "@/lib/bc/roster";
import { readFeeMonths, financeMatrix } from "@/lib/bc/fees";
import { getConfig } from "@/lib/bc/config";
import PageHead from "../ui/PageHead";
import FeeMonths from "../ui/FeeMonths";
import PayGrid from "../ui/PayGrid";
import FinanceSettings from "../ui/FinanceSettings";
import FinanceImport from "../ui/FinanceImport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function FinancePage() {
  await requireRole("finance");
  const [roster, months, matrix, cfg] = await Promise.all([readRoster(), readFeeMonths(true), financeMatrix(), getConfig()]);
  const rows = roster.map((r) => ({
    sid: r.student_id, nickname: r.nickname || r.full_name, name: r.full_name,
    cells: Object.fromEntries(months.map((m) => [m.month, matrix.cell(r.student_id, m.month)])),
  }));
  const monthsLite = months.map((m) => ({ month: m.month, label: m.label, amount: m.amount, due_date: m.due_date, note: m.note }));
  const thisMonth = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
  const cur = months.find((m) => m.month === thisMonth);
  const owe = cur ? rows.filter((r) => ["unpaid", "overdue"].includes(r.cells[cur.month])).length : 0;
  const collected = months.reduce((a, m) => a + rows.filter((r) => ["paid", "yearly"].includes(r.cells[m.month])).length * (Number(m.amount) || 0), 0);

  return (
    <div className="wrap">
      <PageHead icon="💰" title="การเงิน — เงินรุ่น" desc="ฝ่ายการเงินใช้หน้านี้หน้าเดียว: ตั้งยอดแต่ละเดือน แล้วติ๊กว่าใครจ่ายแล้ว — สมาชิกแต่ละคนเห็นสถานะของตัวเองในแอปทันที (ไม่เห็นของคนอื่น)"
        steps={["เพิ่มเดือน + ยอด + วันครบกำหนด", "ติ๊กคนที่จ่ายแล้ว → บันทึก", "ใส่วิธีจ่ายเงินให้ขึ้นในแอป"]} />
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <div className="card"><div className="label">เดือนนี้ค้าง</div><div className="stat">{cur ? owe : "—"}<small> คน</small></div><div className="hint">{cur ? `${cur.label || cur.month} · ${cur.amount} บาท` : "ยังไม่ได้ตั้งเดือนนี้"}</div></div>
        <div className="card"><div className="label">รับแล้ว (โดยประมาณ)</div><div className="stat">{collected.toLocaleString()}<small> บาท</small></div><div className="hint">รวมทุกเดือน (ไม่รวมยกเว้น)</div></div>
        <div className="card"><div className="label">จำนวนเดือน</div><div className="stat">{months.length}</div></div>
        <div className="card"><div className="label">สมาชิกทั้งหมด</div><div className="stat">{roster.length}</div></div>
      </div>
      <h2 style={{ marginTop: 0 }}>1 · ยอดเงินรุ่นแต่ละเดือน</h2>
      <FeeMonths months={monthsLite} />
      <h2>2 · ใครจ่ายแล้วบ้าง</h2>
      {months.length ? <PayGrid months={monthsLite} rows={rows} /> : <div className="card"><p className="hint" style={{ margin: 0 }}>เพิ่มเดือนในข้อ 1 ก่อน</p></div>}
      <h2>3 · วิธีจ่ายเงิน</h2>
      <FinanceSettings info={cfg.payment_info ?? ""} link={cfg.payment_link ?? ""} sheet={cfg.finance_sheet_link ?? ""} />
      <div style={{ height: 14 }} />
      <FinanceImport months={monthsLite} serviceEmail={process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ""} />
    </div>
  );
}
