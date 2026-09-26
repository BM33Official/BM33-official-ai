"use client";
import { useState } from "react";
import { act } from "./api";

export default function FinanceImport({ months, serviceEmail }: { months: { month: string; label: string }[]; serviceEmail: string }) {
  const [link, setLink] = useState("");
  const [info, setInfo] = useState<{ sheetId: string; tabs: string[]; headers: Record<string, string[]> } | null>(null);
  const [tab, setTab] = useState("");
  const [idCol, setIdCol] = useState("");
  const [map, setMap] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const headers = info && tab ? info.headers[tab] ?? [] : [];

  async function inspect() {
    setBusy(true); setMsg("");
    const r = await act("finance.inspect", { link });
    setBusy(false);
    if (!r.ok || r.error) { setMsg(String(r.error ?? "อ่านไม่ได้")); return; }
    const x = r as unknown as { sheetId: string; tabs: string[]; headers: Record<string, string[]> };
    setInfo(x); setTab(x.tabs[0] ?? "");
  }
  async function run(apply: boolean) {
    if (!info || !tab || !idCol) return;
    setBusy(true);
    const r = await act("finance.import", { sheetId: info.sheetId, tab, idColumn: idCol, months: map, apply });
    setBusy(false);
    if (!r.ok) { setMsg(`ไม่สำเร็จ: ${r.error}`); return; }
    setMsg(apply ? `นำเข้าแล้ว ${r.applied} ช่อง ✅` : `พรีวิว: จะลงว่าจ่ายแล้ว ${r.preview} ช่อง — กด “นำเข้าจริง” เพื่อยืนยัน`);
    if (apply) setTimeout(() => window.location.reload(), 900);
  }

  return (
    <details className="card">
      <summary style={{ cursor: "pointer", fontWeight: 800 }}>นำเข้าจากชีตของฝ่ายการเงิน (ไม่บังคับ)</summary>
      <p className="hint">ถ้าฝ่ายการเงินมีชีตของตัวเองอยู่แล้ว: แชร์ชีตนั้นแบบ Viewer ให้ <b>{serviceEmail}</b> แล้ววางลิงก์ — ระบบอ่านครั้งเดียวแล้วลงในตาราง (ไม่เก็บลิงก์ ไม่แก้ชีตต้นทาง)</p>
      <div className="row" style={{ flexWrap: "nowrap" }}><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="ลิงก์ Google Sheet" /><button onClick={inspect} disabled={busy || !link}>ตรวจชีต</button></div>
      {info && (
        <div style={{ marginTop: 12 }}>
          <div className="grid g2">
            <div className="field"><label>แท็บ</label><select value={tab} onChange={(e) => setTab(e.target.value)}>{info.tabs.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field"><label>คอลัมน์รหัสนักศึกษา</label><select value={idCol} onChange={(e) => setIdCol(e.target.value)}><option value="">— เลือก —</option>{headers.map((h) => <option key={h}>{h}</option>)}</select></div>
          </div>
          <label style={{ fontSize: 13, fontWeight: 700 }}>จับคู่เดือน → คอลัมน์ (ช่องที่มีค่า และไม่ใช่ 0/ค้าง/ไม่ = จ่ายแล้ว)</label>
          <div className="grid g2" style={{ marginTop: 6 }}>
            {months.map((m) => (
              <div key={m.month} className="row" style={{ flexWrap: "nowrap" }}>
                <span style={{ width: 90, fontWeight: 700 }}>{m.label || m.month}</span>
                <select value={map[m.month] ?? ""} onChange={(e) => setMap((x) => ({ ...x, [m.month]: e.target.value }))}><option value="">— ไม่นำเข้า —</option>{headers.map((h) => <option key={h}>{h}</option>)}</select>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={() => run(false)} disabled={busy || !idCol}>พรีวิว</button>
            <button className="btn-primary" onClick={() => run(true)} disabled={busy || !idCol}>นำเข้าจริง</button>
          </div>
        </div>
      )}
      {msg && <div className="msg msg-ok">{msg}</div>}
    </details>
  );
}
