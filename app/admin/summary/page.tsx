import { redirect } from "next/navigation";
// เดิม "สรุป/รอส่ง" -> ย้ายไป "สรุปวันนี้" (แอป) + "กล่องรอตรวจ" (ข้อความขาออก)
export default function Summary() {
  redirect("/admin/daily");
}
