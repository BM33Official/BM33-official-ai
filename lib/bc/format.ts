// จัดรูปแบบเวลาเป็นเขตเวลาไทย (Asia/Bangkok, GMT+7)
// ค่าในชีตเก็บเป็น ISO (UTC) -> แสดงผลต้องแปลงเป็นเวลาไทย

export function bkkDateTime(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  // sv-SE ให้รูปแบบ "YYYY-MM-DD HH:mm"
  return d.toLocaleString("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function bkkDate(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}
