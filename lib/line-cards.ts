// Flex Message builders — การ์ดสวย ๆ สำหรับตอบใน LINE
// verify แล้วกับ @line/bot-sdk v11.2.0 (messagingApi.FlexMessage/FlexBubble/FlexBox/FlexText/FlexButton)

import { messagingApi } from "@line/bot-sdk";
import type { RouteInfo } from "./routing";

const ACCENT = "#06C755"; // เขียว LINE

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
