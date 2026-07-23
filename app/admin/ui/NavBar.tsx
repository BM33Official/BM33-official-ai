"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/admin/api/counts")
        .then((r) => r.json())
        .then((j) => { if (alive && j.ok) setC(j); })
        .catch(() => {});
    load();
    // refresh badges gently while the panel is open
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <nav className="bc-nav">
      <span className="brand">BM33 · Control Center</span>
      {LINKS.map((l) => {
        const n = l.key ? c[l.key] || 0 : 0;
        const active = pathname === l.href;
        return (
          <Link key={l.href} href={l.href} prefetch className={active ? "active" : ""}>
            {l.label}
            {n > 0 && <span className="navbadge">{n}</span>}
          </Link>
        );
      })}
      <span className="spacer" />
      <Logout />
    </nav>
  );
}
