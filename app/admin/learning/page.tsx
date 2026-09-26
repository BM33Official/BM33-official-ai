import { redirect } from "next/navigation";
// เดิม "การเรียนรู้" -> รวมอยู่ในหน้า "AI & ความรู้"
export default function Learning() {
  redirect("/admin/ai");
}
