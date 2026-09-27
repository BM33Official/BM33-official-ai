// ปฏิทิน & สรุปวันนี้ — เห็นทั้งเดือนในแวบเดียว + แก้การ์ด "สรุปวันนี้" ที่หน้าแรกของแอป
import Link from "next/link";
import { CalendarDays, Sun, Upload } from "lucide-react";
import { requireAdmin } from "@/lib/bc/auth";
import { readDailies, parseItems, currentDaily } from "@/lib/bc/daily";
import { agenda } from "@/lib/bc/agenda";
import { bkkDayKey, thDateTime } from "@/lib/time";
import { Head, Sq } from "../ui/kit";
import Calendar from "../ui/Calendar";
import DailyEditor from "../ui/DailyEditor";
import GenerateButton from "../ui/GenerateButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: { m?: string } }) {
  await requireAdmin();
  const today = bkkDayKey();
  const month = /^\d{4}-\d{2}$/.test(searchParams.m ?? "") ? searchParams.m! : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - 7 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m, 1) + 14 * 86_400_000).toISOString().slice(0, 10);
  const [items, all, cur] = await Promise.all([agenda(from, to), readDailies(true), currentDaily()]);
  const hist = [...all].filter((d) => d.status !== "deleted").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <div className="wrap">
      <Head icon={CalendarDays} tone="pink" title="ปฏิทิน & สรุปวันนี้" sub="ทุกคาบเรียน สอบ เดดไลน์ และนัด รวมไว้ที่เดียว — เพื่อน ๆ เห็นปฏิทินเดียวกันในแอป"
        right={<Link href="/admin/schedule" className="btn btn-sm"><Upload size={15} /> อัปโหลดตารางเรียน</Link>} />

      <Calendar month={month} today={today} items={items.map((i) => ({ day: i.day, time: i.time, kind: i.kind, title: i.title, sub: i.sub }))} />

      <div className="card-h" style={{ marginTop: 30 }}>
        <h2 className="row" style={{ margin: 0, gap: 10 }}><Sq icon={Sun} tone="yellow" /> สรุปวันนี้ (หน้าแรกของแอป)</h2>
        <GenerateButton action="daily.generate" label="✨ ให้ AI ร่างใหม่" />
      </div>
      {cur ? (
        <>
          {cur.date !== today && <div className="msg msg-err" style={{ marginBottom: 12 }}>แอปยังแสดงสรุปของ {cur.date} — กด “ให้ AI ร่างใหม่” หรือรอรอบ 05:30 น.</div>}
          <DailyEditor id={cur.id} headline={cur.headline} items={parseItems(cur.items)} status={cur.status} date={cur.date} />
        </>
      ) : <div className="card"><span className="hint">ยังไม่มีสรุป — กด “ให้ AI ร่างใหม่”</span></div>}

      {hist.length > 1 && (
        <details className="more">
          <summary>สรุปย้อนหลัง</summary>
          <div className="list" style={{ marginTop: 10 }}>
            {hist.map((d) => <div key={d.id} className="li"><div className="li-b"><b>{d.date} · {d.headline}</b><small>{parseItems(d.items).length} รายการ · {d.source === "edited" ? "แก้โดยแอดมิน" : "AI"} · {thDateTime(d.updated_at)}</small></div><span className={`badge ${d.status === "live" ? "b-green" : "b-muted"}`}>{d.status === "live" ? "แสดง" : d.status}</span></div>)}
          </div>
        </details>
      )}
    </div>
  );
}
