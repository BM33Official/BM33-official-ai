// อัปโหลดไฟล์ export แชต LINE (.txt) จากหน้า AI → รวมเข้า KB_แชตรุ่น (ไม่ซ้ำของเดิม)
// client ส่งแบบ gzip (ไฟล์แชตไทย 10–20MB ย่อเหลือไม่กี่ MB ให้ผ่านลิมิต 4.5MB ของ Vercel)
import { NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";
import { currentRole } from "@/lib/bc/auth";
import { importChatExport } from "@/lib/kb/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if ((await currentRole()) !== "admin") return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const url = new URL(req.url);
    const source = (url.searchParams.get("source") || "แชตรุ่น").slice(0, 40);
    const buf = Buffer.from(await req.arrayBuffer());
    const raw = (req.headers.get("content-encoding-client") === "gzip" ? gunzipSync(buf) : buf).toString("utf8");
    if (!/^\d{4}\.\d{2}\.\d{2} [A-Za-z]+day$/m.test(raw)) return NextResponse.json({ ok: false, error: "ไม่ใช่ไฟล์ export แชต LINE (ภาษาอังกฤษ)" }, { status: 400 });
    return NextResponse.json({ ok: true, ...(await importChatExport(raw, source)) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String((err as Error)?.message ?? err).slice(0, 300) }, { status: 500 });
  }
}
