# BM33 v3 — Architecture

One Next.js 14 app on Vercel, three surfaces, one data store (Google Sheets):

```
            ┌──────────────── LINE ────────────────┐
 classmates │ rich menu v3 (6 tiles + ถาม AI) ─► LIFF /app │  member app (liquid-glass UI)
            │ chat with BM33 OA ─────► /api/line-webhook  (AI answers, slips, onboarding, approve cmd)
            │ LINE groups ───────────► webhook logs only (bot NEVER replies in groups)
            └───────────────────────────────────────┘
 committee  ─► /admin  control center (roles: admin · academic · finance)
 GitHub cron ─► /api/broadcast-cron (every 15 min) · /api/summary-cron (05:35 + 08:00) · /api/learn (2h)
                         │
                         ▼
            Google Sheet 1VfzrhGR… (service account, Editor)
            ├─ knowledge tabs (AI_บริบทล่าสุด, ดัชนี, 01, 02, 03, 07 buffer)
            └─ BC_* tabs (app + control-center data; auto-created)
```

## Data layer (why the วิชาการ page no longer errors)
- `lib/google-sheets.ts` — every call wrapped in `withRetry` (exponential backoff on 429/5xx). `ensureTabs` batches header checks into 1 read + 1 write.
- `lib/cache.ts` — `cached(key, tags, ttl, fn)`: Next.js Data Cache (shared by all Vercel instances) + per-instance memo; `bust(tag)` after writes. Falls back to memory in scripts.
- `lib/bc/sheets.ts` — `snapshot()` reads **all BC tabs in ONE batchGet** (cached 20 s, tag `bc`). Every page/API reads the snapshot; mutations use `fresh()` (uncached) then `bust("bc")`. Sheets reads went from ~10+ per page view to ~3 per minute total.
- `BC_chatlog` and `BC_send_log` are excluded from the snapshot (they grow).

### BC tabs
| tab | purpose |
|---|---|
| BC_roster | class list (hand-filled; columns detected by content — `lib/bc/roster.ts`) |
| BC_members | LINE ↔ student link (`line_user_id` bot, `liff_user_id` app, `portal_confirmed_at`) |
| BC_config | key/value settings (model, role password hashes, approvers, payment info, notice, red-zone size, reminder plan, rich menu id) |
| BC_committee | committee list → official announcements + contact cards |
| BC_announcements | app announcements (source group/forward/manual, deadline, links JSON, reminders JSON) |
| BC_daily | daily summary cards (items JSON with ISO `at` → live countdowns) |
| BC_schedule / BC_uni_exams / BC_uploads | timetable rows, university exams (countdown), upload log |
| BC_fee_months / BC_payments | monthly fee amounts; per student×month payment (monthly/yearly/waived) |
| BC_exams | class memorization quizzes (red zone source) |
| BC_draws | red-zone gacha (pool, secret selection, show/reveal times) |
| BC_outbox | outbound LINE messages awaiting approval |
| BC_fortunes | fortune collection per student (bitset) |
| BC_forms / BC_status | tracked forms (+deadline/link) and done/claimed overlay |
| BC_broadcasts / BC_send_log / BC_summaries | legacy broadcast composer + old weekly summaries |
| BC_chatlog | every bot Q&A; `model` column = `route:model` (rule / cache / ai / ai+search / budget / cap) |
| BC_usage | every Gemini call: feature, tokens, USD (budget meter; excluded from snapshot) |
| BC_slips | fee slips (AI verdict ok/check/bad, thumbnail, status pending/approved/rejected; excluded from snapshot) |
| KB_แชตรุ่น | imported LINE chat exports (date, time, source, sender, text) — retrieval source |

`BC_forms` gained `source` (auto = created from an announcement) + `announcement_id`; `BC_exams` gained `assign_json`, `recalled`, `check_at`, `question_count2` (SCHEMA_VERSION v3.0).

## AI (`lib/ai/*`) — budget design ($10/month for ~100 users)
Pipeline in `answer.ts` for every question:
1. `intents.ts` — rule answers (greeting, thanks, classes today/tomorrow, next exam, my fees, my red zone) → **0 tokens**.
2. Budget guard (`usage.ts`): spend this month vs `ai_budget_usd` (default 10) → normal / lean (≥80%: smaller evidence) / off (≥100%: rules + cache only). Per-user cap `ai_user_daily_cap` (default 30).
3. Answer cache (6 h) for non-personal questions.
4. Retrieval (`corpus.ts`): all knowledge tabs + `KB_แชตรุ่น` + recent 07 buffer → chunks (chat grouped into ≤30-min windows) → BM25 over Thai char-trigrams + synonyms + freshness boost → `pick()` up to 9 000 chars (lean 5 000). Index memoised 15 min per instance.
5. One Gemini call (thinking LOW) with `core.ts` (live announcements, open forms, 7-day schedule, exams, fees, committee, linktree) + evidence + asker's private block. JSON schema `{kind, reply, links, topic, personal, search_terms}`.
6. If the model returns `search_terms` → one wider search (16 000 chars) and a second call. Links must exist in the corpus. `cannot_answer`/`partial` → president-first contact card.
Every Gemini call (answer, digest, image, announce, daily, slip, academic, timetable) is metered into `BC_usage` with price `ai_price_json`. `/admin/ai` shows ring, daily bars, per-feature breakdown, route badges.

## Member app (`app/app/**`, `lib/app/**`)
- Auth: LIFF ID `2011755768-aSlCqo7l` → `liff.getIDToken()` → server verifies with `oauth2/v2.1/verify` (client_id = LIFF channel) → HMAC session token (Bearer + cookie, 45 days). First time: "นี่คือคุณใช่ไหม?" (from bot link) or name + last-3 digits → roster match → confirm. Duplicate claims → mismatch row for admin.
- `GET /api/app/state` = `publicBoard()` (cached 15 s, shared) + `personalState(sid)` (only that student). Client polls every 15 s + on focus → "real-time".
- Admin preview: `/app?preview=<studentId>` with admin cookie (read-only).
- Dev-only fixtures: `APP_FIXTURE=1 npm run dev` (never in production).
- Tabs: **หน้าหลัก** (announcements-first feed: hero + colour-coded list, compact exam pill, สิ่งที่ต้องกรอก with tap-to-claim, today) · ตาราง · เซียมซี · **ของฉัน** (private: rings, fees + slip upload `POST /api/app/slip`, red zone, draws, contacts). Deep links `?tab=home|schedule|fortune|me`, old `news/todo` → home, `?a=<annId>` opens the sheet.
- UI: `FluidBackground` (WebGL domain-warped shader, 0.34× resolution, 30 fps, pauses when hidden), glass primitives in `portal.css`, `Chrome.tsx` (tab bar, drag-to-dismiss sheets, portals), screens Home/Schedule/Me (+ `News.tsx` = announcement detail sheet), `fortune/*` (canvas wheel, particles, WebAudio, 200 cards in `lib/fortunes/data.ts`), `Overlays.tsx` (red-zone draw, onboarding).

## Automation (`lib/bc/cron.ts`, `reminders.ts`, `daily.ts`)
Every broadcast-cron tick: scheduled broadcasts → doc reminders → `runAppAutomation`:
1. daily summary (≥05:30 BKK, once/day; admin edits are never overwritten),
2. deadline reminders (plan `3,1,0` days, 08:00–21:00) for live announcements, forms (undone only) and university exams → `BC_outbox` + approval card DM to approvers,
3. draw results → two outbox items (selected / not selected).
Nothing reaches classmates until someone approves (LINE `approve 123` / `approve all` / buttons, or the inbox page).

## Roles
`lib/bc/auth.ts` — cookie `<role>.<hmac(role|passwordHash)>`. admin = env `ADMIN_PANEL_PASSWORD`; academic/finance = hash in BC_config (Settings page) or env. `roleCan()` restricts action prefixes (academic: `academic.*`, `draw.*`; finance: `finance.*`).
Magic links: `/admin/k/<role>.<hmac(link|role|credHash)[:32]>` sets the cookie for 60 days (Settings → ลิงก์เข้าตรง). Changing the password kills old links.

## Reminders (v5 — เตือนรวม)
`lib/bc/digest.ts`. One open batch = `BC_outbox` row kind `digest`, audience `batch`, messages = `{keys:[form:<id>|ann:<id>|exam:<id>]}`. `runReminderCron` → `runDailyBatch`: every tick merges old per-item pending reminders (status `merged`); once a day ≥08:00 (config `digest_auto_day`) adds items inside the `reminder_plan` window and pushes ONE `batchFlex` to approvers. Manual "เตือน" buttons (`form.remind`, `announce.remind`, new announcement + ส่ง LINE) → `addToBatch` (no push). Approval (LINE button / `approve 123` / `approve 123 1 3` / inbox BatchCard with `keys`) → `approveAndSend` → `compileBatch` at send time → each member ONE flex carousel with only their undone items. Deleted per-item functions `queueAnnouncementReminder/queueFormReminder`.

## Visibility (v5)
`lib/bc/forms.ts` `formEndedAt/formVisible/announcementVisible`: closed (`closed_at`) or past-deadline forms/announcements stay 1 day, then leave the app board and personal state.

## Red Zone (v5)
`ranking()` score = recency-weighted missed exams + overdue fee months × `red_zone_fee_weight` (off with `red_zone_fees=0`). `RankRow.feeMisses/feeMonths`. Finance page card `RedZoneFees`.

## Reminders (v4)
`runReminderCron` → `queueDailyDigest` once per day (≥08:00, ref `digest:YYYY-MM-DD`): items due within the `reminder_plan` window (forms, announcements without forms, uni exams ≤3 d); each verified member gets ONE text + link carousel with only their undone items (claimed counts as done). Outbox payloads >40K chars are gzip+base64 (`packMessages`/`unpackMessages`). Manual per-item buttons still exist (form/announcement remind). Forms with `trust_claims=1`: app "กรอกแล้ว" = confirmed immediately.

## Fortune (v4)
Client-side roll (`lib/fortunes/data.ts`: tiers a–f = Bronze…JACKPOT, `luckyHour(day)` ×2 for Platinum+, streak +5%/day ≤35%, pity 30 → Platinum+). `Cutscene.tsx` plays the unskippable reveal; `WheelArt.ts` pre-renders the dragon wheel layers. Jackpot → `jackpot_at` synced immediately → `fortuneBoard()` in the public board (hall of fame names today + Jackpot Pool = total pulls − `fortune_pool_base`).

## Finance slips (`lib/bc/slips.ts`)
Image in DM or app → Gemini vision reads amount/date/receiver/ref → verdict: amount vs owed month(s), receiver vs `payment_account_name/no`, duplicate `bank_ref`, date sanity → `BC_slips` (pending). Finance approves in `/admin/finance` (→ `applyPayments`). `slip_auto_approve=1` auto-approves "ok" slips (default off).

## Academic recall check (`lib/bc/recall.ts`, `/admin/api/recall`)
Assignment (sheet/doc/image via `lib/docs.ts`, or modulo, or previous) → AI map student→questions; recall doc(s) → AI list of filled questions (running numbering across sections; rule fallback) → per student missing = assigned − filled (a shared empty question marks **every** assignee) → proof grid → `academic.saveCheck` → `not_memorized_ids` → red zone. Academic messages are queued in the outbox (per-recipient), never pushed directly.

## Scripts
- `npx tsx scripts/test-flows.ts` — write-path integration test against the real sheet (TEST rows, cleaned up)
- `npx tsx scripts/test-retrieval.ts`, `inspect-sheets.ts`, `run-digest.ts` — legacy tools
- `scripts/rich-menu.ts` — needs LINE token locally (not in .env.local); use Settings → เมนู LINE instead
- `rich-menu/menu-v3.html` → `public/rich-menu-v3.jpg` (headless Chrome, 2500×1686) · `rich-menu/profile-icon.html` → `bm33-profile-icon.png` (640×640)
- `scripts/import-line-chat.ts <file> <source>` — import a LINE export into `KB_แชตรุ่น` (same as the upload on `/admin/ai`)
- `scripts/set-role-password.ts` — set academic/finance password hash
