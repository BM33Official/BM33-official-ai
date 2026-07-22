# BM33.official 🤖

LINE bot กลางของรุ่น **BM33** คณะแพทยศาสตร์วชิรพยาบาล — รับข้อความ → **ค้นข้อมูลอัจฉริยะจากหลายแท็บใน Google Sheet** → ให้ Gemini ตอบภาษาธรรมชาติ → ถ้าไม่มีคำตอบ route ไปคนดูแลตามหมวด และ **เรียนรู้จากแชตกลุ่มเองวันละ 3 รอบ**

## Stack

- **Next.js 14** (App Router + TypeScript) บน **Vercel**
- Webhook: `POST /api/line-webhook` · Digest: `GET/POST /api/learn`
- `@line/bot-sdk` v11 · `@google/genai` v2 (โมเดลจาก env `GEMINI_MODEL`, ดีฟอลต์ `gemini-3.5-flash-lite`)
- อ่านชีตผ่าน **Google Sheets API (service account)** ไม่ใช่ CSV สาธารณะ

## สถาปัตยกรรมการค้นข้อมูล (hybrid retrieval)

```
คำถาม
 ├─ ค้น current ก่อน → ถ้าเจอชัด ตอบเลย (fast path, Gemini 1 ครั้ง)
 ├─ ไม่เจอ → keyword router เลือกแท็บ (ไม่ใช้ LLM)
 │           └─ ไม่ชัดจริง → Gemini router (เปิด/ปิดด้วย USE_GEMINI_ROUTER)
 ├─ ตัดสิทธิ์ด้วยโค้ด (ไม่ให้ Gemini ตัดสิน) → batchGet เฉพาะแท็บที่เลือก
 ├─ ให้คะแนนแถวแบบ character n-gram (รองรับไทยไม่มีช่องว่าง) → เอา ≤12 แถว
 └─ Gemini ตอบจากแถวที่ match เท่านั้น (ไม่เคยส่งทั้งชีต)
```

**กฎเหล็ก:** AI เลือกว่า “ข้อมูลไหนน่าเกี่ยว” · **โค้ด** ตัดสินว่า “ผู้ใช้มีสิทธิ์เห็นอะไร” · Sheets API ดึงเฉพาะที่จำเป็น · AI ตอบจากหลักฐานเท่านั้น

## ลำดับชั้นแหล่งข้อมูล + สิทธิ์ ([lib/sources.ts](lib/sources.ts))

| source id | แท็บ | สิทธิ์ |
|---|---|---|
| `current` | AI_บริบทล่าสุด_ใช้แท็บนี้ | ทุกคน — ค้นก่อนเสมอ มีสิทธิ์เหนือ archive |
| `historyIndex` | AI_ดัชนีประวัติย่อ_ตั้งแต่วันแรก | ทุกคน — แผนที่ประวัติ |
| `knowledgeArchive` | 01_ฐานความรู้_AI | ทุกคน — ความรู้ย้อนหลัง (ปลายทางของ digest) |
| `announcementArchive` | 02_ประกาศ_สำคัญ | ทุกคน — ประกาศ/เดดไลน์เก่า |
| `linkArchive` | 03_ลิงก์_ทรัพยากร | ทุกคน — ฟอร์ม/ลิงก์ |
| `members` | 04_สมาชิก_จากแชต | **เฉพาะเจ้าของ LINE user ID** (คอลัมน์ C) หรือแอดมิน |
| `finance` | 05_ธุรกรรม_การเงิน | **เฉพาะเจ้าของ LINE user ID** (คอลัมน์ C) หรือแอดมิน |
| `announcementQueue` | 06_คิวประกาศ_LINE | **แอดมินเท่านั้น** |
| `rawMessages` | 07_ข้อความทั้งหมด | **แอดมินเท่านั้น** + เป็น buffer ของ digest |

- แท็บ `finance`/`members` ถูกกรองแถวด้วย **LINE user ID จริงจาก webhook** ในโค้ดก่อนถึง Gemini เสมอ ไม่มีการส่งทั้งแท็บ
- บัญชี LINE ที่ยังไม่ผูกกับสมาชิก → ตอบว่า “ยังไม่ได้เชื่อมบัญชี” (ไม่เดาจากชื่อ)

## การเรียนรู้เอง (self-updating knowledge base)

- ทุกข้อความ/รูปในกลุ่ม (ที่ตั้งใน `LEARN_GROUP_IDS`) ถูกบันทึกลง **07_ข้อความทั้งหมด** ตอนรับ webhook (ข้อความ = ไม่เรียก Gemini; รูป = สรุปด้วย Gemini vision 1 ครั้ง)
- Job `/api/learn` รัน **3 รอบ/วัน** (13:30 / 20:00 / 03:00 เวลาไทย ผ่าน GitHub Actions) → อ่านข้อความใหม่ → กลั่นเป็น “รายการความรู้” → เขียนลง **01_ฐานความรู้_AI** (สถานะ `อัตโนมัติจากแชต—รอตรวจ`) → mark แถวเป็น processed
- ในกลุ่ม บอทจะ **ตอบเฉพาะเมื่อถูก @mention หรือขึ้นต้น `/ถาม`** (นอกนั้นแค่เก็บเงียบ ๆ)

## Environment variables

ตั้งใน Vercel (Production + Preview + Development) — ดู [.env.example](.env.example)

| ตัวแปร | หมายเหตุ |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET` | LINE Developers Console |
| `GEMINI_API_KEY` | Google AI Studio |
| `GEMINI_MODEL` | ดีฟอลต์ `gemini-3.5-flash-lite` |
| `USE_GEMINI_ROUTER` | `1` เปิด / `0` ปิด (ประหยัด request) |
| `GOOGLE_SHEET_ID` | ID ของสเปรดชีต |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` จาก JSON |
| `GOOGLE_PRIVATE_KEY` | `private_key` จาก JSON (บรรทัดเดียว ครอบด้วย `"` ใช้ `\n`) |
| `ADMIN_LINE_USER_IDS` | LINE user ID แอดมิน คั่นด้วย `,` |
| `LEARN_GROUP_IDS` | groupId ที่ให้เรียนรู้ (ว่าง = ทุกกลุ่ม) |
| `LEARN_IMAGES` | `1` อ่านรูปด้วย / `0` ปิด |
| `LEARN_CRON_SECRET` | secret ป้องกัน `/api/learn` (ตั้งใน Vercel + GitHub Secret) |

> ต้องแชร์สเปรดชีตให้ `GOOGLE_SERVICE_ACCOUNT_EMAIL` เป็น **Editor** (อ่านอย่างเดียวใช้ Viewer แต่การ log/digest ต้องเขียน)

## คำสั่งทดสอบในเครื่อง

```bash
npm run inspect:sheets                              # เช็คว่า service account อ่านชีตได้ + resolve ชื่อแท็บ
npm run test:retrieval -- "เงินรุ่นเดือนกรกฎาคมเท่าไหร่"       # ดู intent/แหล่ง/แถว/คำตอบ
npm run test:retrieval -- "ฉันจ่ายเงินรุ่นหรือยัง" "Uxxxx..."  # ทดสอบ self finance ด้วย LINE user ID
npm run run:digest                                 # รัน digest ด้วยมือ (ต้องแชร์ชีตเป็น Editor)
```

## Deploy

1. ตั้ง env ทั้งหมดใน Vercel + แชร์ชีตให้ service account เป็น Editor
2. GitHub → Settings → Secrets and variables → Actions: ตั้ง `LEARN_URL` และ `LEARN_CRON_SECRET`
3. `git add . && git commit && git push` → Vercel auto-deploy
4. LINE Console → Webhook URL = `https://<prod>/api/line-webhook` → Verify → เปิด Use webhook
5. เพิ่ม OA เข้ากลุ่ม + เปิด “Allow bots to join group chats” เพื่อให้เรียนรู้จากกลุ่มได้

## Dev

```bash
npm install
cp .env.example .env.local   # กรอกค่า
npm run dev
npm run typecheck
npm run build
```
