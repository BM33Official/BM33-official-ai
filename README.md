# BM33.official 🤖

LINE bot กลางของรุ่น **BM33** คณะแพทยศาสตร์วชิรพยาบาล — รับข้อความ → อ่าน FAQ จาก Google Sheet → ให้ Gemini (`gemini-3.5-flash`) ตอบภาษาธรรมชาติ → ถ้าไม่มีคำตอบ route ไปคนดูแลตามหมวดพร้อมปุ่มลิงก์โปรไฟล์

## Stack

- **Next.js 14** (App Router + TypeScript) บน **Vercel**
- Webhook: `POST /api/line-webhook`
- `@line/bot-sdk` v11 (`messagingApi.MessagingApiClient`)
- `@google/genai` v2 → `gemini-3.5-flash` (temperature 1.0, maxOutputTokens 1024, thinkingLevel LOW)
- FAQ = Google Sheet publish-to-web CSV, cache 60 วิ

## โครงไฟล์

```
app/api/line-webhook/route.ts   verify signature -> fetch FAQ -> gemini -> reply
lib/sheet.ts                    ดึง+parse+cache FAQ CSV 60 วิ
lib/gemini.ts                   askGemini() คืน text/finishReason/usage
lib/routing.ts                  map หมวด -> คนดูแล + ปุ่มโปรไฟล์
lib/line.ts                     client + helper text/buttons + ข้อความ default
```

## Environment variables (4 ตัว)

ตั้งใน Vercel ทั้ง **Production + Preview** (ดู `.env.example`)

| ตัวแปร | ที่มา |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers Console > Messaging API |
| `LINE_CHANNEL_SECRET` | LINE Developers Console > Basic settings |
| `GEMINI_API_KEY` | Google AI Studio |
| `SHEET_CSV_URL` | Google Sheet > File > Share > Publish to web > CSV |

## FAQ Sheet schema

1 แท็บ → Publish to web เป็น CSV → เอา URL ใส่ `SHEET_CSV_URL` (แถวแรก = หัวตาราง)

| A `หมวด` | B `คำถาม` | C `คำตอบ` |
|---|---|---|
| การเงิน / วิชาการ / กิจกรรม / อื่นๆ | เงินรุ่นเทอมนี้เท่าไหร่ | เทอมนี้ 500 บาท พร้อมเพย์ 08x-xxx แล้วอัปสลิปในฟอร์ม |

แก้คำตอบในชีตพอ (cache รีเฟรช 60 วิ) — ไม่ต้อง deploy ใหม่

## Deploy

1. ตั้ง env 4 ตัวใน Vercel (Production + Preview)
2. กรอก `profileUrl` คนดูแลจริงใน [lib/routing.ts](lib/routing.ts) (ตอนนี้ยังเป็น `~XXXX`)
3. `git add . && git commit -m "feat: BM33 LINE bot" && git push`
4. Vercel auto-deploy → รอ production URL
5. LINE Console → Messaging API → Webhook URL = `https://<prod>/api/line-webhook` → **Verify** → เปิด **Use webhook** → ปิด auto-reply/greeting เดิม
6. ทดสอบ: คำถามใน FAQ (ตอบภาษาพูด), คำถามนอก FAQ (ขึ้นปุ่ม route), เช็ค log ครบ 3 ค่า (finishReason + thoughtsTokenCount + candidatesTokenCount)

## Dev

```bash
npm install
cp .env.example .env.local   # แล้วกรอกค่า
npm run dev                  # http://localhost:3000
npm run typecheck            # ตรวจ type
npm run build                # ตรวจ build ก่อน deploy
```
