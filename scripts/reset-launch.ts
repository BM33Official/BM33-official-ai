// ล้างข้อมูลทดลองก่อนเปิดใช้จริง (2026-10-06): เงินรุ่น/การจ่าย/ข้อสอบ/ค้างยกมา -> ว่าง · ปิด Red Zone · เก็บข้อมูลทุกกลุ่ม
//   npx tsx scripts/reset-launch.ts <backup.json> [--apply]
// ไม่ใส่ --apply = ดูอย่างเดียว · สำรองทุกอย่างลงไฟล์ก่อนลบเสมอ
import "./_env";
import { writeFileSync } from "node:fs";

async function main() {
  const out = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!out) throw new Error("ต้องระบุไฟล์สำรอง");
  const { fresh } = await import("../lib/bc/sheets");
  const { TABS } = await import("../lib/bc/types");
  const { deleteRows } = await import("../lib/google-sheets");
  const { setConfigMany, getConfig } = await import("../lib/bc/config");
  const { bust } = await import("../lib/cache");
  const data = await fresh("feeMonths", "payments", "exams");
  const { readSlips } = await import("../lib/bc/slips");
  const slips = (await readSlips()).filter((s) => s.status === "pending");
  const cfg = await getConfig();
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), ...data, pendingSlips: slips.map(({ image: _i, ...r }) => r), config: { fee_carry_json: cfg.fee_carry_json ?? "", red_zone_enabled: cfg.red_zone_enabled ?? "", learn_groups: cfg.learn_groups ?? "" } }, null, 1));
  console.log(`สำรองแล้ว -> ${out}`);
  for (const k of ["feeMonths", "payments", "exams"] as const) console.log(`${TABS[k]}: ${data[k].length} แถว`);
  console.log(`สลิปรอตรวจ: ${slips.length}`);
  if (!apply) { console.log("(ดูอย่างเดียว — ใส่ --apply เพื่อลบ)"); return; }
  for (const k of ["feeMonths", "payments", "exams"] as const) {
    const rows = data[k].map((r) => r.__row).filter(Boolean) as number[];
    if (!rows.length) continue;
    await deleteRows(TABS[k], Math.min(...rows), Math.max(...rows));
    console.log(`ลบ ${TABS[k]} แถว ${Math.min(...rows)}-${Math.max(...rows)}`);
  }
  // สลิปทดลองที่รออยู่ (เดือนถูกลบแล้ว) -> ปิดเป็น rejected พร้อมหมายเหตุ (ไม่ลบแถว)
  if (slips.length) {
    const { readKeyFresh, patchRecord } = await import("../lib/bc/sheets");
    const all = await readKeyFresh<Record<string, string> & { __row: number }>("slips");
    for (const s of all.filter((x) => x.status === "pending")) await patchRecord("slips", s.__row, s, { status: "rejected", decided_by: "reset-launch", decided_at: new Date().toISOString(), ai_note: `${s.ai_note} · ล้างข้อมูลทดลองก่อนเปิดใช้` });
    console.log(`ปิดสลิปทดลอง ${slips.length} ใบ`);
  }
  await setConfigMany({ fee_carry_json: "{}", red_zone_enabled: "0", learn_groups: "*" }, "reset-launch 2026-10-06");
  bust("bc");
  console.log("ตั้งค่า: red_zone_enabled=0 · learn_groups=* · fee_carry_json={}");
}
main().catch((e) => { console.error(e); process.exit(1); });
