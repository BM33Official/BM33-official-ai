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
