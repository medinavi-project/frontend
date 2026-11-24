// 백엔드 없이 화면을 개발하기 위한 목업. VITE_USE_MOCK=true 일 때만 사용. 백엔드 연동 후 삭제 (PRD 10장).
// 병원·약 정보는 모두 지어낸 예시다. 실제 의료 정보가 아니다.
// 응답 모양은 types.ts(백엔드 API 계약)를 그대로 따른다.
import { ApiError, sleep } from './client';
import type {
  ChatMessage,
  ChatResult,
  ChatSession,
  Hospital,
  HospitalList,
  HospitalQuery,
  MedicationScan,
  OpenHours,
} from './types';

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

/* ── 문진 ── */

// 서버가 내려줄 질문을 흉내 낸 고정 목록
const QUESTIONS: string[] = [
  '언제부터 불편하셨어요?',
  '아픈 곳이 정확히 어디인가요?',
  '0부터 10 중 몇 점 정도로 아프세요?',
  '열이나 구토가 같이 있나요?',
];

// 목업 전용 위험 신호 흉내. 실제 판단은 서버가 한다.
const RED_FLAGS = ['흉통', '가슴이', '숨이', '숨쉬기', '호흡', '의식', '기절', '마비', '피를 토'];
const EMERGENCY_MESSAGE = '위험 신호가 감지되었습니다. 즉시 119 또는 가까운 응급실에 연락하세요.';

interface MockSession {
  status: ChatMessage['status'];
  turn: number;
  answered: Set<string>;
  analyzeUntil: number;
}
const sessions = new Map<string, MockSession>();

const notFound = () =>
  new ApiError(404, 'SESSION_NOT_FOUND', '문진 세션이 존재하지 않거나 만료되었습니다.');

const base = (id: string, s: MockSession): ChatMessage => ({
  session_id: id,
  status: s.status,
  turn_count: s.turn,
  next_question: null,
  collected_symptoms: { additional_symptoms: [] },
  result_available: s.status === 'COMPLETED',
  emergency_message: null,
});

export async function createSession(initialSymptom: string): Promise<ChatSession> {
  await sleep(400);
  const id = uuid();
  const expires_at = new Date(Date.now() + 30 * 60_000).toISOString();
  if (RED_FLAGS.some((k) => initialSymptom.includes(k))) {
    sessions.set(id, { status: 'EMERGENCY', turn: 1, answered: new Set(), analyzeUntil: 0 });
    return { session_id: id, status: 'EMERGENCY', next_question: null, turn_count: 1, expires_at, emergency_message: EMERGENCY_MESSAGE };
  }
  sessions.set(id, { status: 'IN_PROGRESS', turn: 1, answered: new Set(), analyzeUntil: 0 });
  return { session_id: id, status: 'IN_PROGRESS', next_question: QUESTIONS[0], turn_count: 1, expires_at };
}

export async function sendMessage(id: string, clientMessageId: string, message: string): Promise<ChatMessage> {
  await sleep(700);
  const s = sessions.get(id);
  if (!s) throw notFound();
  if (s.status === 'ANALYZING')
    throw new ApiError(409, 'SESSION_ANALYSIS_IN_PROGRESS', '문진 분석이 진행 중입니다.');
  if (s.status !== 'IN_PROGRESS')
    throw new ApiError(409, 'SESSION_NOT_ACTIVE', '현재 문진 세션에서 메시지를 처리할 수 없습니다.');

  if (!s.answered.has(clientMessageId)) {
    s.answered.add(clientMessageId);
    s.turn += 1;
  }

  if (RED_FLAGS.some((k) => message.includes(k))) {
    s.status = 'EMERGENCY';
    return { ...base(id, s), emergency_message: EMERGENCY_MESSAGE };
  }

  const next = QUESTIONS[s.turn - 1];
  if (next) return { ...base(id, s), next_question: next };

  s.status = 'ANALYZING';
  s.analyzeUntil = Date.now() + 3000;
  return base(id, s);
}

export async function getResult(id: string): Promise<ChatResult> {
  await sleep(300);
  const s = sessions.get(id);
  if (!s) throw notFound();
  if (s.status === 'ANALYZING' && Date.now() >= s.analyzeUntil) s.status = 'COMPLETED';

  if (s.status !== 'COMPLETED') {
    return { session_id: id, status: s.status, assessment_status: null };
  }
  return {
    session_id: id,
    status: 'COMPLETED',
    assessment_status: 'PRELIMINARY',
    analysis_source: '(목업)',
    symptom_summary: '(목업) 입력된 증상을 정리한 예시입니다.',
    suspected_diseases: [
      { disease_name: '(예시) 질환 A', reason: '(목업) 입력한 증상 일부와 연관된 예시 설명입니다.' },
      { disease_name: '(예시) 질환 B', reason: '(목업) 함께 검토한 예시 설명입니다.' },
    ],
    recommended_department: '내과',
    references: ['(목업) 건강정보 예시 문서 - 예시 기관'],
    medical_disclaimer: '이 결과는 AI 기반 임시 안내이며 의학적 진단이 아닙니다. 정확한 판단은 의료진의 진료를 받아야 합니다.',
    failure_code: null,
  };
}

/* ── 병원 ── */

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
const week = (open: string, close: string, sat?: [string, string], sun?: [string, string]): OpenHours[] =>
  DAYS.map((d) => {
    const t = d === 'SATURDAY' ? sat : d === 'SUNDAY' ? sun : [open, close];
    return t
      ? { day_of_week: d, open_time: t[0], close_time: t[1], is_closed: false }
      : { day_of_week: d, open_time: null, close_time: null, is_closed: true };
  });

// 좌표 오프셋은 검색 중심 기준. 이름·전화·주소는 지어낸 예시.
const HOSPITALS: (Omit<Hospital, 'latitude' | 'longitude' | 'department' | 'departments' | 'is_open'> & {
  dLat: number;
  dLng: number;
  depts: string[];
})[] = [
  { hospital_id: 'mock_001', name: '(예시) 가나의원', depts: ['내과', '가정의학과'], open_hours: week('09:00', '19:00', ['09:00', '13:00']), dLat: 0.0025, dLng: -0.003, phone: '02-000-0001', address: '예시시 예시구 예시로 1', distance_km: 0.42 },
  { hospital_id: 'mock_002', name: '(예시) 다라365의원', depts: ['내과', '외과', '이비인후과'], open_hours: week('08:30', '21:00', ['09:00', '18:00'], ['10:00', '16:00']), dLat: -0.004, dLng: -0.008, phone: '02-000-0002', address: '예시시 예시구 예시로 2', distance_km: 0.98 },
  { hospital_id: 'mock_003', name: '(예시) 마바외과', depts: ['외과', '정형외과'], open_hours: week('09:00', '18:00'), dLat: -0.0035, dLng: 0.004, phone: null, address: '예시시 예시구 예시로 3', distance_km: 1.35 },
  { hospital_id: 'mock_004', name: '(예시) 사아응급의료센터', depts: ['응급의학과'], open_hours: week('00:00', '24:00', ['00:00', '24:00'], ['00:00', '24:00']), dLat: 0.0075, dLng: 0.013, phone: '02-000-0119', address: '예시시 예시구 예시로 4', distance_km: 1.72 },
  // 평일 오전만 여는 곳: 오후·주말에 "진료 중 0건 → 진료 시간 안내"를 확인하기 위한 예시
  { hospital_id: 'mock_005', name: '(예시) 자차소아청소년과의원', depts: ['소아청소년과', '이비인후과'], open_hours: week('09:00', '12:00'), dLat: 0.003, dLng: 0.006, phone: '02-000-0005', address: '예시시 예시구 예시로 5', distance_km: 0.75 },
];

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** 목업용 단순 판정(자정 넘김 없음). 실제 판정은 서버가 한다 */
function mockIsOpen(hours: OpenHours[], d = new Date()): boolean {
  const today = hours.find((o) => o.day_of_week === DAYS[(d.getDay() + 6) % 7]);
  if (!today || today.is_closed || !today.open_time || !today.close_time) return false;
  const m = d.getHours() * 60 + d.getMinutes();
  return toMin(today.open_time) <= m && m < toMin(today.close_time);
}

export async function getOpenHospitals(q: HospitalQuery): Promise<HospitalList> {
  await sleep(500);
  const asked = [...new Set(q.department.split(',').map((d) => d.trim()).filter(Boolean))];
  const hospitals: Hospital[] = HOSPITALS.filter((h) => h.distance_km <= q.radius_km)
    .map(({ dLat, dLng, depts, ...h }) => {
      const matched = asked.filter((d) => depts.includes(d));
      return {
        ...h,
        latitude: q.latitude + dLat,
        longitude: q.longitude + dLng,
        department: matched[0] ?? '',
        departments: matched,
        is_open: mockIsOpen(h.open_hours),
      };
    })
    .filter((h) => h.departments.length > 0)
    // open_now=true 면 진료 중인 곳만, false 면 반경 안 모든 곳. 진료 중 먼저, 그다음 가까운 순 (명세 v1.1)
    .filter((h) => !q.open_now || h.is_open)
    .sort((a, b) => Number(b.is_open) - Number(a.is_open) || a.distance_km - b.distance_km);
  return { as_of: now(), source_updated_at: null, total_count: hospitals.length, hospitals };
}

/* ── 복약 ── */

export async function scanMedication(_file: File): Promise<MedicationScan> {
  await sleep(1200);
  return {
    status: 'NEEDS_CONFIRMATION',
    identified_count: 2,
    uncertain_count: 1,
    medications: [
      {
        item_seq: 'mock_seq_1',
        name: '(예시) 예시정A 500mg',
        guidance_status: 'AVAILABLE',
        warning: null,
        // 목업에는 음성 파일이 없어 브라우저 음성으로 대체되는 경우를 보여 준다
        audio_status: 'NOT_GENERATED',
        audio_url: null,
        description: {
          purpose: '(목업) 효능을 쉽게 풀어 쓴 예시 설명이 들어갈 자리예요.',
          how_to_take: '(목업) 허가된 일반 용법 예시입니다.',
          precautions: '(목업) 주의할 점 예시입니다.',
          side_effects: '(목업) 부작용 예시입니다.',
          storage: '(목업) 보관 방법 예시입니다.',
        },
      },
      {
        item_seq: 'mock_seq_2',
        name: '(예시) 예시정B 100mg',
        guidance_status: 'PARTIAL',
        warning: '(목업) 일부 정보만 확인되어 약사에게 한 번 더 확인하세요.',
        audio_status: 'NOT_GENERATED',
        audio_url: null,
        description: { purpose: '(목업) 효능 예시입니다.', how_to_take: null, precautions: null, side_effects: null, storage: null },
      },
    ],
    uncertain_medications: [
      {
        recognized_name: '알수없는약',
        reason: '(목업) 이름과 맞는 약을 찾지 못했어요.',
        action_message: '(목업) 약 이름이 잘 보이게 다시 찍거나 약사에게 물어보세요.',
      },
    ],
  };
}
