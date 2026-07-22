// ทดสอบว่า service account "เขียน" ชีตได้ (ต้องแชร์เป็น Editor)
// เขียนแถวทดสอบ 1 แถวลงแท็บ 07 (สถานะ processed = digest จะไม่แตะ) — ลบทิ้งได้
// ใช้:  npm run test:write
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
} catch {}

async function main() {
  const { resolveTitle, appendRows } = await import("../lib/google-sheets");
  const { SOURCES } = await import("../lib/sources");
  const title = await resolveTitle(SOURCES.rawMessages.match);
  if (!title) throw new Error("ไม่พบแท็บ 07_ข้อความทั้งหมด");
  await appendRows(`'${title}'!A1`, [[
    "TEST-WRITE", new Date().toISOString(), "", "", "",
    "system", "ทดสอบสิทธิ์เขียน — ลบแถวนี้ทิ้งได้", "processed", "", "test",
  ]]);
  console.log("✅ เขียนชีตได้! (แชร์เป็น Editor สำเร็จ)");
  console.log("   ไปดูแท็บ 07_ข้อความทั้งหมด จะเห็นแถว TEST-WRITE — ลบทิ้งได้เลย");
}
main().catch((e) => {
  const msg = String(e?.message || e);
  if (msg.includes("403") || /permission|PERMISSION/.test(msg)) {
    console.error("❌ เขียนไม่ได้ — ยังไม่ได้แชร์ชีตเป็น Editor ให้ service account");
    console.error("   แชร์ให้:", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  } else {
    console.error("❌ ผิดพลาด:", msg);
  }
  process.exit(1);
});
