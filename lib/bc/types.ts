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
  // ── v2: แอปสมาชิก + ระบบอัตโนมัติ ──
  config: "BC_config",
  committee: "BC_committee",
  announcements: "BC_announcements",
  daily: "BC_daily",
  schedule: "BC_schedule",
  uniExams: "BC_uni_exams",
  uploads: "BC_uploads",
  feeMonths: "BC_fee_months",
  payments: "BC_payments",
  draws: "BC_draws",
  outbox: "BC_outbox",
  fortunes: "BC_fortunes",
  chatlog: "BC_chatlog", // บันทึกถาม-ตอบของบอท (แอดมินเท่านั้น; ไม่อยู่ใน snapshot)
  // ── v3 ──
  usage: "BC_usage", // ค่าใช้จ่าย AI ต่อครั้ง (ไม่อยู่ใน snapshot)
  slips: "BC_slips", // สลิปโอนเงินที่สมาชิกส่ง + ผลตรวจ AI (ไม่อยู่ใน snapshot — มีรูป)
} as const;
export type TabKey = keyof typeof TABS;

// header (ลำดับคอลัมน์สำคัญ — โค้ดอ้างด้วยชื่อ ไม่ใช่ตำแหน่ง แต่ ensureTab ใช้ลำดับนี้)
// กฎ: คอลัมน์ใหม่ต่อท้ายเสมอ เพื่อไม่ให้ข้อมูลเดิมเลื่อนตำแหน่ง
export const HEADERS: Record<TabKey, string[]> = {
  // BC_roster: ผู้ใช้กรอกเองด้วยหัวคอลัมน์ของตัวเอง -> ไม่บังคับ header (ดู lib/bc/roster.ts)
  roster: [],
  members: [
    "line_user_id", "display_name", "claimed_name", "last3",
    "matched_student_id", "pending_student_id", "status",
    "onboarding_state", "onboarded_at", "updated_at",
    "liff_user_id", "portal_confirmed_at", "last_seen_at",
  ],
  forms: [
    "form_id", "name", "type", "response_sheet_id", "response_tab",
    "id_column", "done_condition", "access", "created_at",
    "deadline_at", "link", "description", "status",
    "source", "announcement_id",
  ],
  status: ["student_id", "form_id", "state", "source", "updated_at", "note"],
  broadcasts: [
    "id", "title", "message_type", "template_id", "body_text", "header_color",
    "button_label", "button_action", "button_value", "segment_form_id",
    "segment_condition", "status", "schedule_at", "recurring", "test_mode",
    "created_by", "approved_by", "created_at", "sent_at", "result_json",
    "image_url",
  ],
  sendLog: ["broadcast_id", "student_id", "line_user_id", "round", "sent_at"],
  exams: [
    "exam_id", "name", "exam_date", "question_count", "not_memorized_ids", "created_at",
    "doc_link", "doc_title", "not_filled_ids", "doc_reminder_at", "doc_reminder_status",
    "doc_reminder_template",
    "assign_json", "recalled", "check_at", "question_count2",
  ],
  summaries: ["id", "week", "kind", "title", "body", "status", "created_at", "sent_at", "schedule_at"],

  config: ["key", "value", "updated_at", "note"],
  committee: ["student_id", "nickname", "role", "contact_url", "sort", "updated_at"],
  announcements: [
    "id", "title", "summary", "body", "author", "author_role", "category",
    "deadline_at", "event_at", "location", "links", "source", "source_ref",
    "status", "pinned", "created_at", "updated_at", "reminders", "form_id",
  ],
  daily: ["id", "date", "headline", "items", "status", "source", "created_at", "updated_at"],
  schedule: [
    "id", "block", "date", "start", "end", "subject", "topic", "lecturer",
    "building", "room", "kind", "note", "status", "upload_id", "updated_at",
  ],
  uniExams: ["id", "name", "date", "start", "end", "building", "room", "block", "note", "status", "updated_at"],
  uploads: ["id", "filename", "mime", "block", "status", "summary", "created_at", "note"],
  feeMonths: ["month", "label", "amount", "due_date", "note", "updated_at"],
  payments: ["student_id", "month", "amount", "kind", "paid_at", "recorded_by", "note", "updated_at"],
  draws: [
    "id", "activity", "need", "pool_ids", "selected_ids", "status",
    "show_at", "reveal_at", "created_at", "note", "notified",
  ],
  outbox: [
    "id", "kind", "ref_id", "title", "audience", "messages", "preview",
    "status", "code", "created_at", "decided_at", "sent_at", "result", "expires_at",
  ],
  fortunes: ["student_id", "pulls", "collected", "streak", "last_day", "best", "pity", "updated_at"],
  chatlog: ["ts", "channel", "student_id", "nickname", "question", "kind", "reply", "model", "ms", "tokens"],
  usage: ["ts", "feature", "model", "prompt", "cached", "output", "usd", "who"],
  slips: [
    "id", "student_id", "month", "amount", "paid_at", "bank_ref", "receiver", "ai_verdict", "ai_note",
    "status", "image", "created_at", "decided_at", "decided_by", "source",
  ],
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
  doc_reminder_template: string; // ข้อความที่แก้ไว้สำหรับการส่งตามเวลา ("" = ใช้ค่าเริ่มต้น)
  assign_json?: string; // {"<student_id>":[ข้อ,...]} — ใครรับผิดชอบจำข้อไหน
  recalled?: string; // ข้อที่มีคนพิมพ์ลงเอกสารแล้ว (comma)
  check_at?: string; // เวลาที่ตรวจล่าสุด
  question_count2?: string; // จำนวนข้อทั้งหมด (จากการตรวจ)
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
  liff_user_id?: string; // userId จาก LIFF (อาจต่างจาก bot ถ้าอยู่คนละ provider)
  portal_confirmed_at?: string;
  last_seen_at?: string;
}

export interface RosterEntry {
  __row?: number;
  student_id: string;
  full_name: string;
  nickname: string;
  notes: string;
  prefix?: string;
  name_en?: string;
  nickname_en?: string;
  line_id?: string;
  instagram?: string;
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
  deadline_at?: string; // ISO — โชว์ในแอป + เตือนใกล้เดดไลน์
  link?: string; // ลิงก์ฟอร์มให้สมาชิกกด
  description?: string;
  status?: string; // "" | open | closed | deleted
  source?: string; // "" (เพิ่มเอง) | auto (สร้างจากประกาศอัตโนมัติ)
  announcement_id?: string;
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
  message_type: "text" | "flex" | "image";
  image_url?: string; // สำหรับ message_type="image" (ต้องเป็น https)
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

// ── v2 ──────────────────────────────────────────────────────────────────────
export interface LinkItem { label: string; url: string }

export interface Announcement {
  __row?: number;
  id: string;
  title: string;
  summary: string; // สรุปสั้น 1-2 บรรทัด (AI หรือแอดมินเขียน)
  body: string; // ข้อความต้นฉบับจากกรรมการ
  author: string; // ชื่อเล่นผู้ประกาศ
  author_role: string; // ตำแหน่ง เช่น ประธานรุ่น
  category: string; // ทั่วไป | การเงิน | วิชาการ | กิจกรรม | ฟอร์ม | ด่วน
  deadline_at: string; // ISO
  event_at: string; // ISO (วันงาน/วันนัด)
  location: string;
  links: string; // JSON LinkItem[]
  source: string; // group | forward | manual
  source_ref: string; // message id
  status: string; // live | hidden | draft | archived
  pinned: string; // "1" | ""
  created_at: string;
  updated_at: string;
  reminders: string; // JSON {"d3":iso,"d1":iso,"d0":iso} — รอบเตือนที่สร้างแล้ว
  form_id: string; // ผูกกับฟอร์มที่ติดตาม (ถ้ามี)
}

export interface DailyItem {
  emoji: string;
  text: string;
  at?: string; // ISO (ถ้ามีวันเวลา — แอปคำนวณ "อีกกี่วัน" สด)
  ref?: string; // announcement id / form id
  tone?: "urgent" | "normal" | "good";
}
export interface Daily {
  __row?: number;
  id: string;
  date: string; // YYYY-MM-DD (เวลาไทย)
  headline: string;
  items: string; // JSON DailyItem[]
  status: string; // live | hidden | draft
  source: string; // ai | edited
  created_at: string;
  updated_at: string;
}

export interface ScheduleItem {
  __row?: number;
  id: string;
  block: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string;
  subject: string;
  topic: string;
  lecturer: string;
  building: string;
  room: string;
  kind: string; // lecture | lab | exam | activity | other
  note: string;
  status: string; // live | draft | hidden
  upload_id: string;
  updated_at: string;
}

export interface UniExam {
  __row?: number;
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  start: string;
  end: string;
  building: string;
  room: string;
  block: string;
  note: string;
  status: string; // live | draft | hidden
  updated_at: string;
}

export interface UploadRec {
  __row?: number;
  id: string;
  filename: string;
  mime: string;
  block: string;
  status: string; // parsed | published | failed
  summary: string;
  created_at: string;
  note: string;
}

export interface FeeMonth {
  __row?: number;
  month: string; // YYYY-MM
  label: string;
  amount: string;
  due_date: string; // YYYY-MM-DD
  note: string;
  updated_at: string;
}
export interface Payment {
  __row?: number;
  student_id: string;
  month: string; // YYYY-MM
  amount: string;
  kind: string; // monthly | yearly | waived | partial
  paid_at: string;
  recorded_by: string;
  note: string;
  updated_at: string;
}

export interface Draw {
  __row?: number;
  id: string;
  activity: string;
  need: string;
  pool_ids: string; // comma student ids
  selected_ids: string; // comma student ids (ลับ — ไม่ส่งให้ client ยกเว้นของตัวเอง)
  status: string; // scheduled | revealed | canceled
  show_at: string; // ISO เวลาที่หน้าต่างสุ่มเด้งขึ้นในแอป
  reveal_at: string; // ISO เวลาประกาศผล (เฉพาะตัว)
  created_at: string;
  note: string;
  notified: string; // "" | queued | sent
}

export interface OutboxItem {
  __row?: number;
  id: string;
  kind: string; // deadline | summary | broadcast | draw | announcement
  ref_id: string;
  title: string;
  audience: string; // all | undone:<formId> | ids:<comma> | admins
  messages: string; // JSON LINE messages
  preview: string; // ข้อความตัวอย่างสำหรับแอดมิน
  status: string; // pending | approved | sent | rejected | expired | failed
  code: string; // เลขสั้นสำหรับพิมพ์ approve <code>
  created_at: string;
  decided_at: string;
  sent_at: string;
  result: string;
  expires_at: string;
}

export interface Slip {
  __row?: number;
  id: string;
  student_id: string;
  month: string; // YYYY-MM (เดือนที่จ่าย — สมาชิกเลือก/AI เดา)
  amount: string; // ยอดที่อ่านได้จากสลิป
  paid_at: string; // ISO เวลาในสลิป
  bank_ref: string; // เลขอ้างอิงรายการ (กันสลิปซ้ำ)
  receiver: string; // ชื่อบัญชีผู้รับที่อ่านได้
  ai_verdict: string; // ok | check | bad
  ai_note: string;
  status: string; // pending | approved | rejected
  image: string; // data:image/jpeg;base64,... (ย่อแล้ว ≤ ~45KB)
  created_at: string;
  decided_at: string;
  decided_by: string;
  source: string; // app | line
}

export interface FortuneRec {
  __row?: number;
  student_id: string;
  pulls: string;
  collected: string; // base64url bitset ของ 200 ใบ
  streak: string;
  last_day: string; // YYYY-MM-DD
  best: string; // tier สูงสุดที่เคยได้
  pity: string;
  updated_at: string;
}

export interface CommitteeRec {
  __row?: number;
  student_id: string;
  nickname: string;
  role: string;
  contact_url: string;
  sort: string;
  updated_at: string;
}
