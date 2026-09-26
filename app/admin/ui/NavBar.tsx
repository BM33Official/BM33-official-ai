"use client";
// เมนูหลักของ Control Center — จัดกลุ่มตาม "กำลังจะทำอะไร" ให้คนใหม่เข้าใจทันที
// จอใหญ่ = แถบซ้าย · มือถือ/ไอแพดแนวตั้ง = แถบบน + ลิ้นชักเมนู
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logout from "./Logout";

type Item = { href: string; label: string; icon: string; badge?: string; desc: string };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "",
    items: [
      { href: "/admin", label: "ภาพรวมวันนี้", icon: "🏠", desc: "สิ่งที่ต้องทำตอนนี้" },
      { href: "/admin/inbox", label: "กล่องรอตรวจ", icon: "📥", badge: "inbox", desc: "อนุมัติข้อความ/ตรวจคำขอ" },
    ],
  },
  {
    title: "ขึ้นแอปสมาชิก",
    items: [
      { href: "/admin/announcements", label: "ประกาศ", icon: "📣", badge: "announcements", desc: "ประกาศบนแอป + เตือนเดดไลน์" },
      { href: "/admin/daily", label: "สรุปวันนี้", icon: "☀️", desc: "สรุปประจำวันบนหน้าแรกแอป" },
      { href: "/admin/schedule", label: "ตารางเรียน & สอบ", icon: "🗓", desc: "อัปโหลดตาราง · นับถอยหลังสอบ" },
      { href: "/admin/forms", label: "ฟอร์ม & งาน", icon: "📝", desc: "ติดตามว่าใครยังไม่ทำ" },
    ],
  },
  {
    title: "ส่งข้อความ LINE",
    items: [
      { href: "/admin/broadcasts", label: "บรอดแคสต์", icon: "📨", badge: "broadcasts", desc: "ส่งข้อความถึงทุกคน/เฉพาะกลุ่ม" },
    ],
  },
  {
    title: "ฝ่ายต่าง ๆ",
    items: [
      { href: "/admin/academic", label: "วิชาการ & Red Zone", icon: "📘", desc: "จำข้อสอบ · สุ่มผู้เข้าร่วม" },
      { href: "/admin/finance", label: "การเงิน", icon: "💰", desc: "เงินรุ่นรายเดือน" },
    ],
  },
  {
    title: "ระบบ",
    items: [
      { href: "/admin/members", label: "สมาชิก", icon: "👥", badge: "members", desc: "ใครลงทะเบียน/เปิดแอปแล้ว" },
      { href: "/admin/ai", label: "AI & ความรู้", icon: "🤖", badge: "learning", desc: "ทดสอบบอท · ดูบทสนทนา" },
      { href: "/admin/settings", label: "ตั้งค่า", icon: "⚙️", desc: "กรรมการ · รหัสผ่าน · วิธีจ่ายเงิน" },
    ],
  },
];

const ROLE_ONLY: Record<string, string[]> = {
  academic: ["/admin/academic"],
  finance: ["/admin/finance"],
};
const ROLE_NAME: Record<string, string> = { admin: "แอดมิน", academic: "ฝ่ายวิชาการ", finance: "ฝ่ายการเงิน" };

export default function NavBar() {
  const [c, setC] = useState<Record<string, number>>({});
  const [role, setRole] = useState<string>("");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/admin/api/counts")
        .then((r) => r.json())
        .then((j) => { if (alive && j.ok) { setC(j); setRole(j.role || "admin"); } })
        .catch(() => {});
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
  const totalBadge = ["inbox", "announcements", "broadcasts", "members"].reduce((a, k) => a + (c[k] || 0), 0);

  const menu = (
    <>
      {groups.map((g, gi) => (
        <div key={gi} className="sb-group">
          {g.title && <div className="sb-title">{g.title}</div>}
          {g.items.map((it) => {
            const n = it.badge ? c[it.badge] || 0 : 0;
            return (
              <Link key={it.href} href={it.href} prefetch className={`sb-item ${active(it.href) ? "active" : ""}`}>
                <span className="sb-ic">{it.icon}</span>
                <span className="sb-tx"><b>{it.label}</b><small>{it.desc}</small></span>
                {n > 0 && <span className="navbadge">{n}</span>}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="sb-foot">
        {role === "admin" && <a className="sb-app" href="/app?preview=6801101071" target="_blank" rel="noreferrer">📱 ดูแอปสมาชิก (พรีวิว)</a>}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="hint" style={{ margin: 0 }}>เข้าสู่ระบบเป็น <b>{ROLE_NAME[role] ?? "…"}</b></span>
          <Logout />
        </div>
      </div>
    </>
  );

  return (
    <>
      <aside className="sidebar">
        <div className="sb-brand"><span className="logo">B</span><div><b>BM33</b><small>Control Center</small></div></div>
        {menu}
      </aside>
      <header className="topbar">
        <button className="tb-menu" onClick={() => setOpen(true)} aria-label="เมนู">
          ☰{totalBadge > 0 && <span className="navbadge" style={{ marginLeft: 4 }}>{totalBadge}</span>}
        </button>
        <div className="tb-title">{current ? `${current.icon} ${current.label}` : "BM33 Control Center"}</div>
        <span style={{ width: 44 }} />
      </header>
      <div className={`drawer-scrim ${open ? "on" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`drawer ${open ? "on" : ""}`}>
        <div className="sb-brand"><span className="logo">B</span><div><b>BM33</b><small>Control Center</small></div></div>
        {menu}
      </aside>
    </>
  );
}
