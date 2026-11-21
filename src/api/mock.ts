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
  MedicationGuide,
  MedicationGuideItem,
  MedicationScan,
  OpenHours,
  Question,
} from './types';

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

/* ── 문진 ── */

// 서버가 내려줄 질문을 흉내 낸 고정 목록
const QUESTIONS: Question[] = [
  { question_id: 'q_001', text: '언제부터 불편하셨어요?', answer_type: 'SINGLE_CHOICE', options: ['오늘부터', '어제부터', '2~3일 전부터', '일주일 넘게'] },
  { question_id: 'q_002', text: '아픈 곳이 정확히 어디인가요?', answer_type: 'TEXT', options: [] },
  { question_id: 'q_003', text: '0부터 10 중 몇 점 정도로 아프세요?', answer_type: 'SINGLE_CHOICE', options: ['1~3점', '4~6점', '7~8점', '9~10점'] },
  { question_id: 'q_004', text: '열이나 구토가 같이 있나요?', answer_type: 'SINGLE_CHOICE', options: ['열이 있어요', '토했어요', '둘 다 있어요', '없어요'] },
];

// 목업 전용 위험 신호 흉내. 실제 판단은 서버가 한다.
const RED_FLAGS = ['흉통', '가슴이', '숨이', '숨쉬기', '호흡', '의식', '기절', '마비', '피를 토'];
const EMERGENCY_GUIDANCE = '위험 신호가 감지되었습니다. 즉시 119 또는 가까운 응급실에 연락하세요.';

interface MockSession {
  status: ChatMessage['status'];
  turn: number;
  answered: Set<string>;
  analyzeUntil: number;
}
const sessions = new Map<string, MockSession>();

const notFound = () =>
  new ApiError(404, 'SESSION_NOT_FOUND', '문진 세션이 존재하지 않거나 만료되었습니다.');

const base = (id: string, s: MockSession) => ({
  session_id: id,
  status: s.status,
  turn_count: s.turn,
  next_question: null,
  result_available: s.status === 'COMPLETED',
  failure_code: null,
  emergency_guidance: null,
});

export async function createSession(_initialSymptom: string): Promise<ChatSession> {
  await sleep(400);
  const id = uuid();
  sessions.set(id, { status: 'IN_PROGRESS', turn: 0, answered: new Set(), analyzeUntil: 0 });
  return { session_id: id, status: 'IN_PROGRESS', created_at: now(), turn_count: 0, next_question: QUESTIONS[0] };
}

export async function sendMessage(id: string, questionId: string, message: string): Promise<ChatMessage> {
  await sleep(700);
  const s = sessions.get(id);
  if (!s) throw notFound();
  if (s.status === 'ANALYZING')
    throw new ApiError(409, 'SESSION_ANALYSIS_IN_PROGRESS', '문진 분석이 진행 중입니다.');
  if (s.status !== 'IN_PROGRESS')
    throw new ApiError(409, 'SESSION_NOT_ACTIVE', '현재 문진 세션에서 메시지를 처리할 수 없습니다.');

  if (!s.answered.has(questionId)) {
    s.answered.add(questionId);
    s.turn += 1;
  }

  if (RED_FLAGS.some((k) => message.includes(k))) {
    s.status = 'EMERGENCY';
    return {
      ...base(id, s),
      assistant_message: '위험 신호가 확인되어 문진을 중단합니다.',
      emergency_guidance: EMERGENCY_GUIDANCE,
    };
  }

  const next = QUESTIONS[s.turn];
  if (next) {
    return { ...base(id, s), assistant_message: '추가로 확인할 내용이 있어요.', next_question: next };
  }

  s.status = 'ANALYZING';
  s.analyzeUntil = Date.now() + 3000;
  return {
    ...base(id, s),
    assistant_message: '문진이 완료되어 결과를 분석하고 있어요.',
    retry_after_seconds: 2,
  };
}

export async function getResult(id: string): Promise<ChatResult> {
  await sleep(300);
  const s = sessions.get(id);
  if (!s) throw notFound();
  if (s.status === 'ANALYZING' && Date.now() >= s.analyzeUntil) s.status = 'COMPLETED';

  if (s.status !== 'COMPLETED') {
    return {
      session_id: id,
      status: s.status,
      assessment_status: null,
      result: null,
      retry_after_seconds: s.status === 'ANALYZING' ? 2 : null,
    };
  }
  return {
    session_id: id,
    status: 'COMPLETED',
    assessment_status: 'ASSESSED',
    result: {
      suspected_diseases: [
        { disease_name: '(예시) 질환 A', reason: '(목업) 입력한 증상 일부와 연관된 예시 설명입니다.' },
        { disease_name: '(예시) 질환 B', reason: '(목업) 함께 검토한 예시 설명입니다.' },
      ],
      recommended_department: '내과',
      reason: '(목업) 입력된 증상과 참고 정보를 비교한 예시 설명입니다.',
      references: [{ title: '(목업) 건강정보 예시 문서', organization: '예시 기관', url: 'https://example.invalid/reference' }],
      medical_disclaimer: '의심 질환은 확정 진단이 아니며, 증상이 지속되거나 악화되면 의료기관을 방문하세요.',
    },
    retry_after_seconds: null,
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
const HOSPITALS: (Omit<Hospital, 'latitude' | 'longitude' | 'department' | 'is_open'> & {
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
  const hospitals: Hospital[] = HOSPITALS.filter((h) => h.depts.includes(q.department) && h.distance_km <= q.radius_km)
    .map(({ dLat, dLng, depts: _d, ...h }) => ({
      ...h,
      latitude: q.latitude + dLat,
      longitude: q.longitude + dLng,
      department: q.department,
      is_open: mockIsOpen(h.open_hours),
    }))
    // open_now=true 면 진료 중인 곳만, false 면 반경 안 모든 곳 (계약 5.2)
    .filter((h) => !q.open_now || h.is_open);
  return { as_of: now(), source_updated_at: null, total_count: hospitals.length, hospitals };
}

/* ── 복약 ── */

export async function scanMedication(_file: File): Promise<MedicationScan> {
  await sleep(1200);
  return {
    scan_id: uuid(),
    recognized_text: '(목업) 예시정A 500mg / 예시정B / 알수없는약',
    medications: [
      {
        item_seq: 'mock_seq_1',
        item_name: '(예시) 예시정A 500mg',
        match_status: 'MATCHED',
        candidates: [{ item_seq: 'mock_seq_1', item_name: '(예시) 예시정A 500mg', manufacturer: '예시제약' }],
      },
      {
        item_seq: null,
        item_name: '예시정B',
        match_status: 'AMBIGUOUS',
        candidates: [
          { item_seq: 'mock_seq_2', item_name: '(예시) 예시정B 100mg', manufacturer: '예시제약' },
          { item_seq: 'mock_seq_3', item_name: '(예시) 예시정B 200mg', manufacturer: '샘플제약' },
        ],
      },
      { item_seq: null, item_name: '알수없는약', match_status: 'NOT_FOUND', candidates: [] },
    ],
  };
}

const guideOf = (item_seq: string, item_name: string): MedicationGuideItem => ({
  item_seq,
  item_name,
  efficacy: '(목업) 공식 효능 원문 자리입니다.',
  usage: '(목업) 공식 용법 원문 자리입니다. 실제로는 처방 지시를 따르세요.',
  cautions: ['(목업) 공식 주의사항 원문 자리입니다.'],
  official_source: { organization: '(목업) 예시 기관', url: null },
  summary: '(목업) 공식 정보를 쉽게 풀어 쓴 설명이 들어갈 자리예요.',
  audio_status: 'NOT_GENERATED',
  audio_url: null,
});

const GUIDE_NAMES: Record<string, string> = {
  mock_seq_1: '(예시) 예시정A 500mg',
  mock_seq_2: '(예시) 예시정B 100mg',
  mock_seq_3: '(예시) 예시정B 200mg',
};

export async function getGuide(itemSeqs: string[]): Promise<MedicationGuide> {
  await sleep(1000);
  const unknown = itemSeqs.find((s) => !GUIDE_NAMES[s]);
  if (unknown) throw new ApiError(404, 'MEDICATION_NOT_FOUND', '요청한 의약품 정보를 찾을 수 없습니다.');
  return { medications: itemSeqs.map((s) => guideOf(s, GUIDE_NAMES[s])) };
}
