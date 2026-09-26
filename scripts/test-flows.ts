// ทดสอบเส้นทางเขียนข้อมูลหลัก ๆ กับชีตจริง แบบไม่กระทบผู้ใช้ (ข้อมูล TEST เป็นร่าง/รหัสปลอม แล้วลบทิ้ง)
//   npx tsx scripts/test-flows.ts
import "./_env";

async function main() {
  const ok = (name: string, cond: unknown) => { console.log(cond ? "✅" : "❌", name); if (!cond) process.exitCode = 1; };
  const { createAnnouncement, updateAnnouncement, readAnnouncements, liveAnnouncements } = await import("../lib/bc/announcements");
  const { saveScheduleRows, readSchedule } = await import("../lib/bc/schedule");
  const { applyPayments, readPayments, feeStatusFor } = await import("../lib/bc/fees");
  const { createDraw, cancelDraw, drawsForStudent, readDraws } = await import("../lib/bc/draws");
  const { syncFortune, getFortune } = await import("../lib/bc/fortune");
  const { ranking } = await import("../lib/bc/academic");
  const { resolveAudience, audienceLabel } = await import("../lib/bc/outbox");
  const { publicBoard, personalState } = await import("../lib/app/state");
  const { signSession, verifySession, signClaim, verifyClaim } = await import("../lib/app/session");
  const { candidateFor } = await import("../lib/app/identity");

  // 1) ประกาศ: สร้างเป็นร่าง -> แก้ -> ลบ (ไม่เคย live)
  const id = await createAnnouncement({ title: "TEST ประกาศ", summary: "ทดสอบ", body: "ทดสอบระบบ", status: "draft", source: "manual" });
  await updateAnnouncement(id, { title: "TEST ประกาศ (แก้)" });
  let a = (await readAnnouncements(true)).find((x) => x.id === id);
  ok("announcement create+update", a?.title === "TEST ประกาศ (แก้)" && a.status === "draft");
  ok("draft not live", !(await liveAnnouncements()).some((x) => x.id === id));
  await updateAnnouncement(id, { status: "deleted" });
  a = (await readAnnouncements(true)).find((x) => x.id === id);
  ok("announcement soft-delete", !a);

  // 2) ตาราง: เพิ่มแถวร่าง -> แก้ -> ลบ
  await saveScheduleRows([{ date: "2099-01-01", start: "08:00", end: "09:00", subject: "TEST", status: "draft" }]);
  let row = (await readSchedule(true)).find((s) => s.subject === "TEST" && s.date === "2099-01-01");
  ok("schedule create", !!row);
  await saveScheduleRows([{ id: row!.id, topic: "edited" }]);
  row = (await readSchedule(true)).find((s) => s.id === row!.id);
  ok("schedule edit keeps other fields", row?.topic === "edited" && row?.subject === "TEST" && row?.start === "08:00");
  await saveScheduleRows([{ id: row!.id, status: "deleted" }]);
  ok("schedule delete", !(await readSchedule(true)).some((s) => s.id === row!.id));

  // 3) เงิน: รหัสปลอม + เดือนปี 2099 (ไม่มีเดือนนี้ในระบบ -> ไม่แสดงที่ไหน)
  await applyPayments([{ student_id: "0000000999", month: "2099-01", kind: "monthly" }], "test");
  let p = (await readPayments(true)).find((x) => x.student_id === "0000000999" && x.month === "2099-01");
  ok("payment mark paid", p?.kind === "monthly");
  await applyPayments([{ student_id: "0000000999", month: "2099-01", kind: "" }], "test");
  p = (await readPayments(true)).find((x) => x.student_id === "0000000999" && x.month === "2099-01");
  ok("payment unmark", p?.kind === "");
  const fs = await feeStatusFor("6801101071");
  ok("fee status (no months yet)", Array.isArray(fs.months));

  // 4) สุ่ม: pool รหัสปลอม เริ่มปี 2099 แล้วยกเลิกทันที
  const d = await createDraw({ activity: "TEST draw", need: 1, pool: ["0000000998", "0000000999"], showAt: "2099-01-01T00:00:00Z", revealAt: "2099-01-01T00:02:00Z" });
  ok("draw selected within pool", d.selected.length === 1 && d.pool.includes(d.selected[0]));
  ok("draw hidden from others", (await drawsForStudent("6801101071")).every((x) => x.id !== d.id));
  await cancelDraw(d.id);
  ok("draw canceled", (await readDraws(true)).find((x) => x.id === d.id)?.status === "canceled");

  // 5) เซียมซี: รหัสปลอม — รวมสมุดแบบ OR
  await syncFortune("0000000999", { pulls: 3, collected: "AQ", streak: 1, last_day: "2099-01-01", best: "b", pity: 2 });
  const f = await syncFortune("0000000999", { pulls: 2, collected: "Ag", streak: 1, last_day: "2099-01-01", best: "a", pity: 1 });
  ok("fortune merge (OR bits, max pulls, best kept)", f.pulls === 3 && f.collected.startsWith("Aw") && f.best === "b");
  ok("fortune read", (await getFortune("0000000999")).pulls === 3);

  // 6) อื่น ๆ
  const r = await ranking();
  ok("ranking covers roster", r.rows.length === 100);
  ok("audience all", (await resolveAudience("all")).length >= 1 && audienceLabel("undone:F-1").includes("ยังไม่ทำ"));
  const board = await publicBoard();
  ok("board committee", board.committee.length >= 5);
  const me = await personalState("6801101071");
  ok("personal slice", me.me.nickname === "บิงโก" && me.me.number === 71);
  const tok = signSession({ sid: "6801101071", uid: "Utest" });
  ok("session sign/verify", verifySession(tok)?.sid === "6801101071" && !verifySession(tok + "x"));
  ok("claim token bound to sub", verifyClaim(signClaim("Ua", "1"), "Ua") === "1" && verifyClaim(signClaim("Ua", "1"), "Ub") === null);
  ok("register match by last3", (await candidateFor("บิงโก", "071")).candidate?.sid === "6801101071");
  ok("register bad last3", !!(await candidateFor("x", "999")).error);
}
main().catch((e) => { console.error(e); process.exit(1); });
