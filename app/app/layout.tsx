import "./portal.css";
import type { ReactNode } from "react";
import type { Viewport } from "next";

export const metadata = {
  title: "BM33",
  description: "แอปของรุ่น BM33 — ประกาศ ตารางเรียน เงินรุ่น งานค้าง และเซียมซี",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "BM33" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#030B2B",
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <div className="bm-root">{children}</div>;
}
