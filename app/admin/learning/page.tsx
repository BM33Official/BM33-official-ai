import { requireAuth } from "@/lib/bc/auth";
import { readTable } from "@/lib/google-sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Learning() {
  requireAuth();

  // 07 = บัฟเฟอร์ข้อความจากกลุ่ม, 01 = ฐานความรู้ (AI เขียน KB-AUTO-*)
  const [buffer, kb] = await Promise.all([
    readTable("07_ข้อความทั้งหมด").catch(() => []),
    readTable("01_ฐานความรู้_AI").catch(() => []),
  ]);

  const nw = buffer.filter((r) => { const s = String(r["สถานะเรียนรู้"] ?? "").trim(); return !s || s === "new"; }).length;
  const processed = buffer.length - nw;
  const learned = kb.filter((r) => String(r["รหัสความรู้"] ?? "").startsWith("KB-AUTO")).reverse();
  const recent = [...buffer].reverse().slice(0, 30);

  return (
    <div className="wrap">
      <h1>การเรียนรู้จากกลุ่ม</h1>
      <p className="sub">บอทอ่านแชต/รูปในกลุ่มวันละ 3 รอบ (13:30 / 20:00 / 03:00) แล้วสรุปเป็นความรู้ — อ่านเฉพาะข้อความใหม่ตั้งแต่รอบก่อนหน้า</p>

      <div className="grid g4">
        <div className="card"><div className="label">ข้อความในบัฟเฟอร์</div><div className="stat">{buffer.length}</div></div>
        <div className="card"><div className="label">รอสรุป (ใหม่)</div><div className="stat">{nw}</div></div>
        <div className="card"><div className="label">สรุปแล้ว</div><div className="stat">{processed}</div></div>
        <div className="card"><div className="label">ความรู้ที่ AI เพิ่ม</div><div className="stat">{learned.length}</div></div>
      </div>

      <h2>ความรู้ที่ AI เพิ่มเข้ามา (ล่าสุด)</h2>
      <div className="card tablecard">
        {learned.length === 0 ? <p className="sub" style={{ margin: 0 }}>ยังไม่มีความรู้ที่ AI สรุปเพิ่ม (รอรอบถัดไป)</p> : (
          <table>
            <thead><tr><th>หมวด</th><th>หัวข้อ</th><th>คำตอบ</th><th>ลิงก์</th><th>วันที่</th></tr></thead>
            <tbody>
              {learned.slice(0, 40).map((r, i) => (
                <tr key={i}>
                  <td>{String(r["หมวด"] ?? "")}</td>
                  <td>{String(r["หัวข้อ"] ?? "").slice(0, 40)}</td>
                  <td className="hint">{String(r["คำตอบ/ข้อความต้นทาง"] ?? "").slice(0, 90)}</td>
                  <td className="hint">{String(r["ลิงก์"] ?? "") ? <a href={String(r["ลิงก์"])} target="_blank">เปิด</a> : "-"}</td>
                  <td className="hint">{String(r["วันที่ต้นทาง"] ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>ข้อความ/รูปล่าสุดที่บอทเก็บ</h2>
      <div className="card tablecard">
        {recent.length === 0 ? <p className="sub" style={{ margin: 0 }}>ยังไม่มีข้อความจากกลุ่ม (เพิ่มบอทเข้ากลุ่มก่อน)</p> : (
          <table>
            <thead><tr><th>เวลา</th><th>ผู้ส่ง</th><th>ชนิด</th><th>เนื้อหา / คำบรรยายรูป</th><th>สถานะ</th></tr></thead>
            <tbody>
              {recent.map((r, i) => {
                const type = String(r["ประเภท"] ?? "");
                const st = String(r["สถานะเรียนรู้"] ?? "new");
                return (
                  <tr key={i}>
                    <td className="hint">{String(r["เวลา(ISO)"] ?? "").slice(0, 16).replace("T", " ")}</td>
                    <td>{String(r["ชื่อแสดงผล"] ?? "") || "-"}</td>
                    <td>{type === "image" ? "🖼 รูป" : "💬 ข้อความ"}</td>
                    <td className="hint">{String(r["เนื้อหา/คำบรรยายรูป"] ?? "").slice(0, 100)}</td>
                    <td>{st === "processed" ? <span className="badge b-ok">สรุปแล้ว</span> : <span className="badge b-warn">ใหม่</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>หมายเหตุ: รูปจะถูกเก็บเป็น &quot;คำบรรยายที่ AI อ่านได้&quot; (ไม่เก็บไฟล์รูปจริง)</p>
    </div>
  );
}
