// ทดสอบ pipeline การค้นข้อมูลในเครื่อง (ไม่ผ่าน LINE)
// ใช้:  npm run test:retrieval -- "คำถาม" "OPTIONAL_LINE_USER_ID"
//
// โหลด .env.local เอง (ต้องมี GEMINI_API_KEY + GOOGLE_* ครบ)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// โหลด .env.local แบบง่าย ๆ (ไม่พึ่ง dependency)
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
} catch {
  console.warn("(ไม่พบ .env.local — ใช้ env ปัจจุบัน)");
}

async function main() {
  const question = process.argv[2];
  const userId = process.argv[3];
  if (!question) {
    console.error('ใช้:  npm run test:retrieval -- "คำถาม" "OPTIONAL_LINE_USER_ID"');
    process.exit(1);
  }

  const { retrieve, buildContext } = await import("../lib/retrieval");
  const { askGemini } = await import("../lib/gemini");

  console.log("❓ question:", question);
  console.log("👤 userId:", userId ?? "(none)");
  console.log("─".repeat(60));

  const t0 = Date.now();
  const r = await retrieve(question, userId);
  console.log("intent:      ", r.intent);
  console.log("fastPath:    ", r.fastPath);
  console.log("usedSources: ", r.usedSources.join(", "));
  console.log("denied:      ", r.deniedSources.join(", ") || "-");
  console.log("selfLookup:  ", r.selfLookup ? `${r.selfLookup.source} matched=${r.selfLookup.matched}` : "-");
  console.log("cache:       ", JSON.stringify(r.cacheState));
  console.log("sheetsMs:    ", r.sheetsMs, "| retrieveMs:", Date.now() - t0);
  console.log("matchedRows: ", r.records.length);
  for (const rec of r.records.slice(0, 6)) {
    console.log(`  · [${rec.sourceId} row${rec.rowNumber} score=${rec.score.toFixed(1)} cov=${rec.coverage.toFixed(2)} ${rec.dateISO}] ${rec.cells.slice(0, 5).join(" | ").slice(0, 120)}`);
  }
  console.log("─".repeat(60));

  const ctx = buildContext(r.records);
  const ans = await askGemini(
    "คุณคือบอทรุ่น BM33 ตอบภาษาไทยสั้น กระชับ จาก <context> เท่านั้น ห้ามเดา ถ้าไม่มีข้อมูลให้ตอบ ROUTE:<หมวด>",
    `<context>\n${ctx}\n</context>\n\n<question>${question}</question>`
  );
  console.log("💬 answer:", ans.text);
  console.log("   finishReason:", ans.finishReason, "| candTok:", ans.candidatesTokenCount);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
