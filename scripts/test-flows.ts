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

  // 7) v7: จัดชุดประกาศ (ร่าง) · เรียกเก็บเรื่องอื่น + ลิงก์ชำระ · รูปอัปโหลด · สวิตช์ Red Zone · ประวัติ
  const { bulkUpdateAnnouncements } = await import("../lib/bc/announcements");
  const a1 = await createAnnouncement({ title: "TEST ชุด 1", summary: "", body: "x", status: "draft", source: "manual" });
  const a2 = await createAnnouncement({ title: "TEST ชุด 2", summary: "", body: "x", status: "draft", source: "manual" });
  await bulkUpdateAnnouncements([{ id: a2, patch: { group_name: "TEST set", sort_order: "1" } }, { id: a1, patch: { group_name: "TEST set", sort_order: "2" } }]);
  const g = (await readAnnouncements(true)).filter((x) => x.group_name === "TEST set");
  ok("announcement bulk group + order", g.length === 2 && g.find((x) => x.id === a2)?.sort_order === "1");
  await bulkUpdateAnnouncements([a1, a2].map((x) => ({ id: x, patch: { status: "deleted" } })));
  ok("announcement bulk delete", !(await readAnnouncements(true)).some((x) => x.id === a1 || x.id === a2));

  const { upsertMonth, deleteMonth, readFeeMonths } = await import("../lib/bc/fees");
  const key = await upsertMonth({ month: "2099-02", other: true, label: "TEST ค่าเสื้อ", amount: "450", due_date: "2099-02-10", link: "https://forms.gle/test", link_label: "ชำระค่าเสื้อ" });
  const fm = (await readFeeMonths(true)).find((m) => m.month === key);
  ok("other charge key + link", /^2099-02-[a-z0-9]{4}$/.test(key) && fm?.link === "https://forms.gle/test" && fm?.label === "TEST ค่าเสื้อ");
  const st = await feeStatusFor("6801101071");
  ok("charge visible with pay button", st.months.some((m) => m.month === key && m.link_label === "ชำระค่าเสื้อ"));
  await deleteMonth(key);
  ok("charge deleted", !(await readFeeMonths(true)).some((m) => m.month === key));

  const { saveMedia, readMedia } = await import("../lib/bc/media");
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const file = await saveMedia(png, "image/png");
  const back = await readMedia(file.replace(/\.png$/, ""));
  ok("media save/read roundtrip", back?.mime === "image/png" && back.buf.toString("base64") === png);

  const { setConfig, getConfigValue } = await import("../lib/bc/config");
  const prev = await getConfigValue("red_zone_enabled");
  await setConfig("red_zone_enabled", "0", "test");
  const { bust } = await import("../lib/cache"); bust("bc");
  const off = await ranking();
  ok("red zone off -> everyone safe", !off.enabled && off.rows.every((x) => x.level === "safe"));
  const meOff = await personalState("6801101071");
  ok("app shows Green Zone + history", meOff.zone.enabled === false && meOff.zone.title === "Green Zone" && Array.isArray(meOff.history));
  await setConfig("red_zone_enabled", prev, "test restore");
  ok("board has past list", Array.isArray((await publicBoard()).past));

  // 8) ประกาศ "ทุกคนต้องกรอก" -> รายการใน สิ่งที่ต้องกรอก (เชื่อใจ) · ปิด = เอาออก
  const { setAnnouncementTodo, readForms } = await import("../lib/bc/forms");
  const { statusForForm } = await import("../lib/bc/status");
  const t1 = await createAnnouncement({ title: "TEST ต้องกรอก", summary: "x", body: "x", status: "draft", source: "manual" }, { autoForm: false });
  const fid = await setAnnouncementTodo({ id: t1, title: "TEST ต้องกรอก", summary: "x", deadline_at: "", links: [], form_id: "" }, true);
  const tf = (await readForms(true)).find((f) => f.form_id === fid);
  ok("must-fill creates trusted form", !!tf && tf.trust_claims === "1" && tf.announcement_id === t1);
  ok("must-fill tracking lists members", (await statusForForm(tf!)).length >= 1);
  await setAnnouncementTodo({ id: t1, title: "TEST ต้องกรอก", summary: "x", deadline_at: "", links: [], form_id: fid }, false);
  ok("must-fill off removes form", !(await readForms(true)).some((f) => f.form_id === fid));
  await updateAnnouncement(t1, { status: "deleted" });
}
main().catch((e) => { console.error(e); process.exit(1); });
