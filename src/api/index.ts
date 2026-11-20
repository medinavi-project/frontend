// 백엔드 API 6개 (기준: Notion「MediNavi — Backend API Documentation」). VITE_USE_MOCK=true 이면 목업으로 응답.
import { request, USE_MOCK } from './client';
import * as mock from './mock';
import type {
  ChatMessage,
  ChatResult,
  ChatSession,
  GuideRequest,
  HospitalList,
  HospitalQuery,
  MedicationGuide,
  MedicationScan,
} from './types';

/** POST /chat/sessions — 최초 증상으로 문진 세션 생성, 첫 질문 반환 (201 CREATED) */
export function createSession(initialSymptom: string): Promise<ChatSession> {
  if (USE_MOCK) return mock.createSession(initialSymptom);
  return request('/chat/sessions', {
    method: 'POST',
    body: JSON.stringify({ initial_symptom: initialSymptom }),
  });
}

/** POST /chat/sessions/{id}/messages — 현재 질문에 대한 답변 전송 → 다음 질문 또는 상태 */
export function sendMessage(sessionId: string, questionId: string, message: string): Promise<ChatMessage> {
  if (USE_MOCK) return mock.sendMessage(sessionId, questionId, message);
  return request(`/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ question_id: questionId, message }),
  });
}

/** GET /chat/sessions/{id}/result — 상태와 완료된 분석 결과. 분석을 새로 시작하지 않는다 */
export function getResult(sessionId: string): Promise<ChatResult> {
  if (USE_MOCK) return mock.getResult(sessionId);
  return request(`/chat/sessions/${encodeURIComponent(sessionId)}/result`);
}

/** GET /hospitals/open — 진료과·위치·반경·현재 진료 조건으로 병원 검색 */
export function getOpenHospitals(q: HospitalQuery): Promise<HospitalList> {
  if (USE_MOCK) return mock.getOpenHospitals(q);
  const params = new URLSearchParams({
    department: q.department,
    latitude: String(q.latitude),
    longitude: String(q.longitude),
    radius_km: String(q.radius_km),
    open_now: String(q.open_now),
  });
  return request(`/hospitals/open?${params}`);
}

/** POST /medications/scan — 약봉투 사진(multipart, 필드 file) → OCR 텍스트와 약품 후보 */
export function scanMedication(file: File): Promise<MedicationScan> {
  if (USE_MOCK) return mock.scanMedication(file);
  const form = new FormData();
  form.append('file', file);
  return request('/medications/scan', { method: 'POST', body: form });
}

/** POST /medications/guide — 사용자가 확인한 item_seq 들의 공식 정보·쉬운 설명·음성 */
export function getGuide(itemSeqs: string[]): Promise<MedicationGuide> {
  if (USE_MOCK) return mock.getGuide(itemSeqs);
  const body: GuideRequest = { medications: itemSeqs.map((item_seq) => ({ item_seq })) };
  return request('/medications/guide', { method: 'POST', body: JSON.stringify(body) });
}

export { ApiError, NETWORK_ERROR, errorMessage } from './client';
export * from './types';
