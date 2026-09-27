"use client";
// แอปสมาชิก BM33 — โครงหลัก: พื้นหลังน้ำไหล + 4 แท็บ (หน้าหลัก = ประกาศ/สิ่งที่ต้องกรอก/วันนี้ · ของฉัน = เรื่องส่วนตัว) + sheet + overlay การสุ่ม
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FluidBackground from "./FluidBackground";
import { useApp, haptic } from "./useApp";
import { TabBar, TabKey, TABS, Sheet, Toast } from "./Chrome";
import Home, { useNow } from "./Home";
import { AnnouncementDetail } from "./News";
import Schedule from "./Schedule";
import Me from "./Me";
import FortuneScreen from "./fortune/Fortune";
import { DrawOverlay, Splash, ConfirmScreen, RegisterScreen, OutsideLine } from "./Overlays";

const TAB_TITLE: Record<TabKey, string> = { home: "BM33", schedule: "ตาราง", me: "ของฉัน", fortune: "เซียมซี" };
// ลิงก์เก่า (?tab=news / todo) -> หน้าหลัก
const TAB_ALIAS: Record<string, TabKey> = { news: "home", todo: "home", tasks: "home", forms: "home", fees: "me", zone: "me" };

export default function PortalApp() {
  const app = useApp();
  const { phase, data } = app;
  const [tab, setTab] = useState<TabKey>("home");
  const [meSection, setMeSection] = useState<string | undefined>();
  const [homeFocus, setHomeFocus] = useState<string | undefined>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [energy, setEnergy] = useState(0);
  const [toast, setToastRaw] = useState({ t: "", n: 0 });
  const setToast = useCallback((t: string) => setToastRaw((x) => ({ t, n: x.n + 1 })), []);
  const [scrolled, setScrolled] = useState(false);
  const screens = useRef<Partial<Record<TabKey, HTMLElement | null>>>({});
  const now = useNow(1000, phase.kind === "ready");

  // แท็บเริ่มต้นจากลิงก์ (?tab=news) — ใช้กับปุ่มเมนู LINE
  // LIFF ส่งพารามิเตอร์มาใน liff.state (เช่น ?liff.state=%3Ftab%3Dnews) ก่อน init เสร็จ -> อ่านทั้งสองแบบ
  useEffect(() => {
    const read = () => {
      const u = new URL(window.location.href);
      const inner = new URLSearchParams((u.searchParams.get("liff.state") ?? "").replace(/^[^?]*\?/, ""));
      const raw = u.searchParams.get("tab") ?? inner.get("tab") ?? "";
      const t = (TAB_ALIAS[raw] ?? raw) as TabKey;
      if (t && TABS.some((x) => x.key === t)) setTab(t);
      if (raw === "fees" || raw === "zone") setMeSection(raw);
      const focus = u.searchParams.get("focus") ?? inner.get("focus");
      if (focus) setHomeFocus(focus);
      const ann = u.searchParams.get("a") ?? inner.get("a");
      if (ann) setOpenId(ann);
    };
    read();
    const t = setTimeout(read, 1500); // หลัง LIFF แทนที่ URL
    return () => clearTimeout(t);
  }, []);

  // แถบชื่อบางด้านบนเมื่อเลื่อน
  useEffect(() => {
    const el = screens.current[tab];
    if (!el) return;
    const on = () => setScrolled(el.scrollTop > 64);
    on();
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, [tab, phase.kind]);

  const go = useCallback((t: TabKey, section?: string) => {
    haptic();
    if (t === "me") setMeSection(section);
    if (t === tab) screens.current[t]?.scrollTo({ top: 0, behavior: "smooth" });
    setTab(t);
  }, [tab]);

  const claimForm = useCallback(async (id: string) => {
    const r = await app.api("claim", { formId: id });
    setToast(r.ok ? (r.state === "done" ? "ตรวจพบในระบบแล้ว ✓ ขอบคุณนะ" : "รับเรื่องแล้ว รอกรรมการตรวจ 🙏") : String(r.error ?? "ลองใหม่อีกครั้งนะ"));
    app.refresh();
  }, [app]);

  const badges = useMemo(() => {
    if (!data) return {};
    const today = new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
    return {
      me: data.mine.fees.overdue > 0,
      fortune: data.mine.fortune.last_day !== today,
    } as Partial<Record<TabKey, boolean>>;
  }, [data, now]);

  const openAnn = data?.board.announcements.find((a) => a.id === openId) ?? null;

  if (phase.kind === "boot" && !data) return <><FluidBackground /><div className="bm-grain" /><Splash /></>;
  if (phase.kind === "outside") return <><FluidBackground /><OutsideLine /></>;
  if (phase.kind === "error") return <><FluidBackground /><Splash text={phase.message} /></>;
  if (phase.kind === "confirm") {
    return (
      <>
        <FluidBackground />
        <ConfirmScreen candidate={phase.candidate} picture={phase.picture} onYes={() => app.confirm(phase.claim)} onNo={() => app.setPhase({ kind: "register", picture: phase.picture })} />
      </>
    );
  }
  if (phase.kind === "register") return <><FluidBackground /><RegisterScreen name={phase.name} onSubmit={app.register} /></>;
  if (!data) return <><FluidBackground /><div className="bm-grain" /><Splash text="กำลังโหลดข้อมูลล่าสุด…" /></>;

  return (
    <>
      <FluidBackground energy={energy} />
      <div className="bm-grain" />
      {app.isPreview && <div className="preview-flag">โหมดพรีวิว (แอดมิน) · {data.mine.me.nickname}</div>}
      <div className={`navbar ${scrolled && tab !== "home" ? "show" : ""}`}>{TAB_TITLE[tab]}</div>

      <main className="shell">
        <section ref={(el) => { screens.current.home = el; }} className={`screen ${tab === "home" ? "active" : ""}`} aria-hidden={tab !== "home"}>
          <Home data={data} active={tab === "home"} picture={app.picture} openAnn={setOpenId} go={go} claimForm={claimForm} focus={homeFocus} onFocused={() => setHomeFocus(undefined)} />
        </section>
        <section ref={(el) => { screens.current.schedule = el; }} className={`screen ${tab === "schedule" ? "active" : ""}`} aria-hidden={tab !== "schedule"}>
          <Schedule data={data} active={tab === "schedule"} />
        </section>
        <section ref={(el) => { screens.current.fortune = el; }} className={`screen ${tab === "fortune" ? "active" : ""}`} aria-hidden={tab !== "fortune"}>
          <FortuneScreen
            sid={data.mine.me.sid} nickname={data.mine.me.nickname} server={data.mine.fortune} board={data.board.fortune}
            active={tab === "fortune"} onEnergy={setEnergy} api={app.api} liff={app.liff} preview={app.isPreview} toast={setToast}
          />
        </section>
        <section ref={(el) => { screens.current.me = el; }} className={`screen ${tab === "me" ? "active" : ""}`} aria-hidden={tab !== "me"}>
          <Me data={data} picture={app.picture} section={meSection} onSectionDone={() => setMeSection(undefined)} api={app.api} refresh={app.refresh} toast={setToast} />
        </section>
      </main>

      <TabBar tab={tab} onTab={(t) => go(t)} badges={badges} />

      <Sheet open={!!openAnn} onClose={() => setOpenId(null)}>
        {openAnn && <AnnouncementDetail a={openAnn} now={now} />}
      </Sheet>

      <DrawOverlay data={data} now={now} />
      <Toast text={toast.t} n={toast.n} />
    </>
  );
}
