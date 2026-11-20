// 백엔드 없이 화면을 개발하기 위한 목업. VITE_USE_MOCK=true 일 때만 사용.
import { sleep } from './client';
import type {
  ChatResult,
  CreateSessionRequest,
  CreateSessionResponse,
  DrugGuide,
  GuideResponse,
  Hospital,
  HospitalListResponse,
  HospitalQuery,
  OpenHours,
  ScanResponse,
  SendMessageResponse,
  SlotKey,
  Slots,
  Weekday,
} from './types';
import { MAX_TURNS } from './types';

const RED_FLAGS = ['흉통', '가슴이', '숨이', '숨쉬기', '호흡', '의식', '기절', '마비', '피를 토'];

const QUESTIONS: Record<SlotKey, string> = {
  main_symptom: '어디가 어떻게 불편하세요?',
  body_part: '아픈 곳이 정확히 어디인가요? 명치, 오른쪽 아래처럼 말씀해 주세요.',
  onset: '언제부터 아프셨어요?',
  severity: '0부터 10 중 몇 점 정도로 아프세요?',
  accompanying: '열, 구토, 설사가 같이 있나요?',
  region: '어느 동네 근처 병원을 찾으세요?',
  age_history: '나이대와 앓고 계신 질환이 있나요?',
};
const ORDER: SlotKey[] = ['main_symptom', 'body_part', 'onset', 'severity', 'accompanying', 'region'];

const sessions = new Map<string, { slots: Slots; turn: number }>();

export async function createSession(body: CreateSessionRequest): Promise<CreateSessionResponse> {
  await sleep(300);
  const id = `mock-${Date.now()}`;
  sessions.set(id, { slots: body.lat != null ? { region: '현재 위치' } : {}, turn: 0 });
  return { session_id: id, greeting: '안녕하세요. 어디가 어떻게 불편하세요?' };
}

export async function sendMessage(id: string, text: string): Promise<SendMessageResponse> {
  await sleep(700);
  const s = sessions.get(id) ?? { slots: {}, turn: 0 };
  s.turn += 1;
  sessions.set(id, s);

  if (RED_FLAGS.some((k) => text.includes(k))) {
    return {
      reply: '위험 신호일 수 있어요. 문진을 멈추고 지금 바로 119에 전화하거나 가까운 응급실로 가세요.',
      slots: { ...s.slots },
      turn_count: s.turn,
      red_flag: true,
      done: true,
    };
  }

  // 목업 규칙: 비어 있는 첫 슬롯에 답변을 그대로 채운다
  const next = ORDER.find((k) => !s.slots[k]);
  if (next) s.slots[next] = text;
  const remaining = ORDER.find((k) => !s.slots[k]);
  const done = !remaining || s.turn >= MAX_TURNS;

  return {
    reply: done ? '말씀해 주신 내용을 정리했어요. 아래에서 결과를 확인해 주세요.' : QUESTIONS[remaining!],
    slots: { ...s.slots },
    turn_count: s.turn,
    red_flag: false,
    done,
  };
}

export async function getResult(_id: string): Promise<ChatResult> {
  await sleep(900);
  return {
    summary: '어제부터 오른쪽 아랫배가 아픔(7점), 미열과 구토가 함께 있음',
    diseases: [
      { name: '충수염', reason: '오른쪽 아랫배 통증에 열과 구토가 함께 나타남' },
      { name: '급성 위장염', reason: '구토와 복통이 갑자기 시작됨' },
    ],
    department: '외과',
    region: '서울 중구',
    lat: 37.5636,
    lng: 126.9976,
    evidence: [
      {
        doc_id: 'kdca-0412',
        disease_name: '충수염',
        snippet: '배꼽 주위에서 시작해 오른쪽 아랫배로 옮겨가는 통증이 특징이며, 식욕부진·구역·발열이 동반될 수 있다.',
      },
      {
        doc_id: 'kdca-0187',
        disease_name: '급성 위장염',
        snippet: '구토, 설사, 복통이 갑자기 시작되며 대부분 수일 안에 좋아진다.',
      },
    ],
  };
}

const weekdays = (h: OpenHours, sat?: OpenHours, sun?: OpenHours) => {
  const r: Partial<Record<Weekday, OpenHours>> = { mon: h, tue: h, wed: h, thu: h, fri: h };
  if (sat) r.sat = sat;
  if (sun) r.sun = sun;
  return r;
};
const allDay: OpenHours = { start: '00:00', end: '24:00' };

const HOSPITALS: Hospital[] = [
  {
    hpid: 'A1',
    name: '을지로연합외과의원',
    departments: ['외과', '가정의학과'],
    open_hours: weekdays({ start: '09:00', end: '19:00' }, { start: '09:00', end: '13:00' }),
    lat: 37.5662,
    lng: 126.9925,
    tel: '02-000-0001',
    address: '서울 중구 을지로 00',
    distance_m: 420,
  },
  {
    hpid: 'A2',
    name: '명동365의원',
    departments: ['내과', '외과'],
    open_hours: weekdays({ start: '08:30', end: '21:00' }, { start: '09:00', end: '18:00' }, { start: '10:00', end: '16:00' }),
    lat: 37.5609,
    lng: 126.9858,
    tel: '02-000-0002',
    address: '서울 중구 명동길 00',
    distance_m: 980,
  },
  {
    hpid: 'A3',
    name: '충무로내과외과',
    departments: ['내과', '외과'],
    open_hours: weekdays({ start: '09:00', end: '18:00' }),
    lat: 37.5612,
    lng: 126.9942,
    tel: '02-000-0003',
    address: '서울 중구 충무로 00',
    distance_m: 1350,
  },
  {
    hpid: 'E1',
    name: '중앙응급의료센터',
    departments: ['응급의학과'],
    open_hours: { ...weekdays(allDay, allDay, allDay), hol: allDay },
    lat: 37.5673,
    lng: 127.0055,
    tel: '02-000-0119',
    address: '서울 중구 을지로 00',
    distance_m: 1720,
    is_emergency: true,
  },
];

export async function getOpenHospitals(q: HospitalQuery): Promise<HospitalListResponse> {
  await sleep(500);
  const list = q.dept
    ? HOSPITALS.filter((h) => h.departments.includes(q.dept!) || h.is_emergency)
    : HOSPITALS;
  return { hospitals: list, widened: false };
}

export async function scanMedication(_file: File): Promise<ScanResponse> {
  await sleep(1200);
  return {
    image_url: '',
    items: [
      {
        ocr_text: '타이레놀정500mg',
        candidates: [{ item_seq: '200000001', item_name: '타이레놀정500밀리그람', score: 0.97 }],
      },
      {
        ocr_text: '무코스타정',
        candidates: [
          { item_seq: '200000002', item_name: '무코스타정(레바미피드)', score: 0.81 },
          { item_seq: '200000003', item_name: '무코란정', score: 0.62 },
        ],
      },
    ],
  };
}

const GUIDES: Record<string, DrugGuide> = {
  '200000001': {
    item_seq: '200000001',
    item_name: '타이레놀정500밀리그람',
    summary: [
      '열을 내리고 통증을 줄여 주는 약이에요.',
      '한 번에 1~2알, 4~6시간 간격으로 드세요.',
      '하루 8알을 넘기지 말고, 술과 함께 드시지 마세요.',
    ],
    efficacy: '감기로 인한 발열 및 동통, 두통, 치통, 근육통 등',
    usage: '만 12세 이상: 1회 1~2정씩 1일 3~4회(4~6시간 간격)',
    caution: '매일 세 잔 이상 술을 마시는 사람은 의사·약사와 상의',
    interaction: '다른 아세트아미노펜 함유 제품과 함께 복용하지 마세요.',
  },
  '200000002': {
    item_seq: '200000002',
    item_name: '무코스타정(레바미피드)',
    summary: [
      '위 점막을 보호해 주는 약이에요.',
      '하루 세 번, 아침·저녁·자기 전에 한 알씩 드세요.',
      '두드러기나 가려움이 생기면 복용을 멈추고 문의하세요.',
    ],
    efficacy: '위궤양, 급성 위염 및 만성 위염의 급성 악화기 위점막 병변 개선',
    usage: '1회 1정, 1일 3회 아침·저녁 및 취침 전 복용',
    caution: '임부 또는 수유부는 의사와 상의',
    interaction: '보고된 주요 상호작용 없음',
  },
  '200000003': {
    item_seq: '200000003',
    item_name: '무코란정',
    summary: ['(목업) 가래를 묽게 하는 약이에요.', '정해진 횟수대로 드세요.', '이상 반응이 있으면 약사와 상의하세요.'],
    efficacy: '(목업)',
    usage: '(목업)',
    caution: '(목업)',
    interaction: '(목업)',
  },
};

export async function getGuide(itemSeqs: string[]): Promise<GuideResponse> {
  await sleep(1000);
  return { guides: itemSeqs.map((s) => GUIDES[s]).filter(Boolean), tts_url: null };
}
