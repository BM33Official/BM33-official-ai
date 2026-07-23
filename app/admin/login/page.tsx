"use client";
import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/admin/api/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (r.ok) { const j = await r.json().catch(() => ({})); window.location.href = j.redirect || "/admin"; return; }
    const j = await r.json().catch(() => ({}));
    setErr(j.error || "เข้าสู่ระบบไม่สำเร็จ"); setBusy(false);
  }

  return (
    <div className="wrap">
      <form className="card login-box" onSubmit={submit}>
        <h1>เข้าสู่ระบบ</h1>
        <p className="sub">Control Center รุ่น BM33</p>
        <div className="field">
          <label>รหัสผ่าน</label>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </div>
        {err && <div className="msg msg-err">{err}</div>}
        <button className="btn-primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "กำลังเข้า…" : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}
