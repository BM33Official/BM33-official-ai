"use client";
import { useMemo, useState } from "react";

export type MemberRow = {
  student_id: string;
  full_name: string;
  nickname: string;
  line_name: string;
  state: "verified" | "onboarding" | "mismatch" | "missing";
  onboarded_at: string;
};

const FILTERS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "verified", label: "ยืนยันแล้ว" },
  { key: "onboarding", label: "กำลังลงทะเบียน" },
  { key: "missing", label: "ยังไม่แอดบอท" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function badge(state: MemberRow["state"]) {
  if (state === "verified") return <span className="badge b-ok">ยืนยันแล้ว</span>;
  if (state === "mismatch") return <span className="badge b-danger">ข้อมูลไม่ตรง</span>;
  if (state === "onboarding") return <span className="badge b-warn">กำลังลงทะเบียน</span>;
  return <span className="badge b-muted">ยังไม่แอดบอท</span>;
}

export default function MembersTable({ rows, total, verified, onboarding, missing }: {
  rows: MemberRow[]; total: number; verified: number; onboarding: number; missing: number;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [asc, setAsc] = useState(true);

  const shown = useMemo(() => {
    let r = rows;
    if (filter === "missing") r = r.filter((x) => x.state === "missing");
    else if (filter === "verified") r = r.filter((x) => x.state === "verified");
    else if (filter === "onboarding") r = r.filter((x) => x.state === "onboarding" || x.state === "mismatch");
    if (q) {
      const s = q.toLowerCase();
      r = r.filter((x) => (x.student_id + x.full_name + x.nickname + x.line_name).toLowerCase().includes(s));
    }
    const sorted = [...r].sort((a, b) => a.student_id.localeCompare(b.student_id, undefined, { numeric: true }));
    return asc ? sorted : sorted.reverse();
  }, [rows, q, filter, asc]);

  return (
    <div>
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <div className="card"><div className="label">ทั้งรุ่น</div><div className="stat">{total}<small> คน</small></div></div>
        <div className="card"><div className="label">ยืนยันแล้ว</div><div className="stat">{verified}<small> คน</small></div></div>
        <div className="card"><div className="label">กำลังลงทะเบียน</div><div className="stat">{onboarding}<small> คน</small></div></div>
        <div className="card"><div className="label">ยังไม่แอดบอท</div><div className="stat">{missing}<small> คน</small></div></div>
      </div>

      <div className="row" style={{ marginBottom: 12, gap: 10 }}>
        <input placeholder="ค้นหาชื่อ / ชื่อเล่น / รหัส…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280, width: "auto", flex: "1 1 220px" }} />
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f.key} className={`chip ${filter === f.key ? "on" : ""}`} onClick={() => setFilter(f.key)} style={{ border: "1.5px solid var(--line)" }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card tablecard">
        {shown.length === 0 ? (
          <p className="sub" style={{ margin: 0, padding: 14 }}>ไม่พบรายการที่ตรงกับตัวกรอง</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => setAsc((v) => !v)}>รหัส นศ. {asc ? "▲" : "▼"}</th>
                <th>ชื่อในทะเบียน</th>
                <th>ชื่อเล่น</th>
                <th>ชื่อ LINE</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.student_id + m.line_name} style={m.state === "missing" ? { opacity: 0.72 } : undefined}>
                  <td><b>{m.student_id || "-"}</b></td>
                  <td>{m.full_name || "-"}</td>
                  <td>{m.nickname || "-"}</td>
                  <td>{m.line_name || <span className="hint">— ยังไม่แอด —</span>}</td>
                  <td>{badge(m.state)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
