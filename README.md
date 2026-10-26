# WRU

WRU는 WhereCtx 위에 얹는 협상 레이어입니다. 가족이 서로 좌표를 공유하지 않아도, 각자의 Muse Spark 에이전트가 WhereCtx의 거친 상태(home / near_home / in_transit, ETA)만 읽고 offer → counter → commit으로 할 일을 나눕니다.

Meta Global AI Developer Hackathon(2026-10-26 ~ 11-04) 출품작입니다. 기획과 범위는 [docs/PLAN.md](docs/PLAN.md)에 있습니다.

## 실행

Node 22 이상이 필요합니다.

```bash
npm install
npm run dev
```

- UI: http://localhost:5173/demo (Vite)
- API: http://localhost:8787/api (Hono). Vite가 `/api/*`를 이 서버로 넘깁니다.

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | API 서버와 UI를 함께 띄웁니다 |
| `npm run typecheck` | 타입 검사 |
| `npm test` | 계약 테스트와 누수 가드 (vitest) |
| `npm run build` | 타입 검사 후 UI 빌드 (`dist/web`) |
| `npm start` | 빌드된 UI와 API를 8787 포트 하나로 서빙 |

## 환경변수

`.env.example`을 `.env`로 복사해서 씁니다.

| 이름 | 설명 |
| --- | --- |
| `MODEL_API_KEY` | Meta Model API 키. Day2 Muse 연결 때 씁니다. 지금은 비워 둡니다 |
| `MODEL_API_BASE_URL` | 기본값 `https://api.meta.ai/v1` (OpenAI 호환) |
| `WRU_API_PORT` | API 서버 포트. 기본값 8787 |

## 구조 (Day1)

```
src/shared/contracts.ts        Presence · Task · 로그 계약과 금지 위치 키
src/server/sim/simulator.ts    가족 3명 시뮬레이터 (내부 거리 값은 모듈 밖으로 안 나감)
src/server/wherectx/adapter.ts WhereCtx 어댑터 인터페이스 (get_presence, get_eta, 상세 위치 거절)
src/server/wherectx/sim-adapter.ts  시뮬레이터 구현. 실제 WhereCtx MCP는 같은 인터페이스로 붙입니다
src/server/inbox.ts            태스크 인박스 (메모리)
src/server/app.ts              Hono API
src/web/                       /demo 페이지 (맵 · 인박스/로그 · 역할 배정)
tests/                         계약 테스트, 누수 가드
```

시뮬 시계는 17:30에서 시작합니다. 이때 엄마는 집, 아빠는 이동 중(약 20분), 형은 집 근처입니다. 상단 버튼으로 시계를 +1/+5/+10분 돌리거나, 재생(실제 1초 = 시뮬 1분)하거나, 리셋할 수 있습니다.

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/state` | 시계 · 3명 presence · 태스크 · 로그 |
| GET | `/api/presence`, `/api/presence/:id` | Presence 계약 (`person_id`, `state`, `eta_minutes`, `updated_at`) |
| GET | `/api/eta/:id` | ETA만 |
| GET | `/api/presence/:id?include=raw_coords` 등 | 좌표·상세 위치 요청은 403 거절 |
| GET | `/api/tasks`, `/api/tasks/:id` | 인박스 조회 |
| POST | `/api/tasks` | 태스크 투입 (`deadline`은 `"HH:MM"` 또는 ISO8601) |
| POST | `/api/tasks/hero` | "6시에 민아 픽업 + 우유" 투입 |
| POST | `/api/sim/advance` | `{ "minutes": 5 }`만큼 시계 진행 |
| POST | `/api/sim/reset` | 시계 · 인박스 · 로그 초기화 |

```bash
curl -X POST localhost:8787/api/tasks -H 'content-type: application/json' \
  -d '{"deadline":"18:00","subtasks":[{"id":"pickup","label":"민아 픽업"},{"id":"milk","label":"우유 사기"}],"constraints":{"max_subtasks_per_person":1}}'
```

## 프라이버시 원칙

좌표, 정확한 주소, 학교명은 API 응답 · 로그 · UI 어디에도 넣지 않습니다. `tests/leak.test.tsx`는 시뮬 시계를 70분 돌리면서 모든 API 응답과 UI 렌더 결과를 직렬화해 `lat`, `lng`, `latitude`, `longitude`, `coords`, 소수점 좌표 패턴이 0건인지 확인합니다. 위치 키가 들어 있는 태스크는 인박스가 받지 않습니다.

## 데모 6컷

1. 맵: 3명이 상태와 ETA로만 표시됩니다 (Day1 ✅)
2. 태스크 투입: "6시에 민아 픽업 + 우유"가 인박스에 들어옵니다 (Day1 ✅)
3. 협상 로그: offer → counter → commit (Day2)
4. 역할 통지: "아빠=픽업, 형=우유" (Day2)
5. 누수 컷: 적대 Muse의 추정 성공/실패율 (Day3)
6. 게이트 비교 (선택, Day3)
