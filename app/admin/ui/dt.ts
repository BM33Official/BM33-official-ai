// แปลง ISO <-> ค่า input datetime-local แบบ "เวลาไทยเสมอ" (ไม่ขึ้นกับเขตเวลาของเครื่องแอดมิน)
export function isoToLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const x = new Date(d.getTime() + 7 * 3600_000);
  return x.toISOString().slice(0, 16);
}
export function localInputToIso(v: string): string {
  if (!v) return "";
  const d = new Date(`${v}:00+07:00`);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}
