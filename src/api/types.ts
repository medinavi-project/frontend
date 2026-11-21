// 백엔드 API 계약 기준 타입 (Notion「MediNavi — Backend API Documentation」, 2026-11-20 개정, 상태 Review)
// 모든 응답은 { code, message, data } envelope 이며 client.ts 가 풀어서 data 만 돌려준다.

/* ── 공통 ── */

export interface FieldError {
  field: string;
  reason: string;
}

/** 문진 진행 상태 (data.status). HTTP status·응답 code 와 별개 */
export type ChatStatus = 'IN_PROGRESS' | 'ANALYZING' | 'COMPLETED' | 'FAILED' | 'EMERGENCY';

export interface Question {
  question_id: string;
  text: string;
  answer_type: 'TEXT' | 'SINGLE_CHOICE';
  options: string[]; // TEXT 이면 빈 배열
}

/* ── 문진 ── */

/** POST /api/v1/chat/sessions */
export interface CreateSessionRequest {
  initial_symptom: string;
}
export interface ChatSession {
  session_id: string;
  status: ChatStatus; // 생성 시 IN_PROGRESS
  created_at: string;
  turn_count: number; // 0부터. 최초 증상은 세지 않음
  next_question: Question;
}

/** POST /api/v1/chat/sessions/{session_id}/messages */
export interface SendMessageRequest {
  question_id: string;
  message: string;
}
export interface ChatMessage {
  session_id: string;
  status: ChatStatus;
  turn_count: number;
  assistant_message: string;
  next_question: Question | null; // IN_PROGRESS 에서만 객체
  result_available: boolean; // COMPLETED 일 때만 true
  failure_code: string | null; // FAILED 원인
  emergency_guidance: string | null; // EMERGENCY 에서만
  retry_after_seconds?: number | null; // ANALYZING 에서 다음 조회 권고 간격
}

/** GET /api/v1/chat/sessions/{session_id}/result */
export type AssessmentStatus = 'ASSESSED' | 'INSUFFICIENT_EVIDENCE';
export interface SuspectedDisease {
  disease_name: string;
  reason: string;
}
export interface Reference {
  title: string;
  organization: string;
  url: string;
}
export interface AnalysisResult {
  suspected_diseases: SuspectedDisease[]; // 근거 부족이면 빈 배열
  recommended_department: string | null;
  reason: string;
  references: Reference[];
  medical_disclaimer: string;
}
export interface ChatResult {
  session_id: string;
  status: ChatStatus;
  assessment_status: AssessmentStatus | null; // 미완료면 null
  result: AnalysisResult | null; // COMPLETED 일 때만 객체
  retry_after_seconds: number | null;
}

/* ── 병원 ── */

export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export interface OpenHours {
  day_of_week: DayOfWeek;
  open_time: string | null; // "HH:mm"
  close_time: string | null;
  is_closed: boolean;
}
export interface Hospital {
  hospital_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  department: string;
  phone: string | null;
  open_hours: OpenHours[]; // 미제공이면 []
  is_open: boolean; // as_of 기준
  distance_km: number;
}
/** GET /api/v1/hospitals/open — 모든 값 필수 */
export interface HospitalQuery {
  department: string;
  latitude: number;
  longitude: number;
  radius_km: number;
  open_now: boolean; // true: 지금 진료 중인 곳만 / false: 진료 여부와 관계없이 반경 안 모든 곳 (각 is_open 표시)
}
export interface HospitalList {
  as_of: string; // 운영 여부 판정 기준 시각
  source_updated_at: string | null;
  total_count: number;
  hospitals: Hospital[]; // 0건도 정상
}

/* ── 복약 ── */

/** POST /api/v1/medications/scan (multipart, 필드 file) */
export type MatchStatus = 'MATCHED' | 'AMBIGUOUS' | 'NOT_FOUND';
export interface MedicationCandidate {
  item_seq: string;
  item_name: string;
  manufacturer: string | null;
}
export interface ScannedMedication {
  item_seq: string | null; // MATCHED 일 때만 값
  item_name: string; // OCR 문자열 또는 표준 제품명
  match_status: MatchStatus;
  candidates: MedicationCandidate[];
}
export interface MedicationScan {
  scan_id: string;
  recognized_text: string;
  medications: ScannedMedication[];
}

/** POST /api/v1/medications/guide */
export interface GuideRequest {
  medications: { item_seq: string }[];
}
export type AudioStatus = 'READY' | 'NOT_GENERATED' | 'FAILED';
export interface MedicationGuideItem {
  item_seq: string;
  item_name: string;
  efficacy: string | null; // 공식 원문
  usage: string | null;
  cautions: string[];
  official_source: { organization: string; url: string | null };
  summary: string; // 공식 원문을 쉽게 풀어 쓴 설명
  audio_status: AudioStatus;
  audio_url: string | null; // READY 일 때만
}
export interface MedicationGuide {
  medications: MedicationGuideItem[]; // 요청 순서와 같음
}
