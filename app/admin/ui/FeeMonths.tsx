"use client";
// รายการเรียกเก็บ — เงินรุ่นรายเดือน หรือเรื่องอื่น (ค่าเสื้อ ค่ากิจกรรม) · ใส่ลิงก์ฟอร์ม/ช่องทางชำระ = ปุ่มในแอปของคนที่ยังไม่จ่าย
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Link2, Trash2, Pencil, X } from "lucide-react";
import { act } from "./api";

type M = { month: string; label: string; amount: string; due_date: string; note: string; link: string; link_label: string };
const EMPTY = (month: string): M & { other: boolean } => ({ month, label: "", amount: "", due_date: "", note: "", link: "", link_label: "", other: false });
const isMonthly = (k: string) => /^\d{4}-\d{2}$/.test(k);

function thisMonth(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
}

export default function FeeMonths({ months }: { months: M[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<(M & { other: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const set = (p: Partial<M & { other: boolean }>) => setDraft((d) => (d ? { ...d, ...p } : d));

  async function save() {
    if (!draft) return;
    if (draft.other && !draft.label.trim()) { setMsg({ t: "ใส่ชื่อรายการด้วย เช่น ค่าเสื้อรุ่น", ok: false }); return; }
    setBusy(true); setMsg(null);
    const r = await act("finance.month.save", { month: draft });
    setBusy(false);
    if (!r.ok) { setMsg({ t: String(r.error), ok: false }); return; }
    setMsg({ t: "บันทึกแล้ว ✓ เพื่อนเห็นในแอปทันที", ok: true });
    setDraft(null);
    router.refresh();
  }
  async function del(m: M) {
    if (!confirm(`ลบ “${m.label}”? (ข้อมูลการจ่ายของรายการนี้จะไม่แสดง)`)) return;
    await act("finance.month.delete", { month: m.month });
    router.refresh();
  }

  return (
    <div className="card">
      <div className="card-h">
        <h3 style={{ margin: 0 }}>รายการเรียกเก็บ <span className="hint" style={{ fontWeight: 500 }}>{months.length} รายการ</span></h3>
        {!draft && <button className="btn btn-sm btn-primary" onClick={() => { setMsg(null); setDraft(EMPTY(thisMonth())); }}><Plus size={15} /> เรียกเก็บใหม่</button>}
      </div>

      {draft && (
        <div className="fee-draft">
          <div className="seg" style={{ margin: "0 0 12px" }}>
            <button className={!draft.other ? "on" : ""} onClick={() => set({ other: false })} disabled={!!months.find((m) => m.month === draft.month)}>เงินรุ่นรายเดือน</button>
            <button className={draft.other ? "on" : ""} onClick={() => set({ other: true })} disabled={!!months.find((m) => m.month === draft.month)}>เรื่องอื่น (ค่าเสื้อ ฯลฯ)</button>
          </div>
          <div className="grid g2">
            <div className="field"><label>{draft.other ? "เดือนที่เรียกเก็บ" : "เดือน"}</label>
              <input type="month" value={draft.month.slice(0, 7)} disabled={!!months.find((m) => m.month === draft.month)} onChange={(e) => set({ month: e.target.value })} />
              {!draft.other && !months.find((m) => m.month === draft.month) && months.some((m) => m.month === draft.month.slice(0, 7)) && <div className="hint" style={{ color: "var(--orange-ink)" }}>เดือนนี้มีแล้ว — บันทึกจะแก้รายการเดิม</div>}</div>
            <div className="field"><label>ชื่อที่เพื่อนเห็น{draft.other ? " *" : ""}</label>
              <input value={draft.label} onChange={(e) => set({ label: e.target.value })} placeholder={draft.other ? "เช่น ค่าเสื้อรุ่น" : "เว้นว่าง = ต.ค. 69"} /></div>
            <div className="field"><label>ยอด (บาท)</label>
              <input type="number" inputMode="numeric" value={draft.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="200" /></div>
            <div className="field"><label>ครบกำหนด</label>
              <input type="date" value={draft.due_date} onChange={(e) => set({ due_date: e.target.value })} /></div>
            <div className="field" style={{ gridColumn: "1 / -1" }}><label className="row" style={{ gap: 6 }}><Link2 size={14} /> ลิงก์ฟอร์มชำระเงิน / ช่องทางจ่าย (ไม่บังคับ)</label>
              <input value={draft.link} onChange={(e) => set({ link: e.target.value })} placeholder="https://forms.gle/…" />
              <div className="hint">ใส่แล้วเพื่อนที่ยังไม่จ่ายเห็นปุ่มในแอป (หน้าของฉัน + ประวัติ) และในข้อความเตือน</div></div>
            {draft.link && (
              <div className="field"><label>ข้อความบนปุ่ม</label>
                <input value={draft.link_label} maxLength={20} onChange={(e) => set({ link_label: e.target.value })} placeholder="ชำระเงิน" /></div>
            )}
            <div className="field" style={draft.link ? undefined : { gridColumn: "1 / -1" }}><label>หมายเหตุ</label>
              <input value={draft.note} onChange={(e) => set({ note: e.target.value })} placeholder="ไม่บังคับ" /></div>
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={save} disabled={busy || !draft.month}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
            <button className="btn btn-ghost" onClick={() => setDraft(null)} disabled={busy}><X size={15} /> ยกเลิก</button>
          </div>
        </div>
      )}
      {msg && <div className={`msg ${msg.ok ? "msg-ok" : "msg-err"}`}>{msg.t}</div>}

      {months.length === 0 && !draft ? (
        <div className="hint" style={{ padding: "6px 2px" }}>ยังไม่มีการเรียกเก็บ — กด “เรียกเก็บใหม่” แล้วเพื่อนจะเห็นยอด + ปุ่มชำระในแอปทันที</div>
      ) : (
        <div className="list" style={{ marginTop: 10 }}>
          {[...months].reverse().map((m) => (
            <div key={m.month} className="li">
              <span className={`badge ${isMonthly(m.month) ? "b-green" : "b-purple"}`}>{isMonthly(m.month) ? "รายเดือน" : "อื่น ๆ"}</span>
              <div className="li-b">
                <b>{m.label} · {Number(m.amount || 0).toLocaleString()} บาท</b>
                <small>{m.due_date ? `ครบกำหนด ${m.due_date}` : "ไม่มีกำหนด"}{m.link ? ` · ปุ่ม “${m.link_label || "ชำระเงิน"}”` : " · ไม่มีลิงก์ชำระ"}{m.note ? ` · ${m.note}` : ""}</small>
              </div>
              <button className="btn btn-sm" onClick={() => { setMsg(null); setDraft({ ...m, other: !isMonthly(m.month) }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil size={14} /> แก้</button>
              <button className="btn btn-sm btn-ghost" onClick={() => del(m)} aria-label="ลบ"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
