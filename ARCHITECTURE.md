# BM33 v2 — Architecture

One Next.js 14 app on Vercel, three surfaces, one data store (Google Sheets):

```
            ┌──────────────── LINE ────────────────┐
 classmates │ rich menu (6 buttons) ─► LIFF /app    │  member app (liquid-glass PWA-like UI)
            │ chat with BM33 OA ─────► /api/line-webhook  (AI answers, onboarding, approve cmd)
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
| BC_chatlog | every bot Q&A (admin review in AI page) |

## AI (`lib/ai/*`)
- `knowledge.ts` builds the **archive pack**: all rows of AI_บริบทล่าสุด, ดัชนี, 01, 02, 03 — deduplicated by message id/text, noisy columns dropped (≈280K chars ≈ 105K tokens), cached 10 min (tag `knowledge`). `livePack` adds announcements, forms, schedule, exams, fee months, daily summary, committee, roster directory (verified askers only).
- `personal.ts` — asker's own fees/forms/red-zone/draws; `adminBlock` class overview for admins (DM only).
- `answer.ts` — one Gemini call with a JSON schema `{kind, reply, links, topic}`; archive pack is the first content part (Gemini implicit cache hits ~95% of prompt tokens → cheap). Reply sanitized (no markdown/URLs/JSON), links must exist in the data. `cannot_answer`/`partial` → contact card with **president first** (`contactFlex`).
- `lib/gemini.ts` — `modelChain()`: BC_config.gemini_model → env (non-lite) → newest flash from `models.list` (currently **gemini-3.8-flash**) → fallbacks; retries transient errors, skips unusable models.
- Webhook shows the LINE loading animation, and if the reply token expires falls back to push.

## Member app (`app/app/**`, `lib/app/**`)
- Auth: LIFF ID `2011755768-aSlCqo7l` → `liff.getIDToken()` → server verifies with `oauth2/v2.1/verify` (client_id = LIFF channel) → HMAC session token (Bearer + cookie, 45 days). First time: "นี่คือคุณใช่ไหม?" (from bot link) or name + last-3 digits → roster match → confirm. Duplicate claims → mismatch row for admin.
- `GET /api/app/state` = `publicBoard()` (cached 15 s, shared) + `personalState(sid)` (only that student). Client polls every 15 s + on focus → "real-time".
- Admin preview: `/app?preview=<studentId>` with admin cookie (read-only).
- Dev-only fixtures: `APP_FIXTURE=1 npm run dev` (never in production).
- UI: `FluidBackground` (WebGL domain-warped shader, 0.34× resolution, 30 fps, pauses when hidden), glass primitives in `portal.css`, `Chrome.tsx` (tab bar, drag-to-dismiss sheets, portals), screens Home/News/Schedule/Me, `fortune/*` (canvas wheel, particles, WebAudio, 200 cards in `lib/fortunes/data.ts`), `Overlays.tsx` (red-zone draw, onboarding).

## Automation (`lib/bc/cron.ts`, `reminders.ts`, `daily.ts`)
Every broadcast-cron tick: scheduled broadcasts → doc reminders → `runAppAutomation`:
1. daily summary (≥05:30 BKK, once/day; admin edits are never overwritten),
2. deadline reminders (plan `3,1,0` days, 08:00–21:00) for live announcements, forms (undone only) and university exams → `BC_outbox` + approval card DM to approvers,
3. draw results → two outbox items (selected / not selected).
Nothing reaches classmates until someone approves (LINE `approve 123` / `approve all` / buttons, or the inbox page).

## Roles
`lib/bc/auth.ts` — cookie `<role>.<hmac(role|passwordHash)>`. admin = env `ADMIN_PANEL_PASSWORD`; academic/finance = hash in BC_config (Settings page) or env. `roleCan()` restricts action prefixes (academic: `academic.*`, `draw.*`; finance: `finance.*`).

## Scripts
- `npx tsx scripts/test-flows.ts` — write-path integration test against the real sheet (TEST rows, cleaned up)
- `npx tsx scripts/test-retrieval.ts`, `inspect-sheets.ts`, `run-digest.ts` — legacy tools
- `scripts/rich-menu.ts` — needs LINE token locally (not in .env.local); use Settings → เมนู LINE instead
- `rich-menu/menu.html` → `rich-menu.jpg` (rendered with headless Chrome)
