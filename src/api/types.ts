// 백엔드 API 계약 기준 타입 (Notion「MediNavi API 명세서 (v1 · 2026-11-22)」 + Swagger /docs 의 openapi.json)
// 모든 응답은 { code, message, data } envelope 이며 client.ts 가 풀어서 data 만 돌려준다.

/* ── 공통 ── */

export interface FieldError {
  field: string;
  reason: string;
}

/** 문진 진행 상태 (data.status). HTTP status·응답 code 와 별개 */
export type ChatStatus = 'IN_PROGRESS' | 'ANALYZING' | 'COMPLETED' | 'FAILED' | 'EMERGENCY';

/* ── 문진 ── */

/** POST /api/v1/chat/sessions (201) */
export interface CreateSessionRequest {
  initial_message: string; // 1~1000자
}
export interface ChatSession {
  session_id: string;
  status: ChatStatus;
  next_question: string | null; // 질문은 문장 하나. 응급·완료면 null
  turn_count: number; // 사용자 메시지 수(첫 증상 포함). 생성 직후 1, 최대 5
  expires_at: string; // 마지막 활동 후 30분 (UTC)
  emergency_message?: string | null; // EMERGENCY 에서만
}

/** POST /api/v1/chat/sessions/{session_id}/messages */
export interface SendMessageRequest {
  client_message_id: string; // uuid. 같은 값으로 다시 보내면 서버가 중복 처리하지 않는 용도
  message: string; // 1~1000자
}
/** 서버가 지금까지 정리한 증상 정보 */
export interface CollectedSymptoms {
  main_symptom?: string | null;
  body_location?: string | null;
  onset?: string | null;
  severity?: number | null; // 0~10
  additional_symptoms?: string[];
  region?: string | null;
}
export interface ChatMessage {
  session_id: string;
  status: ChatStatus;
  next_question: string | null;
  turn_count: number;
  collected_symptoms: CollectedSymptoms;
  result_available: boolean;
  emergency_message?: string | null;
}

/** GET /api/v1/chat/sessions/{session_id}/result — 결과 필드가 data 에 바로 펼쳐져 있다 */
export type AssessmentStatus = 'PRELIMINARY' | 'INSUFFICIENT_INFORMATION' | 'INSUFFICIENT_EVIDENCE';
export interface SuspectedDisease {
  disease_name: string;
  reason: string;
}
export interface ChatResult {
  session_id: string;
  status: ChatStatus;
  assessment_status?: AssessmentStatus | null; // 미완료면 null
  analysis_source?: string | null;
  symptom_summary?: string | null;
  suspected_diseases?: SuspectedDisease[]; // 근거 부족이면 빈 배열
  recommended_department?: string | null;
  references?: string[]; // "제목 | 출처 | URL" 형식 문자열
  medical_disclaimer?: string; // 서버 기본 문구
  failure_code?: string | null; // FAILED 원인
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

/** POST /api/v1/medications/scan (multipart, 필드 file: JPG·PNG·WEBP, 최대 5MB) — 안내 API 는 따로 없고 스캔 응답에 안내가 들어 있다
 * COMPLETED 모두 확인 / PARTIAL 일부 / NEEDS_CONFIRMATION 하나도 확인 못함 / INCOMPLETE 공식 정보 없음 / OCR_ONLY 글자만 인식(데모) */
export type ScanStatus = 'COMPLETED' | 'NEEDS_CONFIRMATION' | 'INCOMPLETE' | 'OCR_ONLY' | 'PARTIAL';
export type GuidanceStatus = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
export interface MedicationDescription {
  purpose?: string | null;
  how_to_take?: string | null;
  precautions?: string | null;
  side_effects?: string | null;
  storage?: string | null;
}
export interface MedicationCard {
  item_seq: string;
  name: string;
  description: MedicationDescription;
  guidance_status: GuidanceStatus;
  warning?: string | null; // 이름이 비슷한 약으로 추정했을 때의 주의 문구
}
/** 확실히 찾지 못한 약 */
export interface UncertainMedicationCard {
  recognized_name: string;
  reason: string;
  action_message: string;
}
export interface MedicationScan {
  status: ScanStatus;
  identified_count: number;
  uncertain_count: number;
  medications: MedicationCard[];
  uncertain_medications: UncertainMedicationCard[];
}
