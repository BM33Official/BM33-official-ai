"use client";
export default function Logout() {
  async function out() {
    await fetch("/admin/api/login", { method: "DELETE" });
    window.location.href = "/admin/login";
  }
  return <button className="btn-sm" onClick={out}>ออกจากระบบ</button>;
}
