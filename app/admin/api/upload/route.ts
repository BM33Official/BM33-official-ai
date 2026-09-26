// อัปโหลดตารางเรียน -> AI ถอดเป็นรายการ (draft) ให้แอดมินตรวจก่อนเผยแพร่
//   multipart {file, block}                 : ไฟล์ ≤ ~4MB (PDF/รูป/CSV/TXT) ส่งตรงเข้า Gemini
//   JSON {op:"start", name, mime, size}     : ไฟล์ใหญ่ -> เปิด resumable upload ของ Gemini Files API
//   multipart {op:"chunk", token, offset, final, chunk}
//   JSON {op:"parse", fileUri, mime, name, block}
//   JSON {op:"sheet", link, block}          : ลิงก์ Google Sheet (ต้องแชร์ให้ service account)
//   JSON {op:"text", text, block}           : วางข้อความตาราง
import { NextResponse } from "next/server";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { currentRole } from "@/lib/bc/auth";
import { parseTimetable, saveParsedUpload } from "@/lib/bc/schedule";
import { getForeignTitles, readForeignGrid, parseSheetId } from "@/lib/google-sheets";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KEY = () => createHash("sha256").update("bm33-upload|" + (process.env.GEMINI_API_KEY ?? "") + (process.env.LINE_CHANNEL_SECRET ?? "")).digest();
function seal(s: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", KEY(), iv);
  const enc = Buffer.concat([c.update(s, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}
function open(t: string): string {
  const b = Buffer.from(t, "base64url");
  const d = createDecipheriv("aes-256-gcm", KEY(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}

const bad = (e: string, s = 400) => NextResponse.json({ ok: false, error: e }, { status: s });
const API = "https://generativelanguage.googleapis.com";

async function waitActive(name: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${API}/v1beta/${name}?key=${process.env.GEMINI_API_KEY}`, { cache: "no-store" });
    const j = (await r.json()) as { state?: string };
    if (j.state === "ACTIVE") return;
    if (j.state === "FAILED") throw new Error("Gemini ประมวลผลไฟล์ไม่สำเร็จ");
    await new Promise((res) => setTimeout(res, 1500));
  }
}

async function finish(parts: Parameters<typeof parseTimetable>[0], meta: { name: string; mime: string; block: string; text?: string }) {
  const parsed = await parseTimetable(parts, { block: meta.block, text: meta.text });
  const id = await saveParsedUpload({ filename: meta.name, mime: meta.mime, block: meta.block, parsed });
  return NextResponse.json({ ok: true, uploadId: id, sessions: parsed.sessions.length, exams: parsed.exams.length, warnings: parsed.warnings, block: parsed.block_name });
}

export async function POST(req: Request) {
  const role = await currentRole();
  if (role !== "admin" && role !== "academic") return bad("unauthorized", 401);
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      if (fd.get("op") === "chunk") {
        const url = open(String(fd.get("token")));
        const chunk = fd.get("chunk") as Blob;
        const final = fd.get("final") === "1";
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "X-Goog-Upload-Command": final ? "upload, finalize" : "upload",
            "X-Goog-Upload-Offset": String(fd.get("offset") ?? "0"),
            "Content-Length": String(chunk.size),
          },
          body: Buffer.from(await chunk.arrayBuffer()),
        });
        if (!r.ok) return bad(`อัปโหลดส่วนไฟล์ไม่สำเร็จ (${r.status})`, 502);
        if (final) {
          const j = (await r.json()) as { file?: { uri: string; name: string; mimeType: string } };
          if (!j.file) return bad("ไม่ได้รับไฟล์จาก Gemini", 502);
          await waitActive(j.file.name);
          return NextResponse.json({ ok: true, fileUri: j.file.uri, mime: j.file.mimeType });
        }
        return NextResponse.json({ ok: true });
      }
      const file = fd.get("file") as File | null;
      if (!file) return bad("ไม่มีไฟล์");
      const block = String(fd.get("block") ?? "");
      const mime = file.type || "application/pdf";
      const buf = Buffer.from(await file.arrayBuffer());
      if (/text|csv/.test(mime)) {
        return finish([], { name: file.name, mime, block, text: buf.toString("utf8") });
      }
      return finish([{ inlineData: { mimeType: mime, data: buf.toString("base64") } }], { name: file.name, mime, block });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, string>;
    switch (body.op) {
      case "start": {
        const r = await fetch(`${API}/upload/v1beta/files?key=${process.env.GEMINI_API_KEY}`, {
          method: "POST",
          headers: {
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": String(body.size),
            "X-Goog-Upload-Header-Content-Type": body.mime || "application/pdf",
            "content-type": "application/json",
          },
          body: JSON.stringify({ file: { display_name: String(body.name ?? "timetable").slice(0, 100) } }),
        });
        const url = r.headers.get("x-goog-upload-url");
        if (!r.ok || !url) return bad(`เริ่มอัปโหลดไม่สำเร็จ (${r.status})`, 502);
        return NextResponse.json({ ok: true, token: seal(url) });
      }
      case "parse":
        return finish([{ fileData: { fileUri: body.fileUri, mimeType: body.mime } }], { name: body.name, mime: body.mime, block: body.block });
      case "sheet": {
        const id = parseSheetId(body.link ?? "");
        if (!id) return bad("ลิงก์ Google Sheet ไม่ถูกต้อง");
        const tabs = await getForeignTitles(id).catch(() => null);
        if (!tabs) return bad("อ่านชีตไม่ได้ — แชร์ชีตให้ service account (ดูอีเมลในหน้าตั้งค่า) ก่อน");
        const text = (await Promise.all(tabs.slice(0, 6).map(async (t) => {
          const g = await readForeignGrid(id, `'${t}'!A1:Z400`);
          return `## แท็บ ${t}\n${g.map((r) => r.join(" | ")).join("\n")}`;
        }))).join("\n\n");
        return finish([], { name: `Google Sheet ${id.slice(0, 8)}`, mime: "text/csv", block: body.block, text });
      }
      case "text":
        return finish([], { name: "ข้อความที่วาง", mime: "text/plain", block: body.block, text: body.text });
    }
    return bad("unknown op");
  } catch (err) {
    log.error("upload_failed", { message: String(err).slice(0, 300) });
    return bad(String((err as Error)?.message ?? err).slice(0, 300), 500);
  }
}
