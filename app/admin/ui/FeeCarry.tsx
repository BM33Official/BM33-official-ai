"use client";
// ค้างยกมา — นำเข้าไฟล์เก่าไม่ได้? กรอกสถานะปัจจุบันเองได้เลย (จำนวนเดือนที่ค้างก่อนเริ่มใช้ระบบ) แล้วใช้ต่อได้ทันที
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ClipboardPaste, Save } from "lucide-react";
import { act } from "./api";

type Person = { sid: string; no: number; nickname: string };

export default function FeeCarry({ people, initial }: { people: Person[]; initial: Record<string, number> }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, number>>(initial);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState(false);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const dirty = JSON.stringify(clean(v)) !== JSON.stringify(clean(initial));
  const total = Object.values(v).filter((n) => n > 0).length;

  const shown = useMemo(() => people.filter((p) => (!q || `${p.nickname}${p.no}${p.sid}`.toLowerCase().includes(q.toLowerCase())) && (!only || (v[p.sid] ?? 0) > 0)), [people, q, only, v]);
  const set = (sid: string, n: number) => setV((x) => ({ ...x, [sid]: Math.max(0, Math.min(24, n)) }));

  // วางจากชีต: แต่ละบรรทัด "เลขที่/รหัส  จำนวนเดือน" (คั่นด้วยช่องว่าง, tab หรือ ,)
  function applyPaste() {
    let hit = 0;
    const next = { ...v };
    for (const line of paste.split(/\r?\n/)) {
      const parts = line.trim().split(/[\s,\t]+/).filter(Boolean);
      if (parts.length < 2) continue;
      const key = parts[0].replace(/\D/g, "");
      const n = Number(parts[parts.length - 1].replace(/[^\d.]/g, ""));
      if (!key || !Number.isFinite(n)) continue;
      const p = key.length >= 6 ? people.find((x) => x.sid === key) : people.find((x) => x.no === Number(key));
      if (!p) continue;
      next[p.sid] = Math.max(0, Math.min(24, Math.round(n)));
      hit++;
    }
    setV(next);
    setMsg(`อ่านได้ ${hit} คน — ตรวจแล้วกดบันทึก`);
    setShowPaste(false);
  }
  async function save() {
    setBusy(true); setMsg("");
    const r = await act("finance.carry", { map: clean(v) });
    setBusy(false);
    setMsg(r.ok ? `บันทึกแล้ว ✓ ${r.n} คน · Red Zone ของวิชาการและแอปอัปเดตทันที` : `บันทึกไม่ได้: ${r.error ?? ""}`);
    if (r.ok) router.refresh();
  }

  return (
    <div className="card" data-dirty={dirty ? "1" : "0"}>
      <p className="hint" style={{ marginTop: 0 }}>นำเข้าไฟล์เก่าไม่ได้ ก็ไม่ต้องเริ่มใหม่ — ใส่ว่าแต่ละคน <b>ค้างมาแล้วกี่เดือน</b> ก่อนเริ่มใช้ระบบ แล้วใช้ตารางรายเดือนด้านบนต่อได้เลย · จ่ายแล้วค่อยลดตัวเลขลง · นับรวมใน Red Zone และเตือนเงินรุ่น</p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <input style={{ maxWidth: 220 }} placeholder="ค้นหาชื่อ/เลขที่…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className={`chip ${only ? "on" : ""}`}><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />เฉพาะคนที่ค้าง ({total})</label>
        <button className="btn-sm" onClick={() => setShowPaste((x) => !x)}><ClipboardPaste size={15} /> วางจากชีต</button>
        <span style={{ flex: 1 }} />
        {dirty && <button className="btn-sm btn-ghost" onClick={() => setV(initial)}>ยกเลิก</button>}
        <button className="btn-green" disabled={busy || !dirty} onClick={save}><Save size={16} /> บันทึก</button>
      </div>
      {showPaste && (
        <div style={{ marginTop: 10 }}>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} style={{ minHeight: 110 }} placeholder={"คัดลอก 2 คอลัมน์จากชีตเดิมมาวาง: เลขที่ (หรือรหัส) · จำนวนเดือนที่ค้าง\n12\t2\n45\t1\n6801101071\t3"} />
          <button className="btn-sm btn-primary" style={{ marginTop: 6 }} onClick={applyPaste} disabled={!paste.trim()}>ใส่ตัวเลขตามที่วาง</button>
        </div>
      )}
      {msg && <div className="msg msg-ok" style={{ marginTop: 10 }}>{msg}</div>}
      <div className="carry-grid">
        {shown.map((p) => {
          const n = v[p.sid] ?? 0;
          const changed = n !== (initial[p.sid] ?? 0);
          return (
            <div key={p.sid} className={`carry-it ${n > 0 ? "on" : ""} ${changed ? "dirty" : ""}`}>
              <span className="carry-n">#{p.no}</span>
              <span className="carry-name">{p.nickname}</span>
              <button className="carry-b" onClick={() => set(p.sid, n - 1)} disabled={n === 0} aria-label="ลด"><Minus size={14} /></button>
              <b className="carry-v">{n}</b>
              <button className="carry-b" onClick={() => set(p.sid, n + 1)} aria-label="เพิ่ม"><Plus size={14} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function clean(v: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(v).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
}
