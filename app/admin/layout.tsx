import "./admin.css";
import Link from "next/link";
import type { ReactNode } from "react";
import Logout from "./ui/Logout";

export const metadata = { title: "BM33 Control Center" };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <nav className="bc-nav">
        <span className="brand">BM33 · Control Center</span>
        <Link href="/admin">แดชบอร์ด</Link>
        <Link href="/admin/broadcasts">บรอดแคสต์</Link>
        <Link href="/admin/members">สมาชิก</Link>
        <Link href="/admin/forms">ฟอร์ม</Link>
        <Link href="/admin/inbox">กล่องรอตรวจ</Link>
        <span className="spacer" />
        <Logout />
      </nav>
      {children}
    </div>
  );
}
