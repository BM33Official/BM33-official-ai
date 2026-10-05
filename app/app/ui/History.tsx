"use client";
// ประวัติของฉัน — รายการเรียกเก็บเงินรุ่น + งานวิชาการ (เปิดจากปุ่ม Green Zone / Red Zone)
import { useMemo, useState } from "react";
import type { AppData } from "./useApp";
import { Segmented } from "./Chrome";
import { thDateTime } from "@/lib/time";

type H = AppData["mine"]["history"][number];

const STATE: Record<string, { th: string; tone: string }> = {
  paid: { th: "จ่ายแล้ว", tone: "done" }, yearly: { th: "รายปี", tone: "done" }, waived: { th: "ยกเว้น", tone: "done" }, partial: { th: "บางส่วน", tone: "soon" },
  unpaid: { th: "ยังไม่จ่าย", tone: "soon" }, overdue: { th: "เลยกำหนด", tone: "urgent" }, upcoming: { th: "ยังไม่ถึงรอบ", tone: "info" },
  ok: { th: "กรอกแล้ว", tone: "done" }, missing: { th: "ยังไม่กรอก", tone: "urgent" }, accepted: { th: "ยอมโดน", tone: "violet" }, open: { th: "ยังไม่ตรวจ", tone: "info" },
};
const UNPAID = ["unpaid", "overdue", "upcoming", "partial"];

export default function History({ data }: { data: AppData }) {
  const [filter, setFilter] = useState<"all" | "fee" | "exam">("all");
  const all = data.mine.history;
  const list = useMemo(() => all.filter((h) => filter === "all" || h.kind === filter), [all, filter]);
  const z = data.mine.zone;

  return (
    <div className="detail hist">
      <div className={`hist-hero ${z.enabled ? z.level : "green"}`}>
        <span className="hist-dot" />
        <div>
          <div className="b" style={{ fontSize: 22 }}>{z.enabled ? z.title : "Green Zone"}</div>
          <div className="soft small">{z.enabled ? z.text : "ตอนนี้ทุกคนอยู่ Green Zone · ด้านล่างคือประวัติของคุณ"}</div>
        </div>
      </div>
      <h2 style={{ margin: "18px 2px 10px" }}>ประวัติ</h2>
      <Segmented value={filter} onChange={setFilter} options={[{ key: "all", label: "ทั้งหมด" }, { key: "fee", label: "เงินรุ่น" }, { key: "exam", label: "วิชาการ" }]} />
      <div className="hist-list">
        {list.length === 0 && (
          <div className="p-empty ok" style={{ padding: "26px 8px" }}>
            {filter === "exam" ? "ยังไม่มีงานวิชาการ" : filter === "fee" ? "ยังไม่มีการเรียกเก็บเงินรุ่น" : "ยังไม่มีการเรียกเก็บเงินรุ่นหรืองานวิชาการ"}<br />
            <span className="tiny muted">ทุกอย่างเริ่มต้นใหม่ ✨</span>
          </div>
        )}
        {list.map((h) => <Row key={`${h.kind}:${h.id}`} h={h} />)}
      </div>
      <div className="tiny muted" style={{ marginTop: 14, lineHeight: 1.55 }}>เห็นเฉพาะคุณ · อัปเดตอัตโนมัติเมื่อฝ่ายการเงิน/วิชาการบันทึก</div>
    </div>
  );
}

function Row({ h }: { h: H }) {
  const st = STATE[h.state] ?? { th: h.state, tone: "" };
  const fee = h.kind === "fee";
  const showLink = !!h.link && (fee ? UNPAID.includes(h.state) : h.state === "missing" || h.state === "open");
  const sub = fee
    ? `${h.amount ? `${h.amount.toLocaleString()} บาท` : "—"}${h.due ? ` · ครบกำหนด ${thDateTime(h.due, false)}` : ""}`
    : h.due ? `สอบ ${thDateTime(h.due, false)}` : "งานวิชาการ";
  return (
    <div className="hrow">
      <span className="hrow-ic">{fee ? "💸" : "📚"}</span>
      <span className="hrow-b"><b>{h.title}</b><small>{sub}</small></span>
      <span className="hrow-r">
        <span className={`chip ${st.tone}`}>{st.th}</span>
        {showLink && <a className="go-btn" href={h.link} target="_blank" rel="noopener noreferrer">{fee ? h.link_label || "ชำระเงิน" : "เปิด"}</a>}
      </span>
    </div>
  );
}
