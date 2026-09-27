"use client";
// เมนูแบบหน้าตั้งค่า iPhone — ไอคอนสีในกรอบมน จัดกลุ่มสั้น ๆ ไม่มีคำอธิบายยาว
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sun, Inbox, Megaphone, CalendarDays, BookOpen, ClipboardCheck, Wallet, GraduationCap, Users, Sparkles, Settings, Smartphone, Menu,
  type LucideIcon,
} from "lucide-react";
import Logout from "./Logout";
import type { Tone } from "./kit";

type Item = { href: string; label: string; icon: LucideIcon; tone: Tone; badge?: string };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  { title: "", items: [
    { href: "/admin", label: "วันนี้", icon: Sun, tone: "orange" },
    { href: "/admin/inbox", label: "รออนุมัติ", icon: Inbox, tone: "red", badge: "inbox" },
  ] },
  { title: "สื่อสารกับเพื่อน", items: [
    { href: "/admin/announcements", label: "ประกาศ", icon: Megaphone, tone: "blue", badge: "announcements" },
    { href: "/admin/daily", label: "ปฏิทิน & สรุปวันนี้", icon: CalendarDays, tone: "pink" },
    { href: "/admin/forms", label: "สิ่งที่ต้องกรอก", icon: ClipboardCheck, tone: "green" },
    { href: "/admin/schedule", label: "ตารางเรียน & สอบ", icon: BookOpen, tone: "indigo" },
  ] },
  { title: "ฝ่าย", items: [
    { href: "/admin/finance", label: "การเงิน", icon: Wallet, tone: "teal", badge: "slips" },
    { href: "/admin/academic", label: "วิชาการ & Red Zone", icon: GraduationCap, tone: "purple" },
  ] },
  { title: "ระบบ", items: [
    { href: "/admin/members", label: "สมาชิก", icon: Users, tone: "gray", badge: "members" },
    { href: "/admin/ai", label: "AI & งบ", icon: Sparkles, tone: "indigo" },
    { href: "/admin/settings", label: "ตั้งค่า", icon: Settings, tone: "gray" },
  ] },
];

const ROLE_ONLY: Record<string, string[]> = { academic: ["/admin/academic"], finance: ["/admin/finance"] };
const ROLE_NAME: Record<string, string> = { admin: "แอดมิน", academic: "ฝ่ายวิชาการ", finance: "ฝ่ายการเงิน" };

export default function NavBar() {
  const [c, setC] = useState<Record<string, number>>({});
  const [role, setRole] = useState<string>("");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    const load = () => fetch("/admin/api/counts").then((r) => r.json()).then((j) => { if (alive && j.ok) { setC(j); setRole(j.role || "admin"); } }).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  if (pathname === "/admin/login") return null;

  const allowed = ROLE_ONLY[role];
  const groups = GROUPS.map((g) => ({ ...g, items: allowed ? g.items.filter((i) => allowed.includes(i.href)) : g.items })).filter((g) => g.items.length);
  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  const current = GROUPS.flatMap((g) => g.items).find((i) => active(i.href));
  const totalBadge = ["inbox", "slips"].reduce((a, k) => a + (c[k] || 0), 0);

  const menu = (
    <>
      <div className="sb-brand"><span className="logo">33</span><div><b>BM33</b><small>{ROLE_NAME[role] ?? "Control Center"}</small></div></div>
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && <div className="sb-title">{g.title}</div>}
          <div className="sb-group">
            {g.items.map((it) => {
              const n = it.badge ? c[it.badge] || 0 : 0;
              const Icon = it.icon;
              return (
                <Link key={it.href} href={it.href} prefetch className={`sb-item ${active(it.href) ? "active" : ""}`}>
                  <span className={`ic c-${it.tone}`}><Icon strokeWidth={2.4} /></span>
                  <span className="sb-tx">{it.label}</span>
                  {n > 0 && <span className="navbadge">{n}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <div className="sb-foot">
        {role === "admin" && <a className="sb-app" href="/app?preview=6801101071" target="_blank" rel="noreferrer"><Smartphone size={17} /> ดูแอปเพื่อน ๆ</a>}
        <Logout />
      </div>
    </>
  );

  return (
    <>
      <aside className="sidebar">{menu}</aside>
      <header className="topbar">
        <button className="tb-menu" onClick={() => setOpen(true)} aria-label="เมนู"><Menu size={24} />{totalBadge > 0 && <span className="navbadge">{totalBadge}</span>}</button>
        <div className="tb-title">{current ? current.label : "BM33"}</div>
        <span style={{ width: 44 }} />
      </header>
      <div className={`drawer-scrim ${open ? "on" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`drawer ${open ? "on" : ""}`}>{menu}</aside>
    </>
  );
}
