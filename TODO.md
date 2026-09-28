# BM33 v6 — วิชาการ / การเงิน round (2026-09-28)
- [x] Red Zone levels by count of "ค้าง" (unfilled exams + overdue/carried fee months): 1 เฝ้าระวัง · 2 ใกล้ · 3+ Red Zone — still sorted by score (`levelFor`, `ZONE_RED`)
- [x] One list per exam "ยังไม่ได้กรอก" (not_memorized_ids = not_filled_ids) — MarkGrid single grid, AI saveCheck writes both · `accepted_ids` column (SCHEMA v3.3)
- [x] App Red Zone: list of my unfilled exams → "ไปกรอก" (exam doc link) + "จำไม่ได้ ยอมโดน" (`accept` API; still counts, excluded from chasing)
- [x] ส่งข้อความถึงเพื่อน = 3 modes: invite (ก่อนตรวจ, everyone, schedulable) · chase (หลังตรวจ, 1 carousel per person, button per exam) · zone (2+ ค้าง) — `MsgCard` shared by LINE flex + web preview
- [x] **ฝ่ายวิชาการ/การเงิน send directly** (no admin approval) — outbox row kept as history (user decision 2026-09-28)
- [x] Finance: batch settings save (`setConfigMany`, parallel appends used to overwrite each other) · live refresh (LiveSync, router.refresh every 15 s unless typing/dirty) · "ค้างยกมา" per-person months (`fee_carry_json`, paste from sheet)
- [x] New-exam card with visible border + labels · credits = visible "ใครสร้างแอปนี้?" button in ของฉัน, faster animated reveal

# BM33 v5 — fixes round (2026-09-28)
- [x] Onboarding examples everywhere = "บิงโก วีร์ทิวัตถ์ 071" (ชื่อเล่น ชื่อจริง 3 ตัวท้าย) — bot ASK/retry, app sign-in, /join
- [x] App สิ่งที่ต้องกรอก: tap a ticked item → "ยกเลิกติ๊ก" (`unclaim`, only own self-claims) · link stays visible ("เปิด") after ticking
- [x] **เตือนรวม** (`lib/bc/digest.ts`): ONE pending outbox item (kind digest, payload `{keys}`) · 08:00 ONE LINE card to admin (ส่งทุกเรื่อง / เลือกเอง / ไม่ส่ง · `approve 123 1 3`) · inbox BatchCard with tick boxes + live preview · per-member ONE flex carousel (summary + link bubbles) compiled at send time (only their undone items) · manual "เตือน" buttons add to the batch · old per-item pending reminders auto-merged (status `merged`)
- [x] ประกาศ "เพิ่มลงปฏิทิน": LINE webview blocks blob downloads → signed `/api/cal/<id>?s=` .ics opened in external browser (alarms −1 d, −2 h) + Google Calendar link
- [x] Closed forms / past deadlines: shown 1 more day ("ปิดรับแล้ว"), then hidden from app (forms.closed_at column, SCHEMA v3.2)
- [x] Red Zone = missed exams + overdue fee months (config `red_zone_fees`, `red_zone_fee_weight`) · finance tab card · academic role sees only "เงินรุ่นค้าง" (no months)
- [x] ของฉัน: "สรุปสิ่งที่ต้องทำวันนี้" above ติดต่อกรรมการรุ่น
- [x] Easter egg (credits) — tap the footer line at the bottom of ของฉัน 7 times
- [ ] **User:** LINE OA Manager greeting message (if you set one there) still has the old example — edit it by hand

# BM33 v4 — polish round (2026-09-28)
- [x] Rich menu v4: 5 tiles on liquid blue (big หน้าหลัก · ประกาศ(+ต้องกรอก, deep link `focus=ann`) · ของฉัน · เซียมซี · ถามบอท) + LinkTree strip — `rich-menu/menu-v4.html` → `public/rich-menu-v4.jpg`, config `rich_menu_v4_id`
- [x] App home = compact dashboard: big running countdown, fees/red-zone alert tiles, today's classes row, สิ่งที่ต้องกรอก above ประกาศ (grouped by date, no categories), darker glass panels for readability
- [x] Schedule tab: today → exams → compact calendar → days ahead
- [x] Fortune: tiers Bronze/Silver/Gold/Platinum/Diamond/JACKPOT, 200 new rhyming/funny cards, dragon wheel (WheelArt.ts), unskippable cutscene with tier upgrades + near-miss + jackpot slam (Cutscene.tsx), synthesized SFX, Lucky Hour ×2, streak bonus, pity meter, Jackpot Pool, jackpot hall of fame (BC_fortunes `jackpot_at`,`jackpots`; config `fortune_pool_base`)
- [x] Control center: forms page fixed (server→client function prop crash) + name lists done/claimed/undone/unregistered + remind; approve-all per task + `trust_claims` (self-claim = done); money shown in baht (`usd_thb`, default 33)
- [x] Reminders: ONE compiled daily digest (`lib/bc/digest.ts`) per person listing only their undone items + link carousel; large outbox payloads gzip-packed (sheet cell limit)
- [x] Public guide `/join` (auto QR from LINE bot info)
- [ ] **User:** Settings → เมนู LINE → สร้างเมนู → ลองกับบัญชีฉัน → เปิดใช้กับทุกคน · set OA/OpenChat profile icon · reject old per-item reminders #679/#563 if still pending

# BM33 v3 — TODO (source of truth · started 2026-09-27)

Legend: `[x]` done & verified · `[~]` in progress · `[ ]` not started

## v3 goals (user request 2026-09-27)
- AI must fit **$10/month** for ~100 users with the same accuracy → retrieval instead of full-sheet prompt, metering, budget guard
- LINE groups: bot is **silent** (never replies, even when tagged) — only listens
- Import the two chat exports (main group + OpenChat, up to 27 Sep 2026) into the knowledge base; publish current announcements
- ฟอร์ม & งาน → **สิ่งที่ต้องกรอก**, auto-filled from announcements (admin only checks/edits/adds misses)
- Finance: remove "waived", one place to remind unpaid (via approval), slip verification (AI reads slip → finance confirms)
- Academic: upload assignment sheet + recall doc → AI ticks who recalled, shared question missing → all assignees red zone; simple wizard UI
- Role links: finance / academic get a private link that opens only their page (+ password)
- Control center: visual, Apple-like, less text; merge ประกาศบนแอป + บรอดแคสต์; clearer inbox; calendar for daily; AI budget meter
- Member app: announcements first on home, compact countdown, more visual, merge ประกาศ tab into home, ของฉัน = private details
- Rich menu: 6 distinct colours, big icons, LinkTree วิชาการ (https://linktr.ee/BM33AcademicLinks); profile icon for OA/OpenChat

## A. AI cost
- [x] Corpus + BM25 (char-trigram Thai) retrieval over all knowledge tabs + chat imports (`lib/ai/corpus.ts`)
- [x] Compact live "core" block (`lib/ai/core.ts`); directory only via retrieval for verified askers
- [x] Deterministic answers (`lib/ai/intents.ts`: greet/thanks, classes today/tomorrow, next exam, my fees, my red zone) = 0 tokens
- [x] Answer cache for non-personal questions (6 h)
- [x] Escalation pass only when the model returns `search_terms`
- [x] Usage metering (`BC_usage`), budget/price/cap from config, lean (≥80%) / off (≥100%) modes
- [x] Group: never replies; image captions only from committee, burst-limited, normal mode only
- [ ] **Verify on production** `/admin/ai` → ลองถามบอท (route badge + cost) after deploy (no Gemini key locally)
## B. Knowledge import
- [x] Both exports → `KB_แชตรุ่น` (2025-03-29 → 2026-09-27) · upload more from `/admin/ai` (gzip upload route)
- [x] 12 current announcements published (seed script) · committee year 2 + ไบร์ท (วิชาการ) + แบง (การเงิน)
## C. สิ่งที่ต้องกรอก
- [x] Auto-created from announcements with form links (`syncFormFromAnnouncement`) · page with rings + per-person dots + "เตือนคนที่ยังไม่กรอก" (→ outbox) · home section in app with tap-to-claim
## D. Finance
- [x] Waived removed from UI · `finance.remindUnpaid` per-person outbox · slip upload in app (`/api/app/slip`) + slip image in DM → AI verdict → finance ✓/✕ queue
- [x] Optional auto-approve (`slip_auto_approve`) for slips that pass every check — default OFF
- [ ] **User:** fill ชื่อบัญชีผู้รับ + เลขบัญชี on `/admin/finance` (AI needs them to verify receiver) and set real fee months
## E. Academic
- [x] Recall wizard: assignment (file/link/modulo/keep) + recall docs → `/admin/api/recall` (AI, rule fallback) → question strip + 100-dot proof grid → `academic.saveCheck`
- [x] Academic messages now go to the outbox (approval) instead of direct push (also the scheduled doc reminder)
## F. Access
- [x] Magic links `/admin/k/<role>.<sig>` (Settings → ลิงก์เข้าตรง, copy button; HMAC uses prod secret so copy them from production) · academic password in `academic-password.secret.local`
## G. Control center redesign
- [x] iOS-style kit (`app/admin/ui/kit.tsx`, `admin.css`) · วันนี้ · รออนุมัติ · ประกาศ (merged with LINE send) · ปฏิทิน & สรุปวันนี้ (month calendar) · สิ่งที่ต้องกรอก · ตาราง · การเงิน · วิชาการ · สมาชิก · AI & งบ (graphs) · ตั้งค่า
## H. Member app redesign
- [x] 4 tabs (หน้าหลัก · ตาราง · เซียมซี · ของฉัน) · home = announcements-first feed (hero + list, category colours), compact countdown pill, สิ่งที่ต้องกรอก, today · ของฉัน = private profile (3 rings, fees + slip upload, red zone, draws, contacts) · old `?tab=news` links → home
## I. Rich menu v3 + profile icon
- [x] `public/rich-menu-v3.jpg` + `rich-menu/rich-menu.v3.json` (6 colours + LinkTree + ถาม AI strip) · Settings → เมนู LINE → สร้าง → ลองกับบัญชีฉัน
- [ ] **User:** press "เปิดใช้กับทุกคน" after trying it · upload `rich-menu/bm33-profile-icon.png` as the OA / OpenChat profile picture (LINE OA Manager → Settings → Profile)
## J. Verify / ship
- [x] typecheck · build · local screenshots (admin + app via fixture) · `scripts/test-flows.ts` 22/22
- [ ] Deploy (push main) → test AI + recall + slip on production

---

# (archive) BM33 v2 — TODO

Branch: `portal-v2` (merge to `main` only after typecheck + build + local verification).
Legend: `[x]` done & verified · `[~]` in progress · `[ ]` not started

## 0. Decisions (from 2026-09-27 interview)
- LIFF ID `2011755768-aSlCqo7l` (LINE Login channel "BM33 Member", app "BM33 Member Portal"), endpoint `https://bm-33-official-ai.vercel.app/app`
- Countdown = university exams only · Red zone = cumulative (private) · Gacha: everyone sees anonymous draw window, only pool members get a private result
- Official announcements = whole committee · Fees vary by month; finance-only role · Schedule from uploaded files (AI parses, admin reviews)
- Fortune: unlimited pulls + collection + streaks, 200 Thai fortunes · AI: full-sheet context, reliability first; unanswerable → president contact bubble
- Outbound deadline reminders → กล่องรอตรวจ + DM owner → owner types `approve`

## 1. Data layer / reliability
- [x] Sheets client: retry + exponential backoff on 429/5xx (`lib/google-sheets.ts`)
- [x] Batched `ensureTabs` (1 meta + 1 batchGet + 1 write instead of 2 reads per tab)
- [x] Two-level cache (`lib/cache.ts`: Next Data Cache shared across instances + memory) with `bust(tag)`
- [x] BC snapshot loader (all BC tabs in ONE batchGet, cached) + fresh reads for mutations
- [x] Migrate existing modules (members, roster, exams, forms, status, broadcasts, summaries) to snapshot reads → fixes วิชาการ rate-limit error page
- [x] Roster parser fix (content-based column detection; verified on real data: 100/100)
- [x] BC_config key/value store (model, role passwords, approver ids, payment info…)

## 2. New domain modules
- [x] committee (seeded, 10/10 matched) · announcements · daily summary · schedule + uni exams + uploads
- [x] fees (months + payments + yearly package) · red zone cumulative score/levels · draws (red-zone gacha)
- [x] outbox (approval queue) + LINE `approve` command for owner · fortune progress sync

## 3. AI chat (LINE)
- [x] Full knowledge pack (all public tabs, deduped/compacted: 740K→279K chars ≈105K tokens) + live app data + asker's private block
- [x] Structured JSON output (no stray code/markdown), sanitize, retry, MAX_TOKENS handling
- [x] Always president contact bubble when unanswerable/partial
- [x] Model resolver (config → models.list fallback), loading animation, push fallback when reply token expires
- [x] Group logging awaited (was fire-and-forget → lost on Vercel), announcement capture from committee + `ประกาศ` forward in DM
- [x] Admin AI test console (control center) — needed because GEMINI_API_KEY is not in local .env.local

## 4. Member portal `/app` (LIFF)
- [x] LIFF auth: ID token verified server-side → signed session; confirm-it's-you; fallback onboarding (name + last 3)
- [x] State API (cached, per-user private slice only) + polling for "real-time"
- [x] UI: fluid WebGL blue background, liquid-glass iOS shell, tab bar, sheets
- [x] Home · News (announcements + forms/deadlines) · Schedule (month + day + exams countdown) · Me (fees, forms, red-zone meter) · Fortune
- [x] Red-zone draw overlay (anonymous for all, private result for pool)
- [x] Fortune gacha: 200 Thai fortunes, 6 tiers, multi-layer golden wheel, collection book, streak, pity
- [x] Admin "preview as student" mode

## 5. Control center v2
- [x] New grouped navigation (clear labels + one-line purpose per page), mobile friendly
- [x] Home "to do today" · Inbox (outbox approvals + claims + identity) · Announcements & daily summary editor
- [x] Schedule & exams (upload → AI parse → review → publish) · Finance (finance-only role) · Academic + draws
- [x] Settings (committee, role passwords, model, payment info) · AI & knowledge (learning + test console)

## 6. Automation
- [x] Cron: daily summary (05:30 BKK), deadline reminders → outbox (+ DM owner), draw notifications, form deadlines
- [x] Rich menu image (6 buttons) created on LINE (`richmenu-aff5a35ca96c3c1d979451dad357119e`), linked to owner only · Settings → เมนู LINE → “เปิดใช้กับทุกคน”

## 7. Verify & ship
- [x] typecheck + build clean
- [x] Local dev run + headless Chrome screenshots of /app (phone + iPad) and /admin (all tabs, sheet, spin, reveal, draw overlay)
- [x] Deployed to production (main). Smoke tests: all admin pages 200, AI console (gemini-3.8-flash, 3–7 s, ~95% prompt cache), injection refused, contact card on unknown, app auth rejects bogus tokens, finance role isolated, broadcast cron 200
- [x] ARCHITECTURE.md, README, CLAUDE.md, memory + wiki log
- [x] `scripts/test-flows.ts` — 22/22 write-path checks pass against the real sheet
- [x] Re-enabled GitHub cron workflows (were `disabled_inactivity` since 22 Sep — no cron had run for 5 days)

## NEEDS USER ACTION (things I was not allowed to / could not do)
1. **Try the new LINE menu** — it is linked to *your* account only. Open the BM33 chat → tap หน้าหลัก → confirm “นี่คือคุณใช่ไหม?”. When happy: `/admin/settings` → เมนู LINE → **เปิดใช้กับทุกคน** (this changes what all 100 classmates see, so I left it to you).
2. **LIFF channel check** (LINE Developers → BM33 Member): must be **Published**; ideally in the **same provider** as the BM33 OA (then app login and bot share the same user id). Also turn on **shareTargetPicker** in the LIFF app settings (fortune “ส่งให้เพื่อน” button).
3. **Finance password** is in `finance-password.secret.local` (git-ignored) → give it to เค้ก. Academic password: set/generate in Settings if the academic team needs a new one.
4. **Is the bot in the main class chat?** Only 1 group message was logged since 23 Jul. If the class uses an **OpenChat**, bots cannot join it — then committee should DM the bot `ประกาศ <ข้อความ>` or paste into `/admin/announcements` (both go straight to the app).
5. **Fill the app with real data**: upload the current block timetable + exam dates (`/admin/schedule`), set fee months + payment info (finance), add current forms with deadlines (`/admin/forms`).
6. **LINE plan**: buy the 15,000-message plan when ready; overview shows the quota meter.
7. (optional) delete my two harmless test rows: `BC_payments` and `BC_fortunes` rows with student_id `0000000999`.
8. Keep at least one commit every 60 days, or GitHub disables the cron workflows again (Settings → Actions → enable).

## Ideas / next steps (not started)
- Weekly “streak leaderboard” for the fortune (opt-in, anonymous by default)
- Push-free “what's new since you last opened” badge per announcement (read receipts stored per member)
- Attach images/posters to announcements (Drive link → thumbnail)
- Per-member reminders in LINE for fees due (needs approval flow per recipient list — already supported via `ids:` audience)
