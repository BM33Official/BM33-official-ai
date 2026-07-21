#!/usr/bin/env bash
# ติดตั้ง Rich Menu ให้ LINE OA (รันครั้งเดียวตอนตั้งค่า / ตอนอยากเปลี่ยนเมนู)
#
# ต้องมีก่อนรัน:
#   1) LINE_CHANNEL_ACCESS_TOKEN  (export ก่อน หรือใส่ใน .env.local แล้ว source)
#   2) rich-menu.json             (โครงปุ่ม — อยู่โฟลเดอร์เดียวกับสคริปต์นี้)
#   3) rich-menu.png              (รูปเมนู 2500x1686, PNG, <=1MB) <-- คุณเตรียมรูปเอง
#   4) เครื่องมือ: curl, jq       (macOS: brew install jq)
#
# วิธีรัน:
#   export LINE_CHANNEL_ACCESS_TOKEN="xxxxx"
#   bash rich-menu/setup-rich-menu.sh

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN="${LINE_CHANNEL_ACCESS_TOKEN:-}"
JSON="$DIR/rich-menu.json"
IMG="$DIR/rich-menu.png"

# ---- ตรวจของก่อน ----
if [[ -z "$TOKEN" ]]; then
  echo "❌ ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN (export ก่อนรัน)" >&2
  exit 1
fi
command -v jq >/dev/null || { echo "❌ ไม่พบ jq (macOS: brew install jq)" >&2; exit 1; }
[[ -f "$JSON" ]] || { echo "❌ ไม่พบ $JSON" >&2; exit 1; }
[[ -f "$IMG" ]] || { echo "❌ ไม่พบ $IMG — เตรียมรูปเมนู 2500x1686 PNG ก่อน" >&2; exit 1; }

echo "1/3 สร้าง rich menu จาก rich-menu.json ..."
MENU_ID=$(curl -sS -X POST https://api.line.me/v2/bot/richmenu \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @"$JSON" | jq -r '.richMenuId')

if [[ -z "$MENU_ID" || "$MENU_ID" == "null" ]]; then
  echo "❌ สร้าง rich menu ไม่สำเร็จ (เช็ก token / JSON)" >&2
  exit 1
fi
echo "   ✅ richMenuId = $MENU_ID"

echo "2/3 อัปโหลดรูป rich-menu.png ..."
curl -sS -X POST "https://api-data.line.me/v2/bot/richmenu/$MENU_ID/content" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: image/png" \
  --data-binary @"$IMG"
echo "   ✅ อัปโหลดรูปแล้ว"

echo "3/3 ตั้งเป็นเมนู default ให้ทุกคน ..."
curl -sS -X POST "https://api.line.me/v2/bot/user/all/richmenu/$MENU_ID" \
  -H "Authorization: Bearer $TOKEN"
echo "   ✅ ตั้ง default แล้ว"

echo ""
echo "🎉 เสร็จ! Rich menu ติดตั้งแล้ว: $MENU_ID"
echo "   (เปิดแชท LINE OA แล้วดูเมนูใต้ช่องพิมพ์ได้เลย)"
