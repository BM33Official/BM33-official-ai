// Broadcast Control Center — ชื่อแท็บ + header + type ของแต่ละตาราง
// เก็บทุกอย่างใน Google Sheets (แท็บขึ้นต้น BC_ กันชนกับ retrieval sources)

export const TABS = {
  roster: "BC_roster",
  members: "BC_members",
  forms: "BC_forms",
  status: "BC_status",
  broadcasts: "BC_broadcasts",
  sendLog: "BC_send_log",
  exams: "BC_exams",
  summaries: "BC_summaries",
} as const;

// header (ลำดับคอลัมน์สำคัญ — โค้ดอ้างด้วยชื่อ ไม่ใช่ตำแหน่ง แต่ ensureTab ใช้ลำดับนี้)
export const HEADERS: Record<keyof typeof TABS, string[]> = {
  roster: ["student_id", "full_name", "nickname", "notes"],
  members: [
    "line_user_id", "display_name", "claimed_name", "last3",
    "matched_student_id", "pending_student_id", "status",
    "onboarding_state", "onboarded_at", "updated_at",
  ],
  forms: [
    "form_id", "name", "type", "response_sheet_id", "response_tab",
    "id_column", "done_condition", "access", "created_at",
  ],
  status: ["student_id", "form_id", "state", "source", "updated_at", "note"],
  broadcasts: [
    "id", "title", "message_type", "template_id", "body_text", "header_color",
    "button_label", "button_action", "button_value", "segment_form_id",
    "segment_condition", "status", "schedule_at", "recurring", "test_mode",
    "created_by", "approved_by", "created_at", "sent_at", "result_json",
  ],
  sendLog: ["broadcast_id", "student_id", "line_user_id", "round", "sent_at"],
  // คอลัมน์ใหม่ต่อท้าย created_at เสมอ เพื่อไม่ให้ข้อมูลเดิมเลื่อนตำแหน่ง
  exams: [
    "exam_id", "name", "exam_date", "question_count", "not_memorized_ids", "created_at",
    "doc_link", "doc_title", "not_filled_ids", "doc_reminder_at", "doc_reminder_status",
  ],
  summaries: ["id", "week", "kind", "title", "body", "status", "created_at", "sent_at", "schedule_at"],
};

export interface Exam {
  __row?: number;
  exam_id: string;
  name: string;
  exam_date: string;
  question_count: string; // legacy — ไม่บังคับกรอกแล้ว
  not_memorized_ids: string; // comma-separated student_id ที่ยังไม่ได้จำ
  created_at: string;
  doc_link: string; // ลิงก์เอกสารแบ่งข้อรับผิดชอบ (ให้ทุกคนกรอก)
  doc_title: string; // ชื่อเอกสาร (ใช้แสดง/บอก AI)
  not_filled_ids: string; // comma-separated student_id ที่ "ยังไม่กรอกเอกสาร" (ติ๊กเอง)
  doc_reminder_at: string; // ISO เวลาที่ตั้งให้ส่งเตือนกรอกเอกสารอัตโนมัติ ("" = ไม่ตั้ง)
  doc_reminder_status: string; // "" | pending | sent
}

export type OnboardingState = "awaiting_info" | "awaiting_confirm" | "done" | "mismatch";
export type MemberStatus = "verified" | "unverified" | "mismatch";

export interface Member {
  __row?: number;
  line_user_id: string;
  display_name: string;
  claimed_name: string;
  last3: string;
  matched_student_id: string;
  pending_student_id: string;
  status: MemberStatus | "";
  onboarding_state: OnboardingState | "";
  onboarded_at: string;
  updated_at: string;
}

export interface RosterEntry {
  __row?: number;
  student_id: string;
  full_name: string;
  nickname: string;
  notes: string;
}

export type FormAccess = "auto" | "manual";
export interface FormDef {
  __row?: number;
  form_id: string;
  name: string;
  type: string; // payment | form
  response_sheet_id: string;
  response_tab: string;
  id_column: string; // header ในชีตปลายทางที่เก็บ student id
  done_condition: string; // "" = มีแถว = done | "col=value" = คอลัมน์นั้น = ค่านั้น
  access: FormAccess;
  created_at: string;
}

export type StatusState = "done" | "claimed" | "confirmed" | "none";
export interface StatusOverlay {
  __row?: number;
  student_id: string;
  form_id: string;
  state: StatusState;
  source: string; // auto | self_claim | manual
  updated_at: string;
  note: string;
}

export type BroadcastStatus =
  | "draft" | "pending" | "approved" | "scheduled" | "sent" | "canceled";
export interface Broadcast {
  __row?: number;
  id: string;
  title: string;
  message_type: "text" | "flex";
  template_id: string;
  body_text: string;
  header_color: string;
  button_label: string;
  button_action: "uri" | "postback" | "";
  button_value: string;
  segment_form_id: string; // "" = ทุกคน (onboarded)
  segment_condition: string; // undone | done | all
  status: BroadcastStatus;
  schedule_at: string; // ISO; "" = ส่งทันทีเมื่อ approved
  recurring: string; // JSON: {cadenceDays,cap,untilDone,autoSend}
  test_mode: string; // "1" | "0"
  created_by: string;
  approved_by: string;
  created_at: string;
  sent_at: string;
  result_json: string;
}
