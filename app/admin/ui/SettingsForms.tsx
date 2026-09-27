"use client";
import { useEffect, useState } from "react";
import { act } from "./api";

export function ConfigField({ k, label, value, hint, textarea, placeholder }: { k: string; label: string; value: string; hint?: string; textarea?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value);
  const [msg, setMsg] = useState("");
  async function save() {
    const r = await act("settings.set", { key: k, value: v });
    setMsg(r.ok ? "บันทึกแล้ว ✅" : `ไม่สำเร็จ: ${r.error}`);
    setTimeout(() => setMsg(""), 2500);
  }
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
        {textarea ? <textarea value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} style={{ minHeight: 70 }} /> : <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />}
        <button className="btn-sm" onClick={save} disabled={v === value && !msg}>บันทึก</button>
      </div>
      {hint && <div className="hint">{hint}</div>}
      {msg && <span className="badge b-ok">{msg}</span>}
    </div>
  );
}

export function RolePassword({ role, label, enabled }: { role: "academic" | "finance"; label: string; enabled: boolean }) {
  const [pw, setPw] = useState("");
  const [shown, setShown] = useState("");
  const [msg, setMsg] = useState("");
  async function set(value: string) {
    const r = await act("settings.password", { role, password: value });
    if (r.ok) { setShown(value); setMsg(value ? "ตั้งรหัสแล้ว — ส่งรหัสนี้ให้ฝ่ายนั้น (จะไม่แสดงอีก)" : "ปิดการเข้าใช้ของฝ่ายนี้แล้ว"); setPw(""); }
    else setMsg(`ไม่สำเร็จ: ${r.error}`);
  }
  const gen = () => set(`bm33-${role.slice(0, 3)}-${Math.random().toString(36).slice(2, 8)}`);
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><b>{label}</b><span className={`badge ${enabled ? "b-ok" : "b-muted"}`}>{enabled ? "เปิดใช้อยู่" : "ยังไม่ตั้ง"}</span></div>
      <p className="hint">เข้าที่ /admin/login ด้วยรหัสนี้ → เห็นเฉพาะหน้า{role === "finance" ? "การเงิน" : "วิชาการ"}</p>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="ตั้งรหัสเอง (≥ 8 ตัว)" />
        <button className="btn-sm" disabled={pw.length < 8} onClick={() => set(pw)}>ตั้ง</button>
        <button className="btn-sm btn-primary" onClick={gen}>สุ่มรหัสใหม่</button>
        {enabled && <button className="btn-sm btn-ghost" onClick={() => confirm("ปิดการเข้าใช้ของฝ่ายนี้?") && set("")}>ปิด</button>}
      </div>
      {shown && <div className="msg msg-ok">รหัส: <b style={{ fontFamily: "monospace", fontSize: 16 }}>{shown}</b></div>}
      {msg && <div className="hint">{msg}</div>}
    </div>
  );
}

// งบ AI กรอกเป็นบาท (เก็บเป็นดอลลาร์ตามที่ Google คิดเงิน)
export function BudgetBaht({ usd, rate }: { usd: number; rate: number }) {
  const [thb, setThb] = useState(String(Math.round(usd * rate)));
  const [r, setR] = useState(String(rate));
  const [msg, setMsg] = useState("");
  async function save() {
    const rt = Number(r) > 0 ? Number(r) : 33;
    const a = await act("settings.set", { key: "usd_thb", value: String(rt) });
    const b = await act("settings.set", { key: "ai_budget_usd", value: (Number(thb) / rt).toFixed(2) });
    setMsg(a.ok && b.ok ? "บันทึกแล้ว ✅" : "บันทึกไม่ได้");
  }
  return (
    <div className="grid g2">
      <div className="field"><label>งบ AI ต่อเดือน (บาท)</label><input type="number" value={thb} onChange={(e) => setThb(e.target.value)} /><div className="hint">ใช้เกิน 80% → โหมดประหยัด · ครบ 100% → ตอบจากกฎ/แคชอย่างเดียวจนขึ้นเดือนใหม่</div></div>
      <div className="field"><label>อัตราแลกเปลี่ยน (บาท / 1 ดอลลาร์)</label>
        <div className="row" style={{ flexWrap: "nowrap" }}><input type="number" value={r} onChange={(e) => setR(e.target.value)} /><button className="btn-sm btn-primary" onClick={save}>บันทึก</button></div>
        {msg && <div className="hint">{msg}</div>}
      </div>
    </div>
  );
}

export function AccessLinks() {
  const [links, setLinks] = useState<{ finance?: string | null; academic?: string | null } | null>(null);
  const [copied, setCopied] = useState("");
  useEffect(() => { act("access.links").then((r) => r.ok && setLinks(r as never)); }, []);
  const rows = [{ k: "finance" as const, th: "ฝ่ายการเงิน", note: "เปิดแล้วเห็นเฉพาะหน้าเงินรุ่น" }, { k: "academic" as const, th: "ฝ่ายวิชาการ", note: "เปิดแล้วเห็นเฉพาะหน้าวิชาการ & Red Zone" }];
  return (
    <div className="list">
      {rows.map((r) => {
        const url = links?.[r.k];
        return (
          <div key={r.k} className="li">
            <div className="li-b"><b>{r.th}</b><small>{url ? r.note : links ? "ตั้งรหัสผ่านของฝ่ายนี้ก่อน" : "…"}</small>{url && <small style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{url}</small>}</div>
            {url && <button className="btn-sm btn-primary" onClick={() => { navigator.clipboard.writeText(url); setCopied(r.k); setTimeout(() => setCopied(""), 2000); }}>{copied === r.k ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}</button>}
          </div>
        );
      })}
    </div>
  );
}

type C = { student_id: string; nickname: string; role: string; contact_url: string };
export function CommitteeEditor({ rows: init, roster }: { rows: C[]; roster: { sid: string; label: string; nickname: string }[] }) {
  const [rows, setRows] = useState<C[]>(init);
  const [msg, setMsg] = useState("");
  const upd = (i: number, p: Partial<C>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  async function save() {
    const r = await act("settings.committee", { rows });
    setMsg(r.ok ? `บันทึก ${r.n} คนแล้ว ✅` : `ไม่สำเร็จ: ${r.error}`);
  }
  return (
    <div className="card tablecard editable-table">
      <table>
        <thead><tr><th>นักศึกษา</th><th>ชื่อที่แสดง</th><th>ตำแหน่ง</th><th>ลิงก์ LINE (https://line.me/ti/p/~id)</th><th></th></tr></thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={i}>
              <td><select value={c.student_id} onChange={(e) => { const r = roster.find((x) => x.sid === e.target.value); upd(i, { student_id: e.target.value, nickname: c.nickname || r?.nickname || "" }); }} style={{ minWidth: 190 }}>
                <option value="">—</option>{roster.map((r) => <option key={r.sid} value={r.sid}>{r.label}</option>)}
              </select></td>
              <td><input value={c.nickname} onChange={(e) => upd(i, { nickname: e.target.value })} style={{ width: 110 }} /></td>
              <td><input value={c.role} onChange={(e) => upd(i, { role: e.target.value })} style={{ minWidth: 150 }} /></td>
              <td><input value={c.contact_url} onChange={(e) => upd(i, { contact_url: e.target.value })} style={{ minWidth: 260 }} /></td>
              <td><button className="btn-sm btn-ghost" onClick={() => setRows((r) => r.filter((_, k) => k !== i))}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ padding: 10 }}>
        <button className="btn-sm" onClick={() => setRows((r) => [...r, { student_id: "", nickname: "", role: "", contact_url: "" }])}>+ เพิ่ม</button>
        <button className="btn-sm btn-primary" onClick={save}>บันทึกรายชื่อ</button>
        {msg && <span className="badge b-ok">{msg}</span>}
      </div>
      <p className="hint" style={{ padding: "0 10px 8px" }}>ข้อความในกลุ่มจากคนในรายชื่อนี้ = ประกาศทางการ (ระบบดึงขึ้นแอปเอง) · ตำแหน่งที่มีคำว่า “ประธาน” จะเป็นปุ่มแรกในการ์ดติดต่อเมื่อบอทตอบไม่ได้</p>
    </div>
  );
}

export function RichMenuPanel() {
  const [st, setSt] = useState<{ ours: string; current: string; isDefault: boolean } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => { const r = await act("richmenu.status"); if (r.ok) setSt(r as never); };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function run(action: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true); setMsg("");
    const r = await act(action);
    setBusy(false);
    setMsg(r.ok ? "เรียบร้อย ✅" : `ไม่สำเร็จ: ${r.error}`);
    load();
  }
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>เมนู LINE v4</b>
        <span className={`badge ${st?.isDefault ? "b-ok" : st?.ours ? "b-warn" : "b-muted"}`}>{st ? (st.isDefault ? "ทุกคนใช้เมนูใหม่แล้ว" : st.ours ? "สร้างแล้ว · ยังไม่เปิดให้ทุกคน" : "ยังไม่สร้าง") : "…"}</span>
      </div>
      <img src="/rich-menu-v4.jpg" alt="rich menu" style={{ width: "100%", maxWidth: 520, borderRadius: 12, marginTop: 10, border: "1px solid var(--line)" }} />
      <p className="hint">หน้าหลัก (ปุ่มใหญ่) · ประกาศ + สิ่งที่ต้องกรอก · ของฉัน · เซียมซี · ถามบอท · แถบล่าง LinkTree วิชาการ — ลองกับบัญชีตัวเองก่อน แล้วค่อยเปิดให้ทุกคน</p>
      <div className="row">
        {!st?.ours && <button className="btn-primary btn-sm" disabled={busy} onClick={() => run("richmenu.create")}>สร้างเมนู</button>}
        {st?.ours && <button className="btn-sm" disabled={busy} onClick={() => run("richmenu.linkMe")}>ลองใช้เฉพาะบัญชีฉัน</button>}
        {st?.ours && <button className="btn-sm btn-ghost" disabled={busy} onClick={() => run("richmenu.unlinkMe")}>เลิกลอง (กลับเมนูเดิม)</button>}
        {st?.ours && !st.isDefault && <button className="btn-green btn-sm" disabled={busy} onClick={() => run("richmenu.setDefault", "เปิดใช้เมนูใหม่กับเพื่อน ๆ ทุกคนเลยไหม?")}>เปิดใช้กับทุกคน</button>}
        {msg && <span className="badge b-ok">{msg}</span>}
      </div>
    </div>
  );
}
