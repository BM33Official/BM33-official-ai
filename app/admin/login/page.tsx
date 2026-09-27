"use client";
import { useState } from "react";
import { Lock } from "lucide-react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const expired = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("expired");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/admin/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) { const j = await r.json().catch(() => ({})); window.location.href = j.redirect || "/admin"; return; }
    const j = await r.json().catch(() => ({}));
    setErr(j.error || "เข้าสู่ระบบไม่สำเร็จ"); setBusy(false);
  }

  return (
    <div className="wrap">
      <form className="login-box" onSubmit={submit}>
        <span className="ic xl c-blue"><Lock strokeWidth={2.4} /></span>
        <h1>BM33 Control Center</h1>
        <p className="sub" style={{ marginTop: 0 }}>{expired ? "ลิงก์นี้หมดอายุแล้ว (รหัสผ่านถูกเปลี่ยน) ใส่รหัสผ่านใหม่ได้เลย" : "ใส่รหัสผ่านของคุณ (แอดมิน / ฝ่ายวิชาการ / ฝ่ายการเงิน)"}</p>
        <div className="field" style={{ marginTop: 18 }}>
          <input type="password" placeholder="รหัสผ่าน" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </div>
        {err && <div className="msg msg-err">{err}</div>}
        <button className="btn btn-primary btn-lg" style={{ width: "100%", marginTop: 10 }} disabled={busy}>{busy ? "กำลังเข้า…" : "เข้าสู่ระบบ"}</button>
      </form>
    </div>
  );
}
