// ตรวจว่า service account อ่านชีตได้ + โชว์ชื่อแท็บจริง (รัน "หลังแชร์ชีต")
// ใช้:  npm run inspect:sheets
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
  const { getSheetTitles } = await import("../lib/google-sheets");
  const { SOURCES } = await import("../lib/sources");
  const titles = await getSheetTitles();
  console.log("✅ อ่านชีตได้ พบ", titles.length, "แท็บ:");
  titles.forEach((t) => console.log("   ·", JSON.stringify(t)));
  console.log("\nการ resolve source -> แท็บจริง:");
  for (const s of Object.values(SOURCES)) {
    const hit = titles.find(s.match);
    console.log(`   ${hit ? "✔" : "✘"} ${s.id.padEnd(20)} -> ${hit ?? "(ไม่พบ!)"}`);
  }
}
main().catch((e) => {
  console.error("❌ อ่านชีตไม่ได้:", e?.message || e);
  console.error("   ตรวจว่าแชร์ชีตให้ service account email แล้ว (Viewer/Editor)");
  process.exit(1);
});
