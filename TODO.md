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
- [ ] Rich menu image (6 buttons) + upload script; link to owner only for testing

## 7. Verify & ship
- [x] typecheck + build clean
- [ ] Local dev run + headless Chrome screenshots of /app (phone + iPad) and /admin
- [ ] Deploy (preview → main), prod smoke tests (AI console, state API)
- [ ] ARCHITECTURE.md, README, CLAUDE.md, memory + wiki log

## NEEDS USER ACTION
- (none yet)
