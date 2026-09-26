// สร้าง rich menu v2 (6 ปุ่ม) + อัปโหลดรูป
//   npx tsx scripts/rich-menu.ts create            -> สร้างเมนู + อัปรูป (ยังไม่มีใครเห็น) พิมพ์ richMenuId
//   npx tsx scripts/rich-menu.ts link <id> <userId> -> ใช้เมนูนี้เฉพาะบัญชีเดียว (ทดสอบ)
//   npx tsx scripts/rich-menu.ts default <id>      -> ตั้งเป็นค่าเริ่มต้นของทุกคน (เปิดใช้จริง)
//   npx tsx scripts/rich-menu.ts list
import "./_env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const { messagingApi } = await import("@line/bot-sdk");
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
  const api = new messagingApi.MessagingApiClient({ channelAccessToken: token });
  const blob = new messagingApi.MessagingApiBlobClient({ channelAccessToken: token });
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "create") {
    const def = JSON.parse(readFileSync(resolve("rich-menu/rich-menu.v2.json"), "utf8"));
    const { richMenuId } = await api.createRichMenu(def);
    const img = readFileSync(resolve("rich-menu/rich-menu.jpg"));
    await blob.setRichMenuImage(richMenuId, new Blob([img], { type: "image/jpeg" }));
    console.log("created", richMenuId);
  } else if (cmd === "link") {
    await api.linkRichMenuIdToUser(b, a);
    console.log("linked", a, "->", b);
  } else if (cmd === "default") {
    await api.setDefaultRichMenu(a);
    console.log("default set", a);
  } else {
    const l = await api.getRichMenuList();
    for (const m of l.richmenus) console.log(m.richMenuId, m.name, m.chatBarText);
    try { console.log("default:", (await api.getDefaultRichMenuId()).richMenuId); } catch { console.log("default: (none)"); }
  }
}
main().catch((e) => { console.error(e?.body ?? e); process.exit(1); });
