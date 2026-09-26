import "./admin.css";
import type { ReactNode } from "react";
import NavBar from "./ui/NavBar";

export const metadata = { title: "BM33 Control Center" };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="cc-shell">
      <NavBar />
      <main className="cc-main">{children}</main>
    </div>
  );
}
