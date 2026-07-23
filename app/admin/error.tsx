"use client";
// error boundary ของ /admin — ถ้า render พลาด (เช่น Sheets ตอบช้า/ติด rate-limit ชั่วคราว)
// แสดงหน้าสวย ๆ + ปุ่มลองใหม่ แทนหน้าจอ "Application error" ดิบ ๆ
import { useEffect } from "react";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // log ไว้ดูใน console (ฝั่ง client)
    console.error("admin_render_error", error?.digest, error?.message);
  }, [error]);

  return (
    <div className="wrap" style={{ maxWidth: 560 }}>
      <div className="card" style={{ textAlign: "center", padding: 34 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🌐</div>
        <h1 style={{ marginBottom: 6 }}>โหลดข้อมูลไม่สำเร็จชั่วคราว</h1>
        <p className="sub" style={{ marginBottom: 20 }}>
          ส่วนใหญ่เกิดจาก Google Sheets ตอบช้าหรือมีการอ่านถี่เกินไปชั่วขณะ — กด “ลองใหม่” ได้เลย มักหายในครั้งเดียว
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn-primary" onClick={() => reset()}>ลองใหม่อีกครั้ง</button>
          <a className="btn" href="/admin/academic">ไปหน้าวิชาการ</a>
        </div>
        {error?.digest && <p className="hint" style={{ marginTop: 16 }}>รหัสอ้างอิง: {error.digest}</p>}
      </div>
    </div>
  );
}
