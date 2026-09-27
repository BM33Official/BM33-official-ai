// ตรวจจำข้อสอบ: ใบแบ่งข้อ + เอกสารที่พิมพ์ข้อสอบ -> ผลรายคน (ยังไม่บันทึก ให้ฝ่ายวิชาการตรวจทานก่อน)
import { NextResponse } from "next/server";
import { currentRole } from "@/lib/bc/auth";
import { loadLink, loadFile, Loaded } from "@/lib/docs";
import { parseAssignment, assignByModulo, checkDocByRule, checkDocByAI, combine, AssignMap } from "@/lib/bc/recall";
import type { Part } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bad = (e: string, s = 400) => NextResponse.json({ ok: false, error: e }, { status: s });

async function gather(fd: FormData, linkKey: string, fileKey: string): Promise<Loaded[]> {
  const out: Loaded[] = [];
  for (const l of String(fd.get(linkKey) ?? "").split(/\s+/).filter((x) => /^https?:\/\//.test(x))) out.push(await loadLink(l));
  for (const f of fd.getAll(fileKey)) {
    if (!(f instanceof Blob) || !f.size) continue;
    out.push(await loadFile((f as File).name ?? "file", f.type, Buffer.from(await f.arrayBuffer())));
  }
  return out;
}
const toInput = (xs: Loaded[]) => ({
  text: xs.filter((x) => x.text).map((x) => x.text).join("\n\n") || undefined,
  parts: xs.filter((x) => x.part).map((x) => x.part!) as Part[],
});

export async function POST(req: Request) {
  const role = await currentRole();
  if (role !== "admin" && role !== "academic") return bad("unauthorized", 401);
  try {
    const fd = await req.formData();
    const mode = String(fd.get("assignMode") ?? "file");
    let count = Number(fd.get("count") ?? 0) || 0;

    // 1) ใครรับข้อไหน
    let map: AssignMap = {};
    let unresolved: string[] = [];
    let note = "";
    if (mode === "mod") {
      if (count < 1) return bad("ใส่จำนวนข้อทั้งหมดก่อน");
      map = await assignByModulo(count);
    } else if (mode === "keep") {
      try { map = JSON.parse(String(fd.get("assignJson") ?? "{}")); } catch { return bad("ข้อมูลแบ่งข้อเดิมเสีย"); }
    } else {
      const a = await gather(fd, "assignLink", "assignFile");
      const errs = a.filter((x) => x.error);
      if (!a.length) return bad("ใส่ลิงก์หรือไฟล์ใบแบ่งข้อก่อน");
      if (errs.length === a.length) return bad(errs[0].error!);
      const r = await parseAssignment(toInput(a.filter((x) => !x.error)), role);
      map = r.map; unresolved = r.unresolved; note = r.note;
      count = Math.max(count, r.count);
    }
    const maxAssigned = Math.max(0, ...Object.values(map).flat());
    count = Math.max(count, maxAssigned);

    // 2) ข้อไหนมีคนพิมพ์แล้ว
    const d = await gather(fd, "docLinks", "docFiles");
    if (!d.length) return bad("ใส่ลิงก์หรือไฟล์เอกสารที่พิมพ์ข้อสอบก่อน");
    const okDocs = d.filter((x) => !x.error);
    if (!okDocs.length) return bad(d[0].error!);
    const input = toInput(okDocs);
    // AI อ่านเอกสารจริง (เลขข้อในเอกสารจริงมักเริ่มใหม่ทุกบท กฎตายตัวพลาดง่าย) — ล่มค่อยใช้กฎ
    let check: Awaited<ReturnType<typeof checkDocByAI>> | (ReturnType<typeof checkDocByRule> & { notes?: string }) | null = null;
    try { check = await checkDocByAI(input, count, role); } catch { check = input.text ? checkDocByRule(input.text, count) : null; }
    if (!check) return bad("อ่านเอกสารไม่สำเร็จ ลองใหม่อีกครั้ง");

    // 3) รวมผลรายคน
    const students = await combine(map, check.filled);
    return NextResponse.json({
      ok: true, count: Math.max(count, ...check.filled, 0), map, unresolved, note: [note, check.notes].filter(Boolean).join(" · "), method: check.method,
      filled: check.filled, empty: check.empty, snippets: check.snippets, students,
      warnings: d.filter((x) => x.error).map((x) => `${x.name}: ${x.error}`),
    });
  } catch (err) {
    return bad(String((err as Error)?.message ?? err).slice(0, 300), 500);
  }
}
