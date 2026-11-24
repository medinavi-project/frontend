# MediNavi FE

AI 증상 상담·복약 안내 서비스 프론트엔드 (React + Vite + TypeScript)

## 실행

```bash
npm install
cp .env.example .env.local   # 처음 한 번
npm run dev                  # http://localhost:5173
```

| 환경변수 | 설명 |
| --- | --- |
| `VITE_API_BASE_URL` | FastAPI 서버 주소(origin)만. 예: `http://10.0.0.5:8000`. 비우면 같은 출처의 `/api/v1` → 개발 서버가 팀 공용 백엔드(`vite.config.ts`의 `proxy` 대상)로 프록시 |
| `VITE_NCP_MAP_CLIENT_ID` | NCP Maps Client ID(지도·주소→좌표 변환). 비우면 약도(대체 지도) 표시, "주소로 찾기" 숨김. NCP 콘솔 Web 서비스 URL에 `http://localhost:5173` 등록 필요. Client Secret은 프론트에 넣지 않음 |

## 화면

| 경로 | 화면 | 사용 API |
| --- | --- | --- |
| `/` | 홈: 증상 입력으로 바로 상담 시작 | - |
| `/chat` | 대화형 문진 (서버 질문, 선택형 답변 버튼, 응급 안내, 분석 대기, 결과·참고 자료) | `POST /api/v1/chat/sessions`, `POST /api/v1/chat/sessions/{id}/messages`, `GET /api/v1/chat/sessions/{id}/result` |
| `/hospitals` | 지금 문 연 병원 지도·목록 (`?dept=내과&dept=외과&radius_km=`, 진료과 여러 개 선택 가능, 선택 `lat`·`lng`, "주소로 찾기"로 기준 위치 변경) | `GET /api/v1/hospitals/open` |
| `/medication` | 약봉투 촬영 → 약 확인 → 쉬운 설명·공식 정보·음성 안내 | `POST /api/v1/medications/scan`, `POST /api/v1/medications/guide` |

모든 화면 하단에 "의학적 진단이 아닌 진료 안내" 문구가 고정됩니다.

## 구조

```
src/
  api/          types.ts(요청·응답 타입) · index.ts(엔드포인트) · client.ts(envelope·오류)
  components/   Layout · Disclaimer · EmergencyBanner · NaverMap · AddressPicker · Icon
  pages/        Home · Chat · Hospitals · Medication · NotFound
  hooks/        useGeolocation
  utils/        hours.ts (진료시간·거리·시각 표시) · naverMaps.ts (지도 SDK·주소→좌표) · postcode.ts (주소 검색 화면)
  styles/       global.css(디자인 토큰) · pages.css
```

API 계약의 기준은 백엔드 Swagger(`/docs`)이고, 코드에서는 `src/api/types.ts`가 그것을 옮긴 것입니다.
모든 응답은 `{ code, message, data }` 형태이며 `client.ts`가 `data`만 꺼내 줍니다. 실패하면 `ApiError`(`code`로 분기)를 던집니다.
