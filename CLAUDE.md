# CLAUDE.md — BM33.official LINE Bot + Member App + Control Center

Claude Code อ่านไฟล์นี้ทุกครั้งที่เริ่ม session ในโปรเจกต์นี้ · สถาปัตยกรรมเต็มอยู่ใน `ARCHITECTURE.md` · งานค้างอยู่ใน `TODO.md`

## Project Overview
ระบบกลางของรุ่น **BM33** คณะแพทยศาสตร์วชิรพยาบาล (นักศึกษาแพทย์ปี 2, ~100 คน)
1. **บอท LINE** (`/api/line-webhook`) — AI ค้นเฉพาะข้อมูลที่เกี่ยวข้อง (งบ $10/เดือน) ตอบไม่ได้ → การ์ดติดต่อประธานรุ่น · **ในกลุ่มเงียบเสมอ** (เก็บข้อมูลอย่างเดียว)
2. **แอปสมาชิก** (`/app`, LIFF `2011755768-aSlCqo7l`) — ประกาศ ตารางเรียน สอบ เงินรุ่น งานค้าง red zone เซียมซี
3. **Control Center** (`/admin`) — แอดมิน / ฝ่ายวิชาการ / ฝ่ายการเงิน (รหัสผ่านแยกบทบาท)

## Tech Stack
- **Next.js 14** App Router + TypeScript · **Vercel** (Hobby, npm) · deploy = push `main`
- **@line/bot-sdk** v11 · **@google/genai** v2 (โมเดลเลือกอัตโนมัติ = gemini-3.8-flash) · **Google Sheets API** (service account)
- Cron: GitHub Actions (`broadcast.yml` ทุก 15 นาที, `summary.yml`, `digest.yml`) — ถ้า repo ไม่มี commit 60 วัน GitHub จะปิด cron เอง ต้องกด enable

## Repo map
- `lib/google-sheets.ts` (retry/backoff) · `lib/cache.ts` (Data Cache + bust) · `lib/bc/sheets.ts` (snapshot 1 batchGet)
- `lib/bc/*` — โดเมน: members, roster, config, committee, announcements, daily, schedule, fees, draws, outbox, reminders, fortune, academic, forms/status, broadcast, cron, auth
- `lib/ai/*` — knowledge pack, personal/admin blocks, answer pipeline · `lib/gemini.ts` — model chain + JSON
- `lib/app/*` — LIFF session, identity, state, fixture(dev) · `app/app/**` — UI แอปสมาชิก
- `app/admin/**` — control center · `app/admin/api/action` — mutation ทั้งหมด (ตรวจ role)

## Rules (อย่าแก้มั่ว)
- ❌ ห้ามส่ง LINE ถึงสมาชิกโดยไม่ผ่านการอนุมัติ — ทุกข้อความอัตโนมัติไป `BC_outbox` ก่อน
- ❌ ห้ามส่งข้อมูลส่วนตัวของคนอื่น (เงิน/งาน/red zone/ผลสุ่ม) ให้ client หรือ AI — กรองด้วยโค้ดเท่านั้น
- ❌ ห้ามอ่านชีตตรงในหน้า/API — ใช้ `snapshot()`/`readKey()`; ก่อนเขียนใช้ `fresh()` แล้วระบบ `bust("bc")` ให้
- ❌ ห้ามลบแถวใน BC_* (เลขแถวเลื่อน) — ใช้ status `deleted/hidden` (ยกเว้น BC_exams ที่ลบด้วยการอ่านสด)
- ❌ คอลัมน์ใหม่ต่อท้ายเสมอ + เพิ่ม `SCHEMA_VERSION` ใน `lib/bc/sheets.ts`
- ❌ อย่าใช้ markdown ในข้อความ LINE · buttons label ≤ 20 · ≤ 5 messages/reply
- ❌ อย่า return 4xx/5xx จาก webhook หลังผ่าน signature (401 เฉพาะ signature ผิด)
- ❌ อย่า commit `.env*` หรือ `*.secret.local`
- AI ต้องตอบเป็น JSON schema เสมอ (`lib/ai/answer.ts`) — ห้ามกลับไปใช้ข้อความอิสระ + ROUTE: แบบเดิม
- ❌ ห้ามส่งทั้งชีตเข้า prompt อีก — ใช้ retrieval (`lib/ai/corpus.ts`) · ทุกการเรียก Gemini ต้องใส่ `feature` เพื่อให้นับงบใน `BC_usage`
- ❌ บอทห้ามตอบ/ส่งอะไรในกลุ่ม LINE (แม้ถูกแท็ก) — webhook `if (isGroup) return` หลังบันทึก

## Local dev / verify ก่อน push
```bash
npm run typecheck && npm run build
APP_FIXTURE=1 npm run dev          # แอปพร้อมข้อมูลตัวอย่าง: /app?preview=6801101071 (ต้องล็อกอิน /admin ก่อน)
npx tsx scripts/test-flows.ts      # ทดสอบเส้นทางเขียนกับชีตจริง (ข้อมูล TEST)
```
`.env.local` ไม่มี GEMINI_API_KEY / LINE token (อยู่บน Vercel เท่านั้น) → ทดสอบ AI ผ่าน `/admin/ai` บน production
Push: `git -c credential.https://github.com.helper= -c credential.helper= -c credential.helper=osxkeychain push https://BM33Official@github.com/BM33Official/BM33-official-ai.git main`
