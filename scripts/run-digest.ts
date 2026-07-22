// รัน digest ด้วยมือ (ทดสอบการเรียนรู้จากแชต) — ใช้:  npm run run:digest
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
  const { runDigest } = await import("../lib/digest");
  const r = await runDigest();
  console.log("digest result:", JSON.stringify(r, null, 2));
}
main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
