# BM33 v2 — TODO (source of truth)

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
