"use client";
import { useEffect, useState } from "react";
import Logout from "./Logout";

const LINKS = [
  { href: "/admin", label: "แดชบอร์ด", key: "" },
  { href: "/admin/broadcasts", label: "บรอดแคสต์", key: "broadcasts" },
  { href: "/admin/members", label: "สมาชิก", key: "members" },
  { href: "/admin/forms", label: "ฟอร์ม", key: "" },
  { href: "/admin/academic", label: "วิชาการ", key: "" },
  { href: "/admin/summary", label: "สรุป/รอส่ง", key: "summary" },
  { href: "/admin/inbox", label: "กล่องรอตรวจ", key: "inbox" },
  { href: "/admin/learning", label: "การเรียนรู้", key: "learning" },
];

export default function NavBar() {
  const [c, setC] = useState<Record<string, number>>({});
  const [path, setPath] = useState("");
  useEffect(() => {
    setPath(window.location.pathname);
    fetch("/admin/api/counts").then((r) => r.json()).then((j) => { if (j.ok) setC(j); }).catch(() => {});
  }, []);

  return (
    <nav className="bc-nav">
      <span className="brand">BM33 · Control Center</span>
      {LINKS.map((l) => {
        const n = l.key ? c[l.key] || 0 : 0;
        return (
          <a key={l.href} href={l.href} className={path === l.href ? "active" : ""}>
            {l.label}
            {n > 0 && <span className="navbadge">{n}</span>}
          </a>
        );
      })}
      <span className="spacer" />
      <Logout />
    </nav>
  );
}
