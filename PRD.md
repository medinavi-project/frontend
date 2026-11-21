# 메디나비 PRD (프론트엔드)

> 출처: 「AI 증상 상담·복약 안내 서비스 기술문서」(2026-11-20), Notion「MediNavi — Backend API Documentation」(2026-11-20 개정, 계약 상태 Review).
> 이 문서는 프론트엔드가 맡는 범위만 정리합니다. 백엔드·인프라·데이터 파이프라인은 다른 조원 담당이며, 이 저장소에는 없습니다.

## 1. 한 줄 요약

대화형 문진으로 증상을 구체화하고, 공공데이터 3종을 근거로 **진료과 → 지금 문 연 병원 → 복약 안내**까지 한 번에 잇는 웹 서비스.

## 2. 해결하려는 문제

| 문제 | 프론트에서의 대응 |
| --- | --- |
| 내 증상에 맞는 진료과와 지금 문 연 병원을 찾기 어렵다 | 문진 결과에서 바로 "지금 문 연 병원" 지도로 연결 |
| 짧은 입력("배가 아파요")만으로는 정확도가 낮다 | 서버가 묻는 다중 턴 문진, 선택형 질문은 답변 버튼으로 |
| 약봉투 안내문은 고령층·시각 약자가 이해하기 어렵다 | 쉬운 설명, 큰 글씨, 음성 안내 |
| 의료 생성형 AI는 할루시네이션 위험이 크다 | 참고 자료(출처) 노출, "진단이 아닌 진료 안내" 상시 고지 |

## 3. 대상 사용자

- **주 사용자**: 고령층, 시각 약자. 타이핑과 작은 글씨에 어려움이 있음.
- **부 사용자**: 증상에 맞는 병원을 급히 찾는 일반 성인, (3단계) 외국인.
- 설계 기준: 본문 18px(글자 크게 21px), 터치 영역 44px 이상, 대비 4.5:1 이상, 항상 흰 배경.

## 4. 핵심 기능

### F1. 대화형 증상 문진 (`/chat`)
- 첫 증상을 받아 세션을 만든다(`initial_symptom`). 홈에서 입력했으면 바로 시작하고, 아니면 채팅 화면에서 먼저 묻는다. 첫 증상은 세션 생성에서만 보내고 메시지 API로 다시 보내지 않는다.
- 이후 질문은 **서버가 하나씩 내려준다**(`next_question`). 프론트는 질문을 고르거나 슬롯을 판단하지 않는다.
  - `answer_type=SINGLE_CHOICE`면 `options`를 답변 버튼으로 보여 준다. 직접 입력도 가능하다.
  - 답변은 `question_id`와 함께 보낸다. 같은 질문·같은 답변은 서버가 중복 처리하지 않으므로, 전송 실패 시 입력을 되돌려 사용자가 직접 다시 보낸다(자동 재전송 없음).
- 문진 상태(`data.status`)별 화면:

  | 상태 | 화면 |
  | --- | --- |
  | `IN_PROGRESS` | 다음 질문 표시, 입력 받기 |
  | `ANALYZING` | 입력 잠금, "결과를 정리하고 있어요". 서버가 준 `retry_after_seconds` 간격으로 결과 조회, **최대 60초** 후 멈추고 "결과 다시 확인하기" 버튼 |
  | `COMPLETED` | 결과 카드 |
  | `FAILED` | 실패 안내, "상담 다시 시작" |
  | `EMERGENCY` | `EmergencyBanner`에 서버 `emergency_guidance` 표시, 입력·분석·병원 검색 중단 |

- **위험 신호 판단은 서버**가 한다(`status=EMERGENCY`). 프론트는 키워드를 직접 판단하지 않는다.
- 진행 패널: 처음 말씀하신 증상, 답한 질문 수, 지금 단계.
- 결과 카드: 추천 진료과(큰 글씨), 평가 설명(`reason`), 의심되는 질환과 이유, 참고한 자료(기관·제목·링크), 서버 면책 문구(`medical_disclaimer`), "지금 문 연 ○○ 찾기" 버튼.
  - `assessment_status=INSUFFICIENT_EVIDENCE`이거나 질환 목록이 비면 "의심되는 질환을 말씀드리기 어려워요"로 안내한다(오류 아님).
  - `recommended_department`가 null이면 병원 찾기 버튼을 숨긴다.
- 세션은 30분(서버 Redis TTL) 뒤 만료된다. `SESSION_NOT_FOUND`면 새 상담을 안내한다.

### F2. 지금 문 연 병원 (`/hospitals`)
- 쿼리: `?dept=내과&dept=외과&radius_km=` (선택 `lat`, `lng`). 문진 결과에서 추천 진료과를 넘겨받아 기본으로 선택한다.
- **진료과는 여러 개 고를 수 있다.** 추천 진료과(예: 내과)가 기본으로 켜져 있고, 다른 진료과를 추가로 켜면 지도와 목록에 함께 보인다. 하나도 고르지 않으면 안내 문구만 보인다.
  - API는 진료과를 하나만 받으므로, 고른 진료과마다 요청해서 합친다. 같은 병원은 하나로 묶고 진료과를 함께 표시한다.
  - 일부 진료과만 실패하면 받은 결과는 보여 주고, 실패한 진료과와 "다시 찾기"를 안내한다.
- 거리 1·3·5km, `open_now=true`로 지금 진료 중인 곳만 요청한다.
- 화면에 들어오면 위치를 한 번 묻는다. 위치 권한이 없으면 **서울시청 기준으로 보여 주고 그 사실을 알린다.**
- 지도(NCP Maps Dynamic Map JS v3)와 목록을 번호로 연결한다. 서버 `as_of`를 "○○ 기준"으로 보여 준다.
- 병원 카드: 이름, 거리, 진료 중 표시와 오늘 종료 시각, 진료과, 주소, 전화 걸기(`tel:`, 번호가 없으면 "정보 없음").
- 결과 0건은 정상(오류 아님). 진료 중인 곳이 0건이면 같은 조건(진료과·거리)으로 `open_now=false`를 한 번 더 요청해 **지금은 진료 시간이 아닌 병원과 그 진료 시간**(오늘·요일별)을 보여 주고, 가기 전에 전화로 확인하라고 안내한다. 지도에서는 회색 테두리 핀으로 구분한다. 그것도 0건이면 거리·진료과 변경을 제안한다. 서버는 범위를 넓히지 않는다(0건은 0건).
- 검색 실패는 오류와 "다시 찾기" 버튼으로 구분한다.
- 모든 병원 카드에서 "요일별 진료 시간"을 펼쳐 볼 수 있다(서버 `open_hours`, 자정은 `24:00` 그대로).
- 지도에는 내 위치(또는 기본·선택 위치)와 병원 번호 핀이 함께 보이도록 범위를 맞춘다. 병원이 없으면 선택한 거리에 맞춰 보여 준다. 확대·축소 버튼은 직접 만든 큰 버튼을 쓴다.
- **주소로 찾기**: 위치 권한이 없거나 다른 동네를 보고 싶을 때 "주소로 찾기"를 누르면 다음 우편번호 서비스 화면이 열린다. 동네·도로·건물 이름을 치고 목록에서 고르면, 고른 주소(글자)를 SDK `geocoder`로 좌표로 바꿔 그 위치 기준으로 찾는다(키 없이 동작, 좌표 변환은 Client ID만 사용). 고른 주소는 저장하지 않고 좌표만 URL(`lat`, `lng`)에 담는다.
- 위치를 못 받으면 이유(권한 꺼짐·시간 초과·확인 불가·HTTPS 아님)와 해결 방법을 알리고 서울시청 기준으로 보여 준다. 동네 이름 표시(Reverse Geocoding)는 확인되면 안내 문구에만 쓰고, 안 되면 생략한다.
- 지도 키가 없거나, 인증(키·등록 URL) 또는 로드에 실패하면 대체 약도를 보여 준다.

### F3. 약봉투 복약 안내 (`/medication`)
- 3단계: 사진 올리기 → 약 이름 확인 → 복약 안내.
- 업로드는 multipart 필드 `file` 한 장. 지원 형식·최대 크기는 미정(TBD)이라 프론트에서 제한하지 않는다.
- 약별 매칭 결과(`match_status`):
  - `MATCHED`: 미리 골라 두되 사용자가 확인한다.
  - `AMBIGUOUS`: 후보(약 이름·제조사) 중 직접 고른다. 고르기 전에는 안내를 만들 수 없다.
  - `NOT_FOUND`: "맞는 약을 찾지 못해 안내에서 뺐어요"(오류 아님).
  - 모든 약에서 "이 중에 없어요"로 뺄 수 있다.
- 사용자가 고른 `item_seq`만 복약 안내 API로 보낸다.
- 약별 카드: 쉬운 설명(`summary`) / 자세한 공식 정보(효능·먹는 법·주의사항 목록·출처). 두 영역을 나눠 보여 준다.
- 음성: 약별 `audio_status=READY`이고 `audio_url`이 있을 때 재생한다. 없으면 **임시로** 브라우저 음성 합성으로 읽어 준다(네이버 클라우드 CLOVA Voice 적용 후 제거, 9-3).

### 공통 (모든 화면)
- 하단 고정 문구: **"의학적 진단이 아닌 진료 안내입니다."** (기술문서 2-5)
- 상단 "응급 119" 버튼, "글자 크게" 토글, 본문 건너뛰기 링크.
- 모바일(≤720px)은 하단 탭바로 이동한다.
- 오류 문구는 서버 `message`를 그대로 보여 주고, 화면 분기는 `code`로 한다. 네트워크 오류는 프론트 문구를 쓴다.

## 5. 화면과 API 매핑

기준: Notion「MediNavi — Backend API Documentation」. 기본 경로 `/api/v1`.

| 화면 | 메서드·경로 | 요청 | 응답 `data` (주요 필드) |
| --- | --- | --- | --- |
| `/chat` | `POST /api/v1/chat/sessions` (201) | `{ initial_symptom }` | `session_id`, `status`, `turn_count`, `next_question` |
| `/chat` | `POST /api/v1/chat/sessions/{id}/messages` (200 / 비동기 분석 접수 시 202) | `{ question_id, message }` | `status`, `turn_count`, `assistant_message`, `next_question`, `emergency_guidance`, `retry_after_seconds` |
| `/chat` | `GET /api/v1/chat/sessions/{id}/result` | - | `status`, `assessment_status`, `result{ suspected_diseases, recommended_department, reason, references, medical_disclaimer }`, `retry_after_seconds` |
| `/hospitals` | `GET /api/v1/hospitals/open` | `department, latitude, longitude, radius_km, open_now` (모두 필수) | `as_of`, `total_count`, `hospitals[]{ hospital_id, name, address, latitude, longitude, department, phone, open_hours[], is_open, distance_km }` |
| `/medication` | `POST /api/v1/medications/scan` | multipart `file` | `recognized_text`, `medications[]{ item_seq, item_name, match_status, candidates[] }` |
| `/medication` | `POST /api/v1/medications/guide` | `{ medications: [{ item_seq }] }` | `medications[]{ efficacy, usage, cautions[], official_source, summary, audio_status, audio_url }` |

- 모든 응답은 `{ code, message, data }`. `src/api/client.ts`가 `data`만 꺼내고, 실패(4xx/5xx)는 `ApiError(status, code, message, fieldErrors, data)`로 던진다.
- 문진 진행 상태(`data.status`)는 HTTP status·응답 `code`와 별개다.
- 코드의 기준 타입은 `src/api/types.ts`다. 백엔드 계약이 바뀌면 이 파일부터 맞춘다.

## 6. 비기능 요구사항

- **접근성**: 키보드만으로 모든 기능 사용 가능, 보이는 포커스, 화면 낭독기용 라벨, `prefers-reduced-motion` 존중, 정보를 색만으로 전달하지 않음.
- **안전**: 응급 안내가 최우선. 진단처럼 보이는 표현 금지. 근거 없는 내용을 보여 주지 않음.
- **개인정보**: 대화 로그에 개인 식별 정보를 저장하지 않는다(서버 정책). 프론트는 이름·연락처 등을 요구하지 않는다.
- **보안**: API 키·Client ID를 코드에 넣지 않는다. 환경변수 사용.
- **반응형**: 1440 / 1024 / 768 / 390px에서 가로 스크롤 없음.
- **성능**: 외부 스크립트는 지도 SDK와 주소 검색(다음 우편번호 서비스, 주소 검색을 열 때만 로드), 글꼴 1종.

## 7. 범위 밖, 기술문서·API 문서와 다르게 구현한 부분

### 7-1. 범위 밖 (이 저장소에서 하지 않음)
- FastAPI 서버, RAG, CLOVA 호출, DB, 공공데이터 수집·적재, 인프라(VPC 등).

### 7-2. 다르게 구현한 부분
| 항목 | 문서 | 이 저장소 | 이유 |
| --- | --- | --- | --- |
| 화면 구현 | 기술문서·API 문서: Streamlit | React + Vite | 팀 합의. 바뀌면 이 문서를 먼저 고친다 |
| 문진 진행 표시 | 기술문서 2-2: 슬롯 7종 진행 패널, 최대 5턴 | 처음 증상·답한 질문 수·단계만 표시 | API 응답에 슬롯 정보가 없고 최대 턴은 TBD |
| 강도 0~10 버튼·슬롯별 빠른 답변 | 기술문서(초기 화면 설계) | 제거. 서버 `options`만 버튼으로 표시 | 프론트가 질문 종류를 판단하지 않기 위함 |
| 결과 없을 때 확대 검색 | 초기 PRD: 서버가 응급실·가정의학과로 넓힘(`widened`) | 서버 확대 없음. 진료 중 0건이면 프론트가 `open_now=false`로 다시 요청해 진료 시간이 아닌 병원과 진료 시간을 안내 | API 계약에 대체 병원 자동 반환이 없음. 사용자 결정(2026-11-21). `open_now=false` 의미를 Notion 5.2에 추가 |
| 위치 권한 거부 시 | API 문서 5.7: 권한이 허용된 경우에만 좌표 전달 | 서울시청 좌표로 검색하고 화면에 알림 | 사용자 결정. 권한이 없어도 병원을 볼 수 있게 |
| 주소 입력 위치 지정 | API 문서에 없음(5.7은 `latitude`·`longitude`만 받음) | 다음 우편번호 서비스로 주소를 고르고, 지도 SDK `geocoder`로 좌표를 구한 뒤 기존 좌표 쿼리로 요청 | 사용자 결정. 위치 권한이 없는 고령 사용자도 동네 이름으로 위치를 정할 수 있게. 백엔드 API 변경 없음. REST 지오코딩(Client Secret)은 프론트에서 쓰지 않는다. 외부 서비스(카카오) 스크립트가 하나 늘어난다 |
| 진료과 선택 | API 문서: `department` 하나(필수) | 여러 개 선택, 진료과마다 요청해 합침 | 사용자 결정. 추천 진료과 외 다른 과도 함께 보기 위함. 백엔드가 복수 진료과를 지원하면 한 번 요청으로 바꾼다 |
| 분석 결과 대기 | API 문서: 폴링 최대 시간 TBD | 최대 60초 후 수동 확인 버튼 | 분석 작업이 멈췄을 때 무한 대기 방지. 실측 후 조정 |
| 음성 안내 대체 | API 문서: READY일 때만 재생, 아니면 음성 없음 | READY가 아니면 브라우저 음성 합성 | 고령 사용자 배려. CLOVA Voice 적용 시 제거 |

## 8. 미확정 사항 (백엔드 계약 TBD)

확정되면 해당 코드와 이 표를 함께 고친다.

| 항목 | 프론트 영향 | 현재 처리 |
| --- | --- | --- |
| 인증·세션 소유권 | 요청 헤더 `Authorization` | 보내지 않음 |
| 운영·테스트 URL | `VITE_API_BASE_URL` | 비우면 `/api/v1` 프록시 |
| 최대 문진 턴 | 진행 표시 | 표시하지 않음 |
| 분석 비동기 여부·폴링 간격·최대 대기 | Chat `ANALYZING` | 서버 `retry_after_seconds`(없으면 2초), 최대 60초 |
| Idempotency-Key 지원 | 메시지 재전송 | 자동 재전송 안 함 |
| 입력 길이 제한 | 증상·답변 입력 | 제한 없음, 서버 검증 오류 메시지 표시 |
| 병원 반경 허용 범위, 진료과 표준값 | 거리·진료과 선택지 | 1·3·5km, 진료과 10종 고정 목록 |
| 복수 진료과 검색 지원 | 진료과 여러 개 선택 시 요청 수 | 진료과마다 1회씩 요청 (진료 중 0건이면 `open_now=false`로 진료과마다 1회 더) |
| 공휴일 진료 시간 | `open_hours`는 요일별만 있음 | 표시하지 않음. 서버 `is_open`만 따름 |
| 이미지 형식·최대 크기 | 업로드 | `accept="image/*"`만, 크기 제한 없음 |
| 음성 URL 만료·형식 | `<audio>` | 받은 URL 그대로 재생 |

## 9. 로드맵

| 버전 | 내용 | 상태 |
| --- | --- | --- |
| v1 | 틀·디자인, 목업 데이터로 3개 흐름 동작 | 완료 |
| v1.1 | 백엔드 API 계약(Notion) 반영: envelope·상태별 문진·새 DTO, 목업을 새 계약 형태로 교체 | 완료 |
| v1.2 | 실제 백엔드 연결 확인, **목업 제거**(10장), 지도 키 적용, CLOVA Voice 적용 | 예정 |
| v2 | TBD 항목 확정 반영(인증, 최대 턴, 업로드 제한 등) | 예정 |
| v3 | 음성 증상 입력(CLOVA Speech), 다국어(Papago), 복약 알림 | 계획 |

## 10. 목업 데이터 (임시)

백엔드 연동 전 화면 개발용이다. **실제 서비스에 넣지 않는다.**
병원·약·질환 정보는 "(예시)", "(목업)"을 붙인 지어낸 값이며 실제 의료 정보가 아니다.
응답 모양은 `src/api/types.ts`(백엔드 계약)를 그대로 따르므로, 목업에서 동작하면 실제 백엔드에서도 같은 화면 흐름이 나와야 한다.

### 10-1. 목업이 있는 곳

| 위치 | 내용 |
| --- | --- |
| `src/api/mock.ts` | 목업 본체. 고정 질문 4개(선택형 포함), 목업 전용 응급 키워드, 분석 3초 대기(ANALYZING), 결과, 병원 4곳, 약 후보(MATCHED·AMBIGUOUS·NOT_FOUND), 복약 안내 |
| `src/api/client.ts` | `USE_MOCK` 상수, `sleep` (목업 전용) |
| `src/api/index.ts` | 각 API 함수 첫 줄의 `if (USE_MOCK) return mock.…` 6곳, `import * as mock` |
| `.env.local`, `.env.example` | `VITE_USE_MOCK` 항목 |
| `src/vite-env.d.ts` | `VITE_USE_MOCK` 타입 선언 |
| `README.md` | 환경변수 표의 `VITE_USE_MOCK` 행 |

### 10-2. 제거 절차

1. `src/api/mock.ts` 삭제.
2. `src/api/index.ts`에서 `import * as mock from './mock'`, `USE_MOCK` import, 각 함수의 `if (USE_MOCK) …` 줄 6개 삭제.
3. `src/api/client.ts`에서 `USE_MOCK` 상수와 `sleep` 삭제.
4. `.env.local`, `.env.example`, `src/vite-env.d.ts`, `README.md`에서 `VITE_USE_MOCK` 삭제.
5. `npm run build`로 타입 오류가 없는지 확인한 뒤, `grep -rni "mock" src` 결과가 비어 있는지 확인.

### 10-3. 목업은 아니지만 임시 성격인 것 (제거 시 같이 검토)

| 위치 | 내용 | 판단 |
| --- | --- | --- |
| `src/pages/Home.tsx`의 `ConversationPreview` | 홈의 상담 예시 카드(하드코딩) | 실제 데이터가 아닌 **설명용 예시**. 유지하되 숫자가 사실처럼 보이지 않게 주의 |
| `src/components/NaverMap.tsx`의 `FallbackMap` | 지도 키 없을 때 약도 | 목업 아님. 개발·장애 시 대체 화면이라 유지 |
| `src/pages/Medication.tsx`의 `TtsPlayer` 브라우저 음성 합성 | 서버 음성이 없을 때 대체 | **CLOVA Voice 적용 후 제거** |
| `src/pages/Chat.tsx`의 `POLL_LIMIT_MS`(60초) | 분석 결과 최대 대기 | 백엔드 실측 후 조정 |
| `src/pages/Hospitals.tsx`의 `DEPTS`, `RADII_KM` | 진료과·반경 선택지 | 백엔드 진료과 표준값·반경 범위 확정 시 맞춤 |
