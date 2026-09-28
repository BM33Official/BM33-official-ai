"use client";
// อัปเดตหน้าเองทุก ~15 วิ (การเงิน ↔ วิชาการใช้ข้อมูล Red Zone ร่วมกัน) — ไม่รีเฟรชตอนกำลังพิมพ์/มีงานยังไม่บันทึก
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function LiveSync({ every = 15 }: { every?: number }) {
  const router = useRouter();
  const [at, setAt] = useState<Date | null>(null); // เวลาเฉพาะฝั่งเบราว์เซอร์ (กัน hydration ไม่ตรง)
  useEffect(() => {
    setAt(new Date());
    const busy = () => {
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !["checkbox", "radio", "button"].includes((a as HTMLInputElement).type)))) return true;
      return !!document.querySelector("[data-dirty='1']");
    };
    const tick = () => {
      if (document.visibilityState !== "visible" || busy()) return;
      router.refresh();
      setAt(new Date());
    };
    const t = setInterval(tick, every * 1000);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [router, every]);
  return (
    <span className="live-sync" title="หน้านี้อัปเดตข้อมูลล่าสุดเองอัตโนมัติ (ฝ่ายอื่นแก้แล้วเห็นเลย)">
      <i /> อัปเดตสด{at ? ` · ${at.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
      <button onClick={() => { router.refresh(); setAt(new Date()); }} aria-label="รีเฟรช"><RefreshCw size={13} /></button>
    </span>
  );
}
