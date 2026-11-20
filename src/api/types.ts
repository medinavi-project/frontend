// 기술문서 1-4(주요 테이블)·1-5(백엔드 API)·2-2(슬롯 정의) 기준 타입

/** 문진 슬롯 (2-2 슬롯 정의) */
export type SlotKey =
  | 'main_symptom' // 주증상 (필수)
  | 'body_part' // 부위 (필수)
  | 'onset' // 발생 시점·기간 (필수)
  | 'severity' // 강도 0~10 (필수)
  | 'accompanying' // 동반 증상 (필수)
  | 'region' // 지역 (필수, 위치 권한 허용 시 생략)
  | 'age_history'; // 나이대·기저질환 (선택)

export type Slots = Partial<Record<SlotKey, string>>;

export interface SlotMeta {
  key: SlotKey;
  label: string;
  required: boolean;
}

export const SLOT_META: SlotMeta[] = [
  { key: 'main_symptom', label: '주증상', required: true },
  { key: 'body_part', label: '부위', required: true },
  { key: 'onset', label: '언제부터', required: true },
  { key: 'severity', label: '강도', required: true },
  { key: 'accompanying', label: '동반 증상', required: true },
  { key: 'region', label: '지역', required: true },
  { key: 'age_history', label: '나이대·기저질환', required: false },
];

export const MAX_TURNS = 5;

/** POST /chat/sessions */
export interface CreateSessionRequest {
  lat?: number;
  lng?: number;
}
export interface CreateSessionResponse {
  session_id: string;
  greeting: string;
}

/** POST /chat/sessions/{id}/messages */
export interface SendMessageResponse {
  reply: string; // 다음 질문 또는 완료 안내
  slots: Slots;
  turn_count: number;
  red_flag: boolean; // 위험 신호 → 119·응급실 안내
  done: boolean; // 문진 완료 (필수 슬롯 충족 또는 5턴)
}

/** GET /chat/sessions/{id}/result — HCX-007 Structured Outputs */
export interface EvidenceDoc {
  doc_id: string;
  disease_name: string;
  snippet: string;
}
export interface SuspectedDisease {
  name: string;
  reason: string;
}
export interface ChatResult {
  summary: string;
  diseases: SuspectedDisease[];
  department: string;
  region?: string;
  lat?: number;
  lng?: number;
  evidence: EvidenceDoc[];
}

/** hospital 테이블 · GET /hospitals/open */
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun' | 'hol';
export interface OpenHours {
  start: string; // "09:00"
  end: string; // "18:00"
}
export interface Hospital {
  hpid: string;
  name: string;
  departments: string[];
  open_hours: Partial<Record<Weekday, OpenHours>>;
  lat: number;
  lng: number;
  tel: string;
  address: string;
  distance_m?: number;
  is_emergency?: boolean;
}
export interface HospitalQuery {
  dept?: string;
  lat: number;
  lng: number;
  radius?: number; // m
}
export interface HospitalListResponse {
  hospitals: Hospital[];
  widened: boolean; // 결과가 없어 응급실·가정의학과로 넓혔는지
}

/** drug 테이블 · POST /medication/scan */
export interface DrugCandidate {
  item_seq: string;
  item_name: string;
  score: number; // 0~1 유사도
}
export interface ScannedItem {
  ocr_text: string; // inferText 원문
  candidates: DrugCandidate[]; // score 순. 1개면 확정, 여러 개면 사용자가 고름
}
export interface ScanResponse {
  image_url: string;
  items: ScannedItem[];
}

/** POST /medication/guide */
export interface DrugGuide {
  item_seq: string;
  item_name: string;
  summary: [string, string, string]; // 3줄 요약
  efficacy: string;
  usage: string;
  caution: string;
  interaction: string;
}
export interface GuideResponse {
  guides: DrugGuide[];
  tts_url: string | null;
}
