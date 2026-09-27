// อ่านไฟล์ export แชต LINE (.txt) -> ข้อความที่มีสาระ (ตัดสติกเกอร์/รูป/คนเข้า-ออก/ข้อความซ้ำ)
// รูปแบบไฟล์: บรรทัดวันที่ "2025.03.29 Saturday" แล้วตามด้วย "HH:MM <ชื่อ> <ข้อความ>" (คั่นด้วยช่องว่างธรรมดา)
// ชื่อผู้ส่งมีช่องว่างได้ -> เดาชื่อจากบรรทัดระบบ (X Photos / X joined the group. ...) แล้วจับคู่แบบยาวที่สุด
export interface ChatMsg {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  sender: string;
  text: string;
  source: string; // main | openchat | ...
}

const DATE_RE = /^(\d{4})\.(\d{2})\.(\d{2}) [A-Za-z]+day$/;
const LINE_RE = /^(\d{2}:\d{2}) (.+)$/;
const SYS_SUFFIX = /^(.+?) (Photos|Stickers|Videos|Contact|Photo|Video|File|Album .*|unsent a message\.|made an <u>announcement<\/u>\.|Added a new note\.|Shared a note\.|changed the group's profile picture\.|changed the chat's profile photo\.|joined the chat\.|left the group\.|left the chat\.|\d+ items added to album\.|deleted one or more items .*|invited .+ to the group\..*|Group voice call started\.|Group call ended\.)$/;

function learnNames(lines: string[]): string[] {
  const names = new Set<string>();
  for (const l of lines) {
    const m = l.match(LINE_RE);
    if (!m) continue;
    const rest = m[2];
    const j = rest.match(/^(.+) \1 joined the group\.$/);
    if (j) { names.add(j[1]); continue; }
    const s = rest.match(SYS_SUFFIX);
    if (s && s[1].length <= 40) names.add(s[1]);
    const f = rest.match(/^(.+?) (\.pdf|\S+\.(pdf|xlsx|docx|pptx))$/i);
    if (f && f[1].split(" ").length <= 4) { /* ชื่อไฟล์ — ไม่ชัวร์ ข้าม */ }
  }
  return [...names].sort((a, b) => b.length - a.length);
}

function isNoise(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^(Photos|Stickers|Videos|Contact|Photo|Video)$/.test(t)) return true;
  if (/^(unsent a message\.|made an <u>announcement<\/u>\.|Added a new note\.|Shared a note\.)$/.test(t)) return true;
  if (/joined the (group|chat)\.$|left the (group|chat)\.$|items added to album\.$|Group (voice )?call|changed the (group|chat)'s/.test(t)) return true;
  if (/^\[(Poll|Poll ended)\]/.test(t)) return false;
  // หัวเราะล้วน / อีโมจิ / สั้นมาก
  if (/^[5๕2๒36๖\s!?.~😂🤣]+$/.test(t)) return true;
  const stripped = t.replace(/\([A-Za-z ]+\)|\(emoji\)/g, "").replace(/@\S+/g, "").replace(/[\p{Emoji}\s()]/gu, "");
  if (stripped.length < 2) return true;
  return false;
}

export function parseLineExport(raw: string, source: string): ChatMsg[] {
  const lines = raw.replace(/\r/g, "").split("\n");
  const names = learnNames(lines);
  const out: ChatMsg[] = [];
  let date = "";
  let cur: ChatMsg | null = null;
  const push = () => { if (cur && !isNoise(cur.text)) out.push({ ...cur, text: cur.text.trim() }); cur = null; };
  for (const line of lines) {
    const d = line.match(DATE_RE);
    if (d) { push(); date = `${d[1]}-${d[2]}-${d[3]}`; continue; }
    const m = line.match(LINE_RE);
    if (m && date) {
      push();
      const rest = m[2];
      if (/^Message unsent\.$/.test(rest)) continue;
      const name = names.find((n) => rest === n || rest.startsWith(n + " "));
      const sender = name ?? rest.split(" ")[0];
      const text = name ? rest.slice(name.length + 1) : rest.slice(sender.length + 1);
      cur = { date, time: m[1], sender, text, source };
      continue;
    }
    if (cur) cur.text += "\n" + line; // บรรทัดต่อของข้อความหลายบรรทัด
  }
  push();
  return collapseSnowballs(out);
}

// ข้อความแบบ "ลงชื่อต่อกัน" (คัดลอกแล้วเติมชื่อทีละคน) -> เก็บเฉพาะฉบับล่าสุด
function collapseSnowballs(msgs: ChatMsg[]): ChatMsg[] {
  const key = (t: string) => t.replace(/\s+/g, "").slice(0, 80);
  const lastIdx = new Map<string, number>();
  msgs.forEach((m, i) => { if (m.text.length >= 80) lastIdx.set(key(m.text), i); });
  return msgs.filter((m, i) => {
    if (m.text.length < 80) return true;
    const li = lastIdx.get(key(m.text))!;
    if (li === i) return true;
    // ต่างกันเกิน 5 วัน = คนละเรื่อง (ประกาศซ้ำรอบใหม่) -> เก็บไว้
    const a = new Date(m.date).getTime(), b = new Date(msgs[li].date).getTime();
    return b - a > 5 * 86_400_000;
  });
}
