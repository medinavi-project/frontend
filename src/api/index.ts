// 백엔드 API (기준: MediNavi_API_명세서_v1.1.md, Swagger http://101.79.27.212:8000/docs). 음성(mp3)은 audio_url 을 <audio> 로 직접 재생한다.
import { request } from './client';
import type {
  ChatMessage,
  ChatResult,
  ChatSession,
  HospitalList,
  HospitalQuery,
  MedicationScan,
} from './types';

/** POST /chat/sessions — 최초 증상으로 문진 세션 생성, 첫 질문 반환 (201) */
export function createSession(initialSymptom: string): Promise<ChatSession> {
  return request('/chat/sessions', {
    method: 'POST',
    body: JSON.stringify({ initial_message: initialSymptom }),
  });
}

/** POST /chat/sessions/{id}/messages — 답변 전송 → 다음 질문 또는 상태. 같은 clientMessageId 로 다시 보내면 중복 처리되지 않는다 */
export function sendMessage(sessionId: string, clientMessageId: string, message: string): Promise<ChatMessage> {
  return request(`/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ client_message_id: clientMessageId, message }),
  });
}

/** GET /chat/sessions/{id}/result — 상태와 완료된 분석 결과. 분석을 새로 시작하지 않는다 */
export function getResult(sessionId: string): Promise<ChatResult> {
  return request(`/chat/sessions/${encodeURIComponent(sessionId)}/result`);
}

/** GET /hospitals/open — 진료과(쉼표로 최대 5개)·위치·반경·현재 진료 조건으로 병원 검색 */
export function getOpenHospitals(q: HospitalQuery): Promise<HospitalList> {
  const params = new URLSearchParams({
    department: q.department,
    latitude: String(q.latitude),
    longitude: String(q.longitude),
    radius_km: String(q.radius_km),
    open_now: String(q.open_now),
  });
  return request(`/hospitals/open?${params}`);
}

/** POST /medications/scan — 약봉투 사진(multipart, 필드 file) → 약별 복약 안내 카드 */
export function scanMedication(file: File): Promise<MedicationScan> {
  const form = new FormData();
  form.append('file', file);
  return request('/medications/scan', { method: 'POST', body: form });
}

export { ApiError, NETWORK_ERROR, errorMessage, serverUrl } from './client';
export * from './types';
