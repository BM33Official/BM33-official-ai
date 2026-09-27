// rich menu v4 (5 ปุ่มบนพื้นน้ำฟ้า: หน้าหลักใหญ่ · ประกาศ · ของฉัน · เซียมซี · ถามบอท + แถบ LinkTree วิชาการ) — สร้าง/อัปรูปจากฝั่ง server (token LINE อยู่บน Vercel เท่านั้น)
import { messagingApi } from "@line/bot-sdk";
import { lineClient, lineBlobClient } from "@/lib/line";
import { getConfigValue, setConfig } from "@/lib/bc/config";
import def from "@/rich-menu/rich-menu.v4.json";

export async function richMenuStatus() {
  const ours = await getConfigValue("rich_menu_v4_id");
  let current = "";
  try { current = (await lineClient.getDefaultRichMenuId()).richMenuId; } catch { /* ไม่มี default */ }
  let exists = false;
  if (ours) { try { await lineClient.getRichMenu(ours); exists = true; } catch { exists = false; } }
  return { ours: exists ? ours : "", current, isDefault: !!ours && ours === current };
}

export async function createRichMenuV2(origin: string): Promise<string> {
  const st = await richMenuStatus();
  if (st.ours) return st.ours;
  const { richMenuId } = await lineClient.createRichMenu(def as unknown as messagingApi.RichMenuRequest);
  const img = await fetch(`${origin.replace(/\/$/, "")}/rich-menu-v4.jpg`, { cache: "no-store" });
  if (!img.ok) throw new Error("โหลดรูปเมนูไม่ได้");
  await lineBlobClient.setRichMenuImage(richMenuId, new Blob([await img.arrayBuffer()], { type: "image/jpeg" }));
  await setConfig("rich_menu_v4_id", richMenuId, "created by control center");
  return richMenuId;
}

export async function linkRichMenu(userId: string, id: string) {
  await lineClient.linkRichMenuIdToUser(userId, id);
}
export async function unlinkRichMenu(userId: string) {
  await lineClient.unlinkRichMenuIdFromUser(userId);
}
export async function setDefaultRichMenu(id: string) {
  await lineClient.setDefaultRichMenu(id);
}
