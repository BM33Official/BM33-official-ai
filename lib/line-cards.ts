// Flex Message builders — การ์ดสวย ๆ สำหรับตอบใน LINE
// verify แล้วกับ @line/bot-sdk v11.2.0 (messagingApi.FlexMessage/FlexBubble/FlexBox/FlexText/FlexButton)

import { messagingApi } from "@line/bot-sdk";
import type { RouteInfo } from "./routing";

const ACCENT = "#06C755"; // เขียว LINE

// การ์ดยืนยัน (Yes/No) ผ่าน postback — ใช้ตอน onboarding และยืนยันต่าง ๆ
export function confirmBubble(
  title: string,
  body: string,
  yesData: string,
  noData: string,
  yesLabel = "ใช่",
  noLabel = "ไม่ใช่"
): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: ACCENT, paddingAll: "16px",
        contents: [{ type: "text", text: title, color: "#FFFFFF", weight: "bold", size: "md", wrap: true }],
      },
      body: {
        type: "box", layout: "vertical",
        contents: [{ type: "text", text: body, size: "md", color: "#111111", wrap: true }],
      },
      footer: {
        type: "box", layout: "horizontal", spacing: "sm",
        contents: [
          { type: "button", style: "secondary", height: "sm",
            action: { type: "postback", label: noLabel, data: noData, displayText: noLabel } },
          { type: "button", style: "primary", height: "sm", color: ACCENT,
            action: { type: "postback", label: yesLabel, data: yesData, displayText: yesLabel } },
        ],
      },
    },
  };
}

// การ์ด broadcast — header สีปรับได้ + body + ปุ่ม (uri/postback) ไม่บังคับ
export function broadcastFlex(opts: {
  title: string;
  body: string;
  headerColor?: string;
  buttonLabel?: string;
  buttonAction?: "uri" | "postback" | "";
  buttonValue?: string;
}): messagingApi.FlexMessage {
  const color = opts.headerColor || ACCENT;
  const footer: messagingApi.FlexComponent[] = [];
  if (opts.buttonLabel && opts.buttonAction && opts.buttonValue) {
    footer.push({
      type: "button", style: "primary", height: "sm", color,
      action:
        opts.buttonAction === "uri"
          ? { type: "uri", label: opts.buttonLabel.slice(0, 20), uri: opts.buttonValue }
          : { type: "postback", label: opts.buttonLabel.slice(0, 20), data: opts.buttonValue, displayText: opts.buttonLabel },
    });
  }
  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    header: {
      type: "box", layout: "vertical", backgroundColor: color, paddingAll: "16px",
      contents: [{ type: "text", text: opts.title || " ", color: "#FFFFFF", weight: "bold", size: "lg", wrap: true }],
    },
    body: {
      type: "box", layout: "vertical",
      contents: [{ type: "text", text: opts.body || " ", size: "md", color: "#111111", wrap: true }],
    },
  };
  if (footer.length) bubble.footer = { type: "box", layout: "vertical", spacing: "sm", contents: footer };
  return { type: "flex", altText: opts.title || "ประกาศจากรุ่น BM33", contents: bubble };
}

// การ์ด handoff — ตอนบอทตอบไม่ได้ ส่งให้คนดูแล
// header (แถบสี) + body (ชื่อฝ่าย + โน้ต) + footer (ปุ่มโปรไฟล์ 1-4 ปุ่ม)
export function handoffFlex(info: RouteInfo): messagingApi.FlexMessage {
  const bodyContents: messagingApi.FlexComponent[] = [
    {
      type: "text",
      text: info.label,
      weight: "bold",
      size: "lg",
      color: "#111111",
      wrap: true,
    },
  ];
  if (info.note) {
    bodyContents.push({
      type: "text",
      text: info.note,
      size: "sm",
      color: "#666666",
      wrap: true,
      margin: "sm",
    });
  }

  const buttons: messagingApi.FlexButton[] = info.contacts
    .slice(0, 4)
    .map((c, i): messagingApi.FlexButton => ({
      type: "button",
      style: i === 0 ? "primary" : "secondary",
      height: "sm",
      color: i === 0 ? ACCENT : undefined,
      action: { type: "uri", label: c.buttonLabel, uri: c.profileUrl },
    }));

  return {
    type: "flex",
    altText: `ติดต่อ${info.label}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: ACCENT,
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "ขอส่งให้คนดูแลช่วยตอบนะ 🙏",
            color: "#FFFFFF",
            weight: "bold",
            size: "md",
            wrap: true,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: bodyContents,
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: buttons,
      },
    },
  };
}

// ── v2 ──────────────────────────────────────────────────────────────────────
const BLUE = "#1D4ED8";

// การ์ดปุ่มลิงก์ (สูงสุด 4) — ใช้แนบท้ายคำตอบของ AI / ประกาศ
export function linksFlex(links: { label: string; url: string }[], title = "ลิงก์ที่เกี่ยวข้อง"): messagingApi.FlexMessage {
  const btns = links.filter((l) => /^https?:\/\//.test(l.url)).slice(0, 4);
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble", size: "kilo",
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px",
        contents: [
          { type: "text", text: title, weight: "bold", size: "sm", color: "#0F172A" },
          ...btns.map((l, i): messagingApi.FlexButton => ({
            type: "button", style: i === 0 ? "primary" : "secondary", height: "sm", color: i === 0 ? BLUE : undefined,
            action: { type: "uri", label: (l.label || "เปิดลิงก์").slice(0, 20), uri: l.url },
          })),
        ],
      },
    },
  };
}

// การ์ดติดต่อคนดูแล — ประธานรุ่นอยู่ปุ่มแรกเสมอ + ฝ่ายที่เกี่ยวข้อง
export async function contactFlex(topic = "อื่นๆ"): Promise<messagingApi.FlexMessage> {
  const { readCommittee } = await import("@/lib/bc/committee");
  const { ROUTING } = await import("@/lib/routing");
  let committee: Awaited<ReturnType<typeof readCommittee>> = [];
  try { committee = await readCommittee(); } catch { /* ใช้ค่าตั้งต้น */ }
  const pres = committee.find((c) => /ประธาน/.test(c.role) && !/รอง/.test(c.role) && c.contact_url);
  const buttons: { label: string; url: string }[] = [];
  buttons.push({ label: `ทักประธาน${pres?.nickname ? ` ${pres.nickname}` : ""}`.slice(0, 20), url: pres?.contact_url || "https://line.me/ti/p/~pi_pe_2006" });
  const roleRe: Record<string, RegExp> = { การเงิน: /การเงิน/, วิชาการ: /วิชาการ/, กิจกรรม: /กิจการ|กิจกรรม|พัฒนาคุณภาพ/ };
  const re = roleRe[topic];
  if (re) {
    const c = committee.find((x) => re.test(x.role) && x.contact_url);
    const fallback = ROUTING[topic]?.contacts?.[0];
    const url = c?.contact_url || fallback?.profileUrl;
    if (url && !buttons.some((b) => b.url === url)) buttons.push({ label: (c ? `ทัก${c.role.replace(/^ฝ่าย/, "ฝ่าย")} ${c.nickname}` : fallback!.buttonLabel).slice(0, 20), url });
  }
  for (const vp of committee.filter((x) => /รองประธาน/.test(x.role) && x.contact_url)) {
    if (buttons.length >= 3) break;
    buttons.push({ label: `รองฯ ${vp.nickname}`.slice(0, 20), url: vp.contact_url });
  }
  const note = ROUTING[topic]?.note;
  return {
    type: "flex",
    altText: "ติดต่อประธานรุ่น / คนดูแล",
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: BLUE, paddingAll: "16px",
        contents: [
          { type: "text", text: "ขอส่งต่อให้คนดูแลรุ่นนะ 🙏", color: "#FFFFFF", weight: "bold", size: "md", wrap: true },
          { type: "text", text: "เรื่องนี้ให้คนตอบจะชัวร์ที่สุด", color: "#DBEAFE", size: "xs", margin: "sm", wrap: true },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: `ประธานรุ่น · ${pres?.nickname ?? "ไปร์ท"}`, weight: "bold", size: "lg", color: "#0F172A", wrap: true },
          ...(note ? [{ type: "text", text: note, size: "sm", color: "#64748B", wrap: true, margin: "sm" } as messagingApi.FlexText] : []),
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: buttons.slice(0, 4).map((b, i): messagingApi.FlexButton => ({
          type: "button", style: i === 0 ? "primary" : "secondary", height: "sm", color: i === 0 ? BLUE : undefined,
          action: { type: "uri", label: b.label, uri: b.url },
        })),
      },
    },
  };
}
