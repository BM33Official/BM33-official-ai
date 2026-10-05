// กลุ่ม LINE ที่บอทอยู่ — จำจาก webhook (join / ข้อความ / leave) ไว้ใน BC_config.known_groups_json
// ใช้ในหน้า ตั้งค่า: เห็นชื่อกลุ่ม + จำนวนสมาชิก + เก็บข้อมูลอยู่ไหม + ปุ่มให้บอทออกจากกลุ่ม
import { getConfig, setConfig } from "@/lib/bc/config";
import { lineClient } from "@/lib/line";

export interface KnownGroup { id: string; first: string; last: string; left?: string }

function parse(raw: string | undefined): KnownGroup[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((g) => g && typeof g.id === "string") : [];
  } catch { return []; }
}

export async function knownGroups(): Promise<KnownGroup[]> {
  return parse((await getConfig()).known_groups_json);
}

// เขียนเฉพาะตอนมีอะไรใหม่ (กลุ่มใหม่ / join / leave / ไม่เห็นมา 6 ชม.) — ข้อความปกติไม่เขียนชีต
const _seen = new Map<string, number>();
export async function noteGroup(id: string, kind: "join" | "leave" | "message"): Promise<void> {
  if (kind === "message" && Date.now() - (_seen.get(id) ?? 0) < 6 * 3600_000) return;
  _seen.set(id, Date.now());
  const list = await knownGroups();
  const now = new Date().toISOString();
  const hit = list.find((g) => g.id === id);
  if (kind === "message" && hit && !hit.left && Date.now() - new Date(hit.last).getTime() < 6 * 3600_000) return;
  if (hit) {
    hit.last = now;
    if (kind === "leave") hit.left = now;
    else delete hit.left;
  } else {
    list.push({ id, first: now, last: now, ...(kind === "leave" ? { left: now } : {}) });
  }
  await setConfig("known_groups_json", JSON.stringify(list.slice(-20)), "webhook");
}

// learn_groups: "*" = ทุกกลุ่ม · ว่าง = env LEARN_GROUP_IDS · หรือ id คั่นด้วย ,
export function learnsFrom(groupId: string, cfgValue: string): boolean {
  const raw = (cfgValue || "").trim() || (process.env.LEARN_GROUP_IDS ?? "");
  if (raw.trim() === "*") return true;
  const gs = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return gs.length === 0 || gs.includes(groupId);
}

export interface GroupInfo { id: string; name: string; picture: string; members: number | null; inGroup: boolean; learning: boolean; first: string; last: string }

export async function groupInfos(extraIds: string[] = []): Promise<{ groups: GroupInfo[]; mode: string }> {
  const cfg = await getConfig();
  const known = parse(cfg.known_groups_json);
  for (const id of extraIds) if (id && !known.some((g) => g.id === id)) known.push({ id, first: "", last: "" });
  const groups = await Promise.all(known.map(async (g): Promise<GroupInfo> => {
    let name = "", picture = "", members: number | null = null, inGroup = !g.left;
    try {
      const s = await lineClient.getGroupSummary(g.id);
      name = s.groupName ?? ""; picture = s.pictureUrl ?? "";
      members = (await lineClient.getGroupMemberCount(g.id)).count ?? null;
    } catch { inGroup = false; } // บอทไม่ได้อยู่ในกลุ่มแล้ว (หรือ LINE token ไม่มีในเครื่อง dev)
    return { id: g.id, name, picture, members, inGroup, learning: learnsFrom(g.id, cfg.learn_groups ?? ""), first: g.first, last: g.last };
  }));
  const mode = (cfg.learn_groups ?? "").trim() === "*" ? "all" : (cfg.learn_groups ?? "").trim() ? "list" : process.env.LEARN_GROUP_IDS ? "env" : "all";
  return { groups: groups.sort((a, b) => Number(b.inGroup) - Number(a.inGroup) || (b.last || "").localeCompare(a.last || "")), mode };
}

export async function leaveGroup(id: string): Promise<void> {
  await lineClient.leaveGroup(id);
  const list = await knownGroups();
  const hit = list.find((g) => g.id === id);
  if (hit) { hit.left = new Date().toISOString(); await setConfig("known_groups_json", JSON.stringify(list), "left by admin"); }
}
