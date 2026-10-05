"use client";
// กลุ่ม LINE ของบอท — ดูว่าบอทอยู่กลุ่มไหน เก็บข้อมูลอยู่ไหม + ให้บอทออกจากกลุ่ม (บอทเงียบในกลุ่มเสมอ)
import { useCallback, useEffect, useState } from "react";
import { Users, LogOut, RefreshCw, CheckCircle2, CircleSlash } from "lucide-react";
import { act } from "./api";

type G = { id: string; name: string; picture: string; members: number | null; inGroup: boolean; learning: boolean; first: string; last: string };

export default function GroupsPanel({ learnAll: init }: { learnAll: boolean }) {
  const [groups, setGroups] = useState<G[] | null>(null);
  const [all, setAll] = useState(init);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    setBusy("load");
    const r = await act("groups.list", {});
    setBusy("");
    if (r.ok) setGroups(r.groups as G[]); else setMsg(String(r.error));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function leave(g: G) {
    if (!confirm(`ให้บอทออกจากกลุ่ม “${g.name || g.id}”? (บอทจะเลิกเก็บข้อมูลจากกลุ่มนี้ · เชิญกลับได้ภายหลัง)`)) return;
    setBusy(g.id);
    const r = await act("groups.leave", { id: g.id });
    setBusy("");
    setMsg(r.ok ? `บอทออกจาก “${g.name || "กลุ่ม"}” แล้ว` : `ไม่สำเร็จ: ${r.error}`);
    load();
  }
  async function toggleAll(v: boolean) {
    setAll(v);
    const r = await act("settings.set", { key: "learn_groups", value: v ? "*" : "" });
    if (!r.ok) setAll(!v); else load();
  }

  return (
    <div className="card">
      <div className="card-h">
        <label className="row" style={{ gap: 10, flexWrap: "nowrap", cursor: "pointer" }}>
          <span className="switch"><input type="checkbox" checked={all} onChange={(e) => toggleAll(e.target.checked)} /><span /></span>
          <span style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>เก็บข้อมูลจากทุกกลุ่มที่บอทอยู่<br /><span className="hint" style={{ fontWeight: 600 }}>{all ? "เพิ่มบอทเข้ากลุ่มไหน ก็เริ่มเก็บทันที" : "ใช้รายชื่อกลุ่มจาก Vercel (LEARN_GROUP_IDS)"}</span></span>
        </label>
        <button className="btn btn-sm" onClick={load} disabled={!!busy}><RefreshCw size={14} /> รีเฟรช</button>
      </div>
      <div className="list">
        {groups === null && <div className="li"><span className="hint">กำลังโหลด…</span></div>}
        {groups?.length === 0 && <div className="li"><span className="hint">ยังไม่เห็นกลุ่มไหน — เชิญบอทเข้ากลุ่ม แล้วมีคนพิมพ์สักข้อความ จะขึ้นที่นี่</span></div>}
        {groups?.map((g) => (
          <div key={g.id} className="li" style={{ opacity: g.inGroup ? 1 : 0.55 }}>
            {g.picture ? <img src={g.picture} alt="" width={40} height={40} style={{ borderRadius: 12, flex: "none" }} /> : <span className="ic lg c-line"><Users strokeWidth={2.4} /></span>}
            <div className="li-b">
              <b>{g.name || "กลุ่ม (ยังอ่านชื่อไม่ได้)"}</b>
              <small>{g.inGroup ? `${g.members ?? "?"} คน · ` : "บอทไม่ได้อยู่ในกลุ่มนี้แล้ว · "}{g.learning ? "เก็บข้อมูลอยู่" : "ไม่เก็บข้อมูล"} · …{g.id.slice(-6)}</small>
            </div>
            {g.inGroup && (g.learning ? <span className="badge b-green"><CheckCircle2 size={12} /> เก็บอยู่</span> : <span className="badge b-muted"><CircleSlash size={12} /> ไม่เก็บ</span>)}
            {g.inGroup && <button className="btn btn-sm btn-danger" disabled={!!busy} onClick={() => leave(g)}><LogOut size={14} /> ให้บอทออก</button>}
          </div>
        ))}
      </div>
      {msg && <div className="msg msg-ok">{msg}</div>}
    </div>
  );
}
