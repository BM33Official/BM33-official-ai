// หน้าแนะนำเริ่มใช้งาน (สาธารณะ) — ส่งลิงก์นี้ให้เพื่อนทั้งรุ่น: QR เพิ่มเพื่อน + ทีละขั้นจนใช้แอปได้
// ดึง LINE ID ของบอทจริงจาก LINE (ไม่ต้องพิมพ์เอง) — ไม่มีข้อมูลส่วนตัวของใคร
import type { Metadata } from "next";
import { lineClient } from "@/lib/line";

export const revalidate = 3600;
export const metadata: Metadata = { title: "เริ่มใช้ BM33", description: "เพิ่มเพื่อนบอท BM33 และเปิดแอปของรุ่นใน 3 นาที" };

async function bot() {
  try {
    const b = await lineClient.getBotInfo();
    return { id: b.basicId, name: b.displayName, pic: b.pictureUrl ?? "" };
  } catch { return null; }
}

const STEPS: { t: string; d: string; tip?: string }[] = [
  { t: "เพิ่มเพื่อน BM33", d: "สแกน QR ด้านบนด้วยกล้องมือถือ หรือกดปุ่ม “เพิ่มเพื่อน” (ถ้าเปิดหน้านี้ในมือถืออยู่แล้ว)", tip: "เปิดแจ้งเตือนของแชต BM33 ไว้ด้วย จะได้ไม่พลาดเรื่องสำคัญ" },
  { t: "ยืนยันตัวตนในแชต", d: "บอทจะทักมาทันที พิมพ์ ชื่อเล่น ชื่อจริง + เลข 3 ตัวท้ายรหัสนักศึกษา ในข้อความเดียว เช่น  บิงโก วีร์ทิวัตถ์ 071", tip: "พิมพ์ผิดไม่เป็นไร พิมพ์ใหม่ได้เลย" },
  { t: "กด “ใช่” เพื่อยืนยัน", d: "บอทจะถามว่า “คุณคือ … ใช่ไหม?” ตรวจชื่อแล้วกด ใช่ — เสร็จแล้ว ✅" },
  { t: "เปิดแอป BM33", d: "แตะปุ่มใหญ่ “หน้าหลัก” ในเมนูด้านล่างแชต → แอปเปิดใน LINE → กด “อนุญาต” ครั้งแรกครั้งเดียว", tip: "ถ้าแอปถามว่า “นี่คือคุณใช่ไหม?” กดใช่ได้เลย" },
  { t: "ใช้งานได้ทุกอย่าง", d: "หน้าหลัก = สอบถัดไป · เงินรุ่น · Red Zone · วันนี้เรียน · สิ่งที่ต้องกรอก · ประกาศ ในหน้าเดียว — กรอกฟอร์มแล้วแตะวงกลม ✓ บอทจะไม่เตือนเรื่องนั้นอีก" },
];

const USES: [string, string][] = [
  ["💬", "มีคำถามเรื่องรุ่น พิมพ์ถามบอทในแชต BM33 ได้เลย (ในกลุ่มบอทจะเงียบ ไม่ตอบ)"],
  ["💸", "จ่ายเงินรุ่นแล้ว ส่งรูปสลิปในแชต หรือกด “ส่งสลิป” ในหน้า ของฉัน"],
  ["🐉", "เซียมซีมังกร ลุ้นแจ็กพอตทุกวัน ชื่อคนได้แจ็กพอตขึ้นหอเกียรติยศ"],
  ["📚", "LinkTree วิชาการ รวมทุกลิงก์ อยู่แถบล่างสุดของเมนู"],
];

export default async function Join() {
  const b = await bot();
  const add = b ? `https://line.me/R/ti/p/${encodeURIComponent(b.id)}` : "";
  const qr = b ? `https://qr-official.line.me/sid/L/${b.id.replace(/^@/, "")}.png` : "";
  return (
    <main className="jp">
      <style>{CSS}</style>
      <header className="jp-hero">
        <div className="jp-badge">BM33 · แพทย์วชิระ รุ่น 33</div>
        <h1>เริ่มใช้ BM33 ใน 3 นาที</h1>
        <p>บอท + แอปกลางของรุ่น: ประกาศ สิ่งที่ต้องกรอก ตารางเรียน เงินรุ่น Red Zone และเซียมซี รวมไว้ในที่เดียว</p>
      </header>

      <section className="jp-qr">
        {b ? (
          <>
            <img src={qr} alt={`QR เพิ่มเพื่อน ${b.name}`} width={220} height={220} />
            <div>
              <div className="jp-name">{b.pic && <img src={b.pic} alt="" />}<b>{b.name}</b><span>{b.id}</span></div>
              <a className="jp-add" href={add}>＋ เพิ่มเพื่อน BM33</a>
              <small>หรือค้นหา LINE ID <b>{b.id}</b> ในแอป LINE</small>
            </div>
          </>
        ) : <p>โหลด QR ไม่ได้ชั่วคราว — ลองรีเฟรชอีกครั้ง</p>}
      </section>

      <ol className="jp-steps">
        {STEPS.map((s, i) => (
          <li key={i}>
            <span className="n">{i + 1}</span>
            <div><b>{s.t}</b><p>{s.d}</p>{s.tip && <small>💡 {s.tip}</small>}</div>
          </li>
        ))}
      </ol>

      <section className="jp-uses">
        <h2>ใช้ทำอะไรได้บ้าง</h2>
        {USES.map(([e, t], i) => <div key={i}><span>{e}</span><p>{t}</p></div>)}
      </section>

      <section className="jp-faq">
        <h2>ติดปัญหา?</h2>
        <details><summary>บอทบอกว่า “ไม่พบรหัส”</summary><p>เช็กว่าพิมพ์เลข 3 ตัวท้ายของรหัสนักศึกษา (ไม่ใช่เลขที่) แล้วพิมพ์ใหม่ทั้งชื่อและเลขในข้อความเดียว</p></details>
        <details><summary>เปิดแอปแล้วขึ้นว่าไม่ได้เปิดใน LINE</summary><p>ต้องเปิดจากปุ่มเมนูในแชต BM33 (ไม่ใช่เปิดลิงก์ในเบราว์เซอร์)</p></details>
        <details><summary>ยืนยันผิดคน / มีคนใช้รหัสเราแล้ว</summary><p>ทักฝ่ายสื่อสารองค์กรของรุ่น แอดมินแก้ให้ได้ในไม่กี่นาที</p></details>
        <details><summary>ทำไมบอทไม่ตอบในกลุ่มรุ่น</summary><p>ตั้งใจให้เงียบในกลุ่ม จะได้ไม่รก ถามได้ในแชตส่วนตัวกับ BM33 เท่านั้น</p></details>
      </section>
      <footer className="jp-foot">BM33 · ข้อมูลส่วนตัว (เงินรุ่น, Red Zone) เห็นเฉพาะเจ้าของเท่านั้น</footer>
    </main>
  );
}

const CSS = `
:root{--bg:#050d2e;--card:rgba(255,255,255,.07);--line:rgba(255,255,255,.12);--ink:#f3f7ff;--mut:rgba(210,224,255,.7)}
html,body{margin:0;background:radial-gradient(120% 60% at 10% 0%,#1d4ed8 0%,transparent 55%),radial-gradient(90% 60% at 100% 40%,#0369a1 0%,transparent 60%),var(--bg);color:var(--ink);font-family:"LINE Seed","Noto Sans Thai",-apple-system,sans-serif;min-height:100%}
.jp{max-width:640px;margin:0 auto;padding:28px 16px 48px}
.jp-hero h1{font-size:30px;line-height:1.2;margin:10px 0 8px;letter-spacing:-.02em}
.jp-hero p{color:var(--mut);margin:0;font-size:15px;line-height:1.55}
.jp-badge{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.06em;padding:5px 12px;border-radius:99px;background:rgba(255,255,255,.12)}
.jp-qr{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin:22px 0;padding:18px;border-radius:24px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line)}
.jp-qr>img{background:#fff;border-radius:16px;padding:8px;width:180px;height:180px}
.jp-qr>div{flex:1;min-width:200px;display:flex;flex-direction:column;gap:10px}
.jp-name{display:flex;align-items:center;gap:10px}.jp-name img{width:40px;height:40px;border-radius:50%}
.jp-name b{font-size:18px}.jp-name span{color:var(--mut);font-size:13px}
.jp-add{display:inline-flex;justify-content:center;padding:14px 20px;border-radius:99px;background:#06c755;color:#fff;font-weight:800;font-size:17px;text-decoration:none;box-shadow:0 12px 24px -12px #06c755}
.jp-qr small{color:var(--mut);font-size:12.5px}
.jp-steps{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}
.jp-steps li{display:flex;gap:14px;padding:14px 16px;border-radius:20px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line)}
.jp-steps .n{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:800;background:linear-gradient(160deg,#60a5fa,#1d4ed8)}
.jp-steps b{font-size:16.5px}.jp-steps p{margin:4px 0 0;font-size:14.5px;line-height:1.55;color:#e2eaff}.jp-steps small{display:block;margin-top:6px;color:#fde68a;font-size:13px}
.jp-uses,.jp-faq{margin-top:26px}.jp-uses h2,.jp-faq h2{font-size:19px;margin:0 0 10px}
.jp-uses div{display:flex;gap:12px;align-items:flex-start;padding:10px 2px;border-top:1px solid var(--line)}.jp-uses div:first-of-type{border-top:0}
.jp-uses span{font-size:22px}.jp-uses p{margin:0;font-size:14.5px;line-height:1.5}
.jp-faq details{padding:12px 16px;border-radius:16px;background:var(--card);margin-bottom:8px}
.jp-faq summary{font-weight:800;cursor:pointer;font-size:14.5px}.jp-faq p{margin:8px 0 0;font-size:14px;color:#e2eaff;line-height:1.55}
.jp-foot{margin-top:28px;text-align:center;color:var(--mut);font-size:12px}
`;
