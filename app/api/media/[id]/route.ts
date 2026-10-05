// เสิร์ฟรูปที่อัปโหลดจาก control center (LINE ดึงรูปจากลิงก์นี้) — cache ถาวร (id ไม่ซ้ำ ไม่มีการแก้ไฟล์)
import { readMedia } from "@/lib/bc/media";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = String(params.id ?? "").replace(/\.(jpe?g|png)$/i, "");
  const m = await readMedia(id).catch(() => null);
  if (!m) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(m.buf), {
    headers: {
      "content-type": m.mime,
      "content-length": String(m.buf.length),
      "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}
