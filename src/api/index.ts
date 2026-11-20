// 백엔드 API (기술문서 1-5). VITE_USE_MOCK=true 이면 목업으로 응답.
import { request, USE_MOCK } from './client';
import * as mock from './mock';
import type {
  ChatResult,
  CreateSessionRequest,
  CreateSessionResponse,
  GuideResponse,
  HospitalListResponse,
  HospitalQuery,
  ScanResponse,
  SendMessageResponse,
} from './types';

/** POST /chat/sessions — 문진 세션 시작 */
export function createSession(body: CreateSessionRequest = {}): Promise<CreateSessionResponse> {
  if (USE_MOCK) return mock.createSession(body);
  return request('/chat/sessions', { method: 'POST', body: JSON.stringify(body) });
}

/** POST /chat/sessions/{id}/messages — 발화 전송 → 다음 질문 또는 완료 */
export function sendMessage(sessionId: string, text: string): Promise<SendMessageResponse> {
  if (USE_MOCK) return mock.sendMessage(sessionId, text);
  return request(`/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

/** GET /chat/sessions/{id}/result — 의심 질환·진료과·근거 문서 */
export function getResult(sessionId: string): Promise<ChatResult> {
  if (USE_MOCK) return mock.getResult(sessionId);
  return request(`/chat/sessions/${sessionId}/result`);
}

/** GET /hospitals/open — 현재 진료 중인 병원 */
export function getOpenHospitals(q: HospitalQuery): Promise<HospitalListResponse> {
  if (USE_MOCK) return mock.getOpenHospitals(q);
  const params = new URLSearchParams({
    lat: String(q.lat),
    lng: String(q.lng),
    radius: String(q.radius ?? 3000),
  });
  if (q.dept) params.set('dept', q.dept);
  return request(`/hospitals/open?${params}`);
}

/** POST /medication/scan — 사진 업로드 → OCR → 약품 매칭 */
export function scanMedication(file: File): Promise<ScanResponse> {
  if (USE_MOCK) return mock.scanMedication(file);
  const form = new FormData();
  form.append('image', file);
  return request('/medication/scan', { method: 'POST', body: form });
}

/** POST /medication/guide — 약품별 3줄 요약 + TTS mp3 URL */
export function getGuide(itemSeqs: string[]): Promise<GuideResponse> {
  if (USE_MOCK) return mock.getGuide(itemSeqs);
  return request('/medication/guide', {
    method: 'POST',
    body: JSON.stringify({ item_seqs: itemSeqs }),
  });
}

export * from './types';
