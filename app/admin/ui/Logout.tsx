"use client";
import { LogOut } from "lucide-react";
export default function Logout() {
  async function out() {
    await fetch("/admin/api/login", { method: "DELETE" });
    window.location.href = "/admin/login";
  }
  return <button className="btn btn-sm btn-ghost" onClick={out} style={{ color: "var(--red-ink)" }}><LogOut size={16} /> ออกจากระบบ</button>;
}
