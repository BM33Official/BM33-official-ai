// ไฟล์ปฏิทิน (.ics) ของประกาศ — แอปเปิดลิงก์นี้ใน Safari/Chrome (นอก LINE) เพราะเบราว์เซอร์ใน LINE โหลดไฟล์ไม่ได้
//   GET /api/cal/<annId>?s=<signCal(annId)>  -> เพิ่มลงปฏิทิน + แจ้งเตือนล่วงหน้า 1 วัน และ 2 ชั่วโมง
import { NextResponse } from "next/server";
import { getAnnouncement } from "@/lib/bc/announcements";
import { verifyCal } from "@/lib/app/session";
import { fixtureEnabled } from "@/lib/app/fixture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP = "https://liff.line.me/2011755768-aSlCqo7l";
const esc = (s: string) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// บรรทัด iCalendar ยาวเกิน 75 byte ต้องพับ (ภาษาไทย 3 byte/ตัว)
function fold(line: string): string {
  const out: string[] = [];
  let cur = "", bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > 73) { out.push(cur); cur = " "; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n");
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id).replace(/\.ics$/, "");
  const sig = new URL(req.url).searchParams.get("s") ?? "";
  if (!(fixtureEnabled() && sig === "fx") && !verifyCal(id, sig)) return NextResponse.json({ ok: false }, { status: 404 });
  const a = await getAnnouncement(id);
  if (!a || a.status !== "live") return NextResponse.json({ ok: false }, { status: 404 });
  const at = a.event_at || a.deadline_at;
  if (!at) return NextResponse.json({ ok: false }, { status: 404 });
  const start = new Date(at);
  const isDeadline = !a.event_at;
  const end = new Date(start.getTime() + (isDeadline ? 15 : 60) * 60_000);
  const title = `${isDeadline ? "⏰ ปิด: " : ""}${a.title}`;
  const desc = [a.summary, ...(JSON.parse(a.links || "[]") as { label: string; url: string }[]).map((l) => `${l.label}: ${l.url}`), `ดูในแอป BM33: ${APP}?a=${encodeURIComponent(a.id)}`].filter(Boolean).join("\n");
  const alarm = (trigger: string) => ["BEGIN:VALARM", `TRIGGER:${trigger}`, "ACTION:DISPLAY", `DESCRIPTION:${esc(title)}`, "END:VALARM"];
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BM33//LINE OA//TH", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${a.id}@bm33`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(desc)}`, ...(a.location ? [`LOCATION:${esc(a.location)}`] : []), `URL:${APP}?a=${encodeURIComponent(a.id)}`,
    ...alarm("-P1D"), ...alarm("-PT2H"),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return new NextResponse(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="bm33-${a.id}.ics"`,
      "cache-control": "no-store",
    },
  });
}
