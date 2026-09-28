// เงินรุ่น — ฝ่ายการเงินใช้หน้าเดียว: สลิปรอตรวจ (AI ตรวจให้) → ภาพรวมรายเดือน → เตือนคนที่ยังไม่จ่าย
import { Wallet, Receipt, CalendarRange, Landmark, FileSpreadsheet, Table2, History, Flame } from "lucide-react";
import { requireRole } from "@/lib/bc/auth";
import { readRoster } from "@/lib/bc/roster";
import { readFeeMonths, financeMatrix, monthLabel } from "@/lib/bc/fees";
import { readSlips } from "@/lib/bc/slips";
import { getConfig } from "@/lib/bc/config";
import { thDateTime } from "@/lib/time";
import { Head, Sq } from "../ui/kit";
import FeeMonths from "../ui/FeeMonths";
import PayGrid from "../ui/PayGrid";
import FinanceSettings from "../ui/FinanceSettings";
import FinanceImport from "../ui/FinanceImport";
import FinanceBoard from "../ui/FinanceBoard";
import SlipQueue from "../ui/SlipQueue";
import RedZoneFees from "../ui/RedZoneFees";
import FeeCarry from "../ui/FeeCarry";
import LiveSync from "../ui/LiveSync";
import { ranking, overdueFees, redZoneFeeRule, feeCarry } from "@/lib/bc/academic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function FinancePage() {
  await requireRole("finance");
  const [roster, months, matrix, cfg, slips] = await Promise.all([readRoster(), readFeeMonths(true), financeMatrix(), getConfig(), readSlips().catch(() => [])]);
  const nick = new Map(roster.map((r) => [r.student_id, r.nickname || r.full_name]));
  const rows = roster.map((r) => ({
    sid: r.student_id, nickname: r.nickname || r.full_name, name: r.full_name,
    cells: Object.fromEntries(months.map((m) => [m.month, matrix.cell(r.student_id, m.month)])),
  }));
  const monthsLite = months.map((m) => ({ month: m.month, label: m.label || monthLabel(m.month), amount: m.amount, due_date: m.due_date, note: m.note }));
  const thisMonth = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
  const initial = months.find((m) => m.month === thisMonth)?.month ?? months.filter((m) => m.month <= thisMonth).at(-1)?.month ?? months[0]?.month ?? "";
  const pending = slips.filter((s) => s.status === "pending").reverse().map((s) => ({
    id: s.id, sid: s.student_id, name: nick.get(s.student_id) ?? s.student_id, month: s.month, monthLabel: s.month ? monthLabel(s.month) : "",
    amount: s.amount, paid_at: s.paid_at ? thDateTime(s.paid_at) : "", receiver: s.receiver, verdict: s.ai_verdict, note: s.ai_note, image: s.image, when: thDateTime(s.created_at), source: s.source,
  }));
  const decided = slips.filter((s) => s.status !== "pending").slice(-15).reverse();
  // Red Zone จากเงินรุ่น (เลยกำหนดแล้วยังไม่จ่าย)
  const [overdue, rule, rank, carry] = await Promise.all([overdueFees(), redZoneFeeRule(), ranking(), feeCarry()]);
  const levelOf = new Map(rank.rows.map((r) => [r.student_id, r.level]));
  const owedIds = Array.from(new Set([...Array.from(overdue.keys()), ...Array.from(carry.keys())]));
  const overdueRows = owedIds.map((sid) => ({ sid, nickname: nick.get(sid) ?? sid, months: [...(carry.get(sid) ? [`ค้างยกมา ${carry.get(sid)} เดือน`] : []), ...(overdue.get(sid) ?? [])], level: levelOf.get(sid) ?? "safe" }))
    .sort((a, b) => b.months.length - a.months.length || a.sid.localeCompare(b.sid));
  const carryPeople = roster.map((r) => ({ sid: r.student_id, no: Number(r.student_id.slice(-3)), nickname: r.nickname || r.full_name })).sort((a, b) => a.no - b.no);

  return (
    <div className="wrap">
      <Head icon={Wallet} tone="teal" title="เงินรุ่น" sub="เพื่อนส่งรูปสลิปในแอปหรือในแชตบอท → AI อ่านยอด ผู้รับ และเช็กสลิปซ้ำให้ → คุณแค่กดยืนยัน · กดเตือนแล้วส่งถึงเพื่อนทันที" />
      <div style={{ marginTop: -8, marginBottom: 14 }}><LiveSync /></div>

      {pending.length > 0 && (
        <>
          <h2 className="row" style={{ gap: 10 }}><Sq icon={Receipt} tone="orange" /> สลิปรอตรวจ <span className="badge b-orange">{pending.length}</span></h2>
          <SlipQueue slips={pending} months={monthsLite} />
        </>
      )}

      <h2 className="row" style={{ gap: 10 }}><Sq icon={CalendarRange} tone="teal" /> ใครจ่ายแล้วบ้าง</h2>
      <FinanceBoard months={monthsLite} initial={initial} rows={rows.map((r) => ({ sid: r.sid, nickname: r.nickname, cells: r.cells }))} />

      <h2 className="row" style={{ gap: 10 }}><Sq icon={Flame} tone="red" /> Red Zone จากเงินรุ่น {overdueRows.length > 0 && <span className="badge b-red">{overdueRows.length} คน</span>}</h2>
      <RedZoneFees on={rule.on} weight={rule.weight} rows={overdueRows} />

      <h2 className="row" style={{ gap: 10 }}><Sq icon={History} tone="orange" /> ค้างยกมา (กรอกเอง ไม่ต้องเริ่มใหม่) {carry.size > 0 && <span className="badge b-orange">{carry.size} คน</span>}</h2>
      <FeeCarry people={carryPeople} initial={Object.fromEntries(carry)} />

      <h2 className="row" style={{ gap: 10 }}><Sq icon={Landmark} tone="green" /> บัญชีรับเงิน & การตรวจสลิป</h2>
      <FinanceSettings cfg={cfg} />

      <details className="more" style={{ marginTop: 22 }}>
        <summary><CalendarRange size={16} /> ตั้งยอดแต่ละเดือน</summary>
        <div style={{ marginTop: 10 }}><FeeMonths months={monthsLite} /></div>
      </details>
      {months.length > 0 && (
        <details className="more">
          <summary><Table2 size={16} /> ตารางทุกเดือน (แก้หลายเดือนพร้อมกัน / จ่ายรายปี)</summary>
          <div style={{ marginTop: 10 }}><PayGrid months={monthsLite} rows={rows} /></div>
        </details>
      )}
      <details className="more">
        <summary><FileSpreadsheet size={16} /> นำเข้าจากชีตเดิมของฝ่ายการเงิน</summary>
        <div style={{ marginTop: 10 }}><FinanceImport months={monthsLite} serviceEmail={process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? ""} /></div>
      </details>
      {decided.length > 0 && (
        <details className="more">
          <summary><History size={16} /> สลิปที่ตรวจแล้ว</summary>
          <div className="list" style={{ marginTop: 10 }}>
            {decided.map((s) => (
              <div key={s.id} className="li">
                <span className={`badge ${s.status === "approved" ? "b-green" : "b-red"}`}>{s.status === "approved" ? "ผ่าน" : "ไม่ผ่าน"}</span>
                <div className="li-b"><b>{nick.get(s.student_id) ?? s.student_id} · {Number(s.amount).toLocaleString()} บาท · {s.month ? monthLabel(s.month) : "-"}</b><small>{s.decided_by === "ai-auto" ? "AI ยืนยันอัตโนมัติ" : `โดย ${s.decided_by}`} · {thDateTime(s.decided_at)} · {s.ai_note}</small></div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
