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
  return (
    <div className="bm-root">
      {/* Cinzel: ตัวอักษรโรมันหรู ๆ สำหรับเหรียญ BM33 และชื่อระดับในเซียมซี */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Noto+Serif+TC:wght@700&display=swap" />
      {children}
    </div>
  );
}
