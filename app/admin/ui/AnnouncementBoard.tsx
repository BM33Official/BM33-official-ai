"use client";
// รายการประกาศ — เลือกหลายอัน แล้วจัดเป็น "ชุด" (แอปโชว์เป็นก้อนเดียว) · เรียงลำดับในชุด · ซ่อน/ปักหมุด/หมวด/ส่ง LINE รวม
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Square, Layers, X, Pin, EyeOff, Eye, Bell, Ungroup, Pencil, Check, Search, ClipboardCheck } from "lucide-react";
import { act } from "./api";
import AnnouncementRow from "./AnnouncementRow";
import type { AnnDraft } from "./AnnouncementEditor";

type Meta = { created: string; deadline: string; rel: string; source: string; reminders: string; event?: string; overdue?: boolean };
export type Track = { formId: string; total: number; done: string[]; pending: string[]; unreg: string[] };
export type BoardItem = { a: AnnDraft & { id: string; group: string; order: number; created_at: string }; meta: Meta; track: Track | null };
const CATS = ["ทั่วไป", "การเงิน", "วิชาการ", "กิจกรรม", "ฟอร์ม/เอกสาร", "ด่วน"];
type Show = "live" | "draft" | "hidden" | "all";

export default function AnnouncementBoard({ items: initial, forms, committee }: { items: BoardItem[]; forms: { id: string; name: string }[]; committee: { nickname: string; role: string }[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  // ข้อมูลใหม่จาก server (หลัง router.refresh) — เช่น ตัวเลขคนที่กดกรอกแล้ว
  useEffect(() => { setItems(initial); }, [initial]);
  const [show, setShow] = useState<Show>("live");
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [rename, setRename] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const count = (s: string) => items.filter((x) => x.a.status === s).length;
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((x) => (show === "all" || x.a.status === show) && (!needle || `${x.a.title} ${x.a.summary} ${x.a.group}`.toLowerCase().includes(needle)));
  }, [items, show, q]);

  // ชุดที่ตั้งชื่อไว้ก่อน (เรียงตามลำดับในชุด) แล้วค่อยรายการที่ไม่ได้จัดชุด (ปักหมุด -> ใหม่สุด)
  const groups = useMemo(() => {
    const m = new Map<string, BoardItem[]>();
    for (const x of visible) if (x.a.group) m.set(x.a.group, [...(m.get(x.a.group) ?? []), x]);
    const ord = (x: BoardItem) => x.a.order || 9999;
    return Array.from(m.entries())
      .map(([g, list]) => ({ g, list: [...list].sort((p, r) => ord(p) - ord(r) || r.a.created_at.localeCompare(p.a.created_at)) }))
      .sort((p, r) => r.list[0].a.created_at.localeCompare(p.list[0].a.created_at));
  }, [visible]);
  const loose = useMemo(() => visible.filter((x) => !x.a.group).sort((p, r) => Number(r.a.pinned) - Number(p.a.pinned) || r.a.created_at.localeCompare(p.a.created_at)), [visible]);
  const groupNames = useMemo(() => Array.from(new Set(items.map((x) => x.a.group).filter(Boolean))), [items]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ids = Array.from(sel);
  const patchLocal = (pick: string[], p: Partial<BoardItem["a"]>) => setItems((l) => l.map((x) => (pick.includes(x.a.id) ? { ...x, a: { ...x.a, ...p } } : x)));

  async function bulk(patch: Record<string, string>, local: Partial<BoardItem["a"]>, done: string) {
    if (!ids.length) return;
    setBusy(true); setMsg(null);
    const r = await act("announce.bulk", { ids, patch });
    setBusy(false);
    if (!r.ok) { setMsg({ t: `ไม่สำเร็จ: ${r.error}`, ok: false }); return; }
    patchLocal(ids, local);
    setMsg({ t: done, ok: true });
    setSel(new Set()); setNaming(false); setName("");
    router.refresh();
  }
  async function group() {
    const g = name.trim();
    if (!g) return;
    // ต่อท้ายชุดเดิม (ถ้ามี) ตามลำดับที่เลือก
    const existing = items.filter((x) => x.a.group === g && !sel.has(x.a.id)).sort((p, r) => (p.a.order || 9999) - (r.a.order || 9999)).map((x) => x.a.id);
    const ordered = [...existing, ...ids];
    setBusy(true); setMsg(null);
    const r = await act("announce.bulk", { ids: ordered, patch: { group_name: g }, order: true });
    setBusy(false);
    if (!r.ok) { setMsg({ t: `ไม่สำเร็จ: ${r.error}`, ok: false }); return; }
    setItems((l) => l.map((x) => { const i = ordered.indexOf(x.a.id); return i >= 0 ? { ...x, a: { ...x.a, group: g, order: i + 1 } } : x; }));
    setMsg({ t: `จัดเป็นชุด “${g}” แล้ว (${ordered.length} เรื่อง) — ในแอปเพื่อนเห็นเป็นก้อนเดียว`, ok: true });
    setSel(new Set()); setNaming(false); setName(""); setPicking(false);
    router.refresh();
  }
  async function move(list: BoardItem[], i: number, dir: -1 | 1) {
    const order = list.map((x) => x.a.id);
    const j = i + dir;
    [order[i], order[j]] = [order[j], order[i]];
    setItems((l) => l.map((x) => { const k = order.indexOf(x.a.id); return k >= 0 ? { ...x, a: { ...x.a, order: k + 1 } } : x; }));
    await act("announce.bulk", { ids: order, patch: {}, order: true });
  }
  async function renameGroup(from: string) {
    const to = rename.trim();
    setRenaming(null);
    if (!to || to === from) return;
    const pick = items.filter((x) => x.a.group === from).map((x) => x.a.id);
    patchLocal(pick, { group: to });
    await act("announce.bulk", { ids: pick, patch: { group_name: to } });
    router.refresh();
  }
  async function ungroup(g: string) {
    const pick = items.filter((x) => x.a.group === g).map((x) => x.a.id);
    if (!confirm(`แยกชุด “${g}”? (ประกาศ ${pick.length} เรื่องยังอยู่ แค่ไม่รวมเป็นก้อนแล้ว)`)) return;
    patchLocal(pick, { group: "", order: 0 });
    await act("announce.bulk", { ids: pick, patch: { group_name: "", sort_order: "" } });
    router.refresh();
  }
  async function remind() {
    if (!ids.length) return;
    setBusy(true);
    const r = await act("announce.bulkRemind", { ids });
    setBusy(false);
    setMsg(r.ok ? { t: `เพิ่ม ${ids.length} เรื่องเข้า “เตือนรวม” #${r.code} แล้ว → ไปกดส่งที่ รออนุมัติ (เพื่อนได้ข้อความเดียว)`, ok: true } : { t: `ไม่สำเร็จ: ${r.error}`, ok: false });
    if (r.ok) setSel(new Set());
  }

  const row = (x: BoardItem, move_?: { up?: () => void; down?: () => void }) => (
    <AnnouncementRow key={`${x.a.id}:${x.a.status}`} a={x.a} meta={x.meta} forms={forms} committee={committee}
      select={picking ? { on: sel.has(x.a.id), toggle: () => toggle(x.a.id) } : undefined}
      move={!picking ? move_ : undefined}
      onStatus={(status) => patchLocal([x.a.id], { status })}
      track={x.track} />
  );

  return (
    <div>
      <div className="row between" style={{ marginTop: 30, gap: 10 }}>
        <h2 style={{ margin: 0 }}>ทั้งหมด</h2>
        <div className="row" style={{ gap: 8 }}>
          <div className="seg" style={{ margin: 0 }}>
            {([["live", `บนแอป ${count("live")}`], ["draft", `ร่าง ${count("draft")}`], ["hidden", `ซ่อน ${count("hidden")}`], ["all", "ทั้งหมด"]] as [Show, string][]).map(([k, l]) => (
              <button key={k} className={show === k ? "on" : ""} onClick={() => setShow(k)}>{l}</button>
            ))}
          </div>
          <label className="ann-search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา" /></label>
          <button className={`btn btn-sm ${picking ? "btn-primary" : ""}`} onClick={() => { setPicking((v) => !v); setSel(new Set()); setNaming(false); }}>
            {picking ? <><X size={15} /> เลิกเลือก</> : <><CheckSquare size={15} /> เลือกหลายอัน</>}
          </button>
        </div>
      </div>
      {picking && <div className="hint" style={{ marginTop: 8 }}>ติ๊กประกาศที่อยากจัดการพร้อมกัน → จัดเป็นชุด (เช่น “กีฬาสี”, “สอบกลางภาค”) แอปจะรวมเป็นก้อนเดียวให้เพื่อนอ่านง่าย · หรือซ่อน/ปักหมุด/ส่ง LINE รวมทีเดียว</div>}
      {msg && <div className={`msg ${msg.ok ? "msg-ok" : "msg-err"}`} style={{ marginTop: 10 }}>{msg.t}</div>}

      <div className="stack" style={{ marginTop: 14 }}>
        {visible.length === 0 && <div className="card"><span className="hint">ยังไม่มีรายการในหมวดนี้</span></div>}

        {groups.map(({ g, list }) => (
          <div key={g} className="ann-group">
            <div className="ann-group-h">
              {picking && (
                <button className="btn btn-sm btn-ghost" onClick={() => setSel((s) => { const n = new Set(s); const all = list.every((x) => n.has(x.a.id)); list.forEach((x) => (all ? n.delete(x.a.id) : n.add(x.a.id))); return n; })}>
                  {list.every((x) => sel.has(x.a.id)) ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
              )}
              <Layers size={17} />
              {renaming === g ? (
                <span className="row" style={{ gap: 6 }}>
                  <input autoFocus value={rename} onChange={(e) => setRename(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") renameGroup(g); if (e.key === "Escape") setRenaming(null); }} style={{ width: 220 }} />
                  <button className="btn btn-sm btn-primary" onClick={() => renameGroup(g)}><Check size={14} /></button>
                </span>
              ) : (
                <b>{g}</b>
              )}
              <span className="badge b-muted">{list.length} เรื่อง</span>
              <span style={{ flex: 1 }} />
              {renaming !== g && <button className="btn btn-sm btn-ghost" onClick={() => { setRenaming(g); setRename(g); }}><Pencil size={14} /> เปลี่ยนชื่อ</button>}
              <button className="btn btn-sm btn-ghost" onClick={() => ungroup(g)}><Ungroup size={14} /> แยกชุด</button>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {list.map((x, i) => row(x, { up: i > 0 ? () => move(list, i, -1) : undefined, down: i < list.length - 1 ? () => move(list, i, 1) : undefined }))}
            </div>
          </div>
        ))}

        {groups.length > 0 && loose.length > 0 && <div className="hint b" style={{ margin: "6px 2px -4px" }}>ไม่ได้จัดชุด</div>}
        {loose.map((x) => row(x))}
      </div>

      {picking && sel.size > 0 && (
        <div className="sticky-bar ann-bar">
          <b style={{ alignSelf: "center", marginRight: "auto" }}>เลือก {sel.size} เรื่อง</b>
          {naming ? (
            <span className="row" style={{ gap: 6 }}>
              <input autoFocus list="ann-groups" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") group(); }} placeholder="ชื่อชุด เช่น กีฬาสี" style={{ width: 200 }} />
              <datalist id="ann-groups">{groupNames.map((g) => <option key={g} value={g} />)}</datalist>
              <button className="btn btn-sm btn-primary" disabled={busy || !name.trim()} onClick={group}><Check size={14} /> จัดชุด</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setNaming(false)}><X size={14} /></button>
            </span>
          ) : (
            <>
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => setNaming(true)}><Layers size={15} /> จัดเป็นชุด</button>
              <button className="btn btn-sm" disabled={busy} onClick={() => bulk({ group_name: "", sort_order: "" }, { group: "", order: 0 }, "เอาออกจากชุดแล้ว")}><Ungroup size={15} /> ออกจากชุด</button>
              <button className="btn btn-sm" disabled={busy} onClick={() => bulk({ pinned: "1" }, { pinned: true }, "ปักหมุดแล้ว")}><Pin size={15} /> ปักหมุด</button>
              <button className="btn btn-sm" disabled={busy} onClick={() => bulk({ pinned: "" }, { pinned: false }, "เลิกปักหมุดแล้ว")}>เลิกปัก</button>
              <button className="btn btn-sm" disabled={busy} onClick={() => bulk({ status: "hidden" }, { status: "hidden" }, "ซ่อนแล้ว")}><EyeOff size={15} /> ซ่อน</button>
              <button className="btn btn-sm" disabled={busy} onClick={() => bulk({ status: "live" }, { status: "live" }, "ขึ้นแอปแล้ว")}><Eye size={15} /> ขึ้นแอป</button>
              <select className="btn btn-sm" style={{ width: "auto" }} value="" disabled={busy} onChange={(e) => { const c = e.target.value; if (c) bulk({ category: c }, { category: c }, `เปลี่ยนหมวดเป็น ${c} แล้ว`); }}>
                <option value="">หมวด…</option>
                {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="btn btn-sm" disabled={busy} onClick={async () => { setBusy(true); const r = await act("announce.todo", { ids, on: true }); setBusy(false); setMsg(r.ok ? { t: `ตั้ง “ทุกคนต้องกรอก” ${r.n} เรื่องแล้ว — ขึ้นใน สิ่งที่ต้องกรอก ของแอป และดูได้ว่าใครกดแล้ว`, ok: true } : { t: `ไม่สำเร็จ: ${r.error}`, ok: false }); if (r.ok) { setSel(new Set()); router.refresh(); } }}><ClipboardCheck size={15} /> ทุกคนต้องกรอก</button>
              <button className="btn btn-sm btn-green" disabled={busy} onClick={remind}><Bell size={15} /> ส่ง LINE รวม</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
