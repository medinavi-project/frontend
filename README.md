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
| `VITE_USE_MOCK` | `true`면 백엔드 없이 목업 데이터로 동작 |
| `VITE_API_BASE_URL` | FastAPI 주소. 비우면 `/api` → `localhost:8000` 프록시 |
| `VITE_NCP_MAP_CLIENT_ID` | NCP Maps Client ID. 비우면 약도(대체 지도) 표시 |

## 화면

| 경로 | 화면 | 사용 API |
| --- | --- | --- |
| `/` | 홈: 증상 입력으로 바로 상담 시작 | - |
| `/chat` | 대화형 문진 (슬롯 진행 상황, 5턴, 위험 신호 응급 안내, 결과·근거 문서) | `POST /chat/sessions`, `POST /chat/sessions/{id}/messages`, `GET /chat/sessions/{id}/result` |
| `/hospitals` | 지금 문 연 병원 지도·목록 (`?dept=&lat=&lng=&radius=`) | `GET /hospitals/open` |
| `/medication` | 약봉투 촬영 → 약 확인 → 3줄 요약·음성 안내 | `POST /medication/scan`, `POST /medication/guide` |

모든 화면 하단에 "의학적 진단이 아닌 진료 안내" 문구가 고정됩니다.

## 구조

```
src/
  api/          types.ts(요청·응답 타입) · index.ts(엔드포인트) · mock.ts(목업)
  components/   Layout · Disclaimer · EmergencyBanner · NaverMap
  pages/        Home · Chat · Hospitals · Medication
  hooks/        useGeolocation
  utils/        hours.ts (진료시간 계산)
  styles/       global.css(디자인 토큰) · pages.css
```

API 응답 형태는 `src/api/types.ts`에 정의되어 있으니, 백엔드 스키마가 정해지면 이 파일만 맞추면 됩니다.
