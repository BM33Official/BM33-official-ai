"use client";
// คำถามล่าสุดจากเพื่อน ๆ — เรียง/กรองได้ (ล่าสุด · เก่าสุด · ตอบไม่ได้ก่อน · ตามคน) + ค้นหา
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { agoTh, thDateTime } from "@/lib/time";

export type Q = { ts: string; nickname: string; question: string; reply: string; kind: string; route: string };
const ROUTE_TH: Record<string, [string, string]> = { rule: ["กฎ", "b-green"], cache: ["แคช", "b-green"], ai: ["AI", "b-blue"], "ai+search": ["AI+ค้น", "b-purple"], budget: ["งบหมด", "b-red"], cap: ["เกินโควตา", "b-orange"] };
const KIND_TH: Record<string, [string, string]> = { answer: ["ตอบได้", "b-green"], partial: ["บางส่วน", "b-orange"], cannot_answer: ["ส่งต่อประธาน", "b-red"], smalltalk: ["คุยเล่น", "b-blue"] };
const KIND_RANK: Record<string, number> = { cannot_answer: 0, partial: 1, answer: 2, smalltalk: 3 };
type Sort = "new" | "old" | "problem" | "person";

export default function RecentQuestions({ rows }: { rows: Q[] }) {
  const [sort, setSort] = useState<Sort>("new");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(40);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = rows.filter((r) => (!kind || r.kind === kind) && (!needle || `${r.nickname} ${r.question} ${r.reply}`.toLowerCase().includes(needle)));
    const byTime = (a: Q, b: Q) => b.ts.localeCompare(a.ts);
    if (sort === "old") return [...f].sort((a, b) => a.ts.localeCompare(b.ts));
    if (sort === "problem") return [...f].sort((a, b) => (KIND_RANK[a.kind] ?? 5) - (KIND_RANK[b.kind] ?? 5) || byTime(a, b));
    if (sort === "person") return [...f].sort((a, b) => (a.nickname || "~").localeCompare(b.nickname || "~", "th") || byTime(a, b));
    return [...f].sort(byTime);
  }, [rows, sort, kind, q]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const r of rows) c[r.kind] = (c[r.kind] ?? 0) + 1; return c; }, [rows]);

  let lastPerson = "";
  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div className="seg" style={{ margin: 0 }}>
          {([["new", "ล่าสุด"], ["old", "เก่าสุด"], ["problem", "ตอบไม่ได้ก่อน"], ["person", "ตามคน"]] as [Sort, string][]).map(([k, l]) => (
            <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{l}</button>
          ))}
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: "auto" }}>
          <option value="">ทุกผลลัพธ์ ({rows.length})</option>
          {Object.entries(KIND_TH).map(([k, [th]]) => <option key={k} value={k}>{th} ({counts[k] ?? 0})</option>)}
        </select>
        <label className="ann-search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาคำถาม/ชื่อ" /></label>
      </div>
      <div className="list">
        {list.length === 0 && <div className="li"><span className="hint">ไม่มีรายการ</span></div>}
        {list.slice(0, limit).map((c, i) => {
          const head = sort === "person" && c.nickname !== lastPerson;
          lastPerson = c.nickname;
          return (
            <div key={`${c.ts}-${i}`} style={{ display: "contents" }}>
              {head && <div className="li" style={{ background: "var(--fill)", padding: "6px 12px" }}><b style={{ fontSize: 13 }}>{c.nickname || "ไม่ระบุ"}</b><span className="hint" style={{ marginLeft: "auto" }}>{list.filter((x) => x.nickname === c.nickname).length} คำถาม</span></div>}
              <details className="li" style={{ display: "block" }}>
                <summary style={{ listStyle: "none", cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}>
                  <span className={`badge ${KIND_TH[c.kind]?.[1] ?? ""}`}>{KIND_TH[c.kind]?.[0] ?? c.kind}</span>
                  {c.route && <span className={`badge ${ROUTE_TH[c.route]?.[1] ?? ""}`}>{ROUTE_TH[c.route]?.[0] ?? c.route}</span>}
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{sort === "person" ? "" : `${c.nickname || "ไม่ระบุ"}: `}{c.question}</span>
                  <span className="hint" style={{ whiteSpace: "nowrap" }} title={thDateTime(c.ts)}>{agoTh(c.ts)}</span>
                </summary>
                {c.reply && <div className="hint" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{c.reply}</div>}
              </details>
            </div>
          );
        })}
      </div>
      {list.length > limit && <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setLimit((n) => n + 60)}>ดูเพิ่ม ({list.length - limit})</button>}
    </div>
  );
}
