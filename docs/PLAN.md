# WRU 개발 기획서

Meta Global AI Developer Hackathon용입니다. WhereCtx와 Muse Spark로, GPS 좌표 없이 가족 일을 조율하는 협상 레이어를 만듭니다.

## 목표와 데모

**한 줄:** 가족끼리 좌표를 공유하지 않습니다. 각자의 Muse 에이전트가 WhereCtx의 거친 상태만 읽고, offer → counter → commit으로 역할을 나눕니다.

**히어로 시나리오:** 저녁 6시, 태스크는 "민아 픽업 + 집에 우유"이고 참여자는 엄마·아빠·형 3명입니다. 결과로는 역할만 알립니다(예: 아빠=픽업, 형=우유). 좌표, 정확한 주소, 학교 위치는 UI·로그·에이전트 메시지에 절대 넣지 않습니다.

- **제품명:** WRU (WhereCtx negotiation layer)
- **기간:** 5일 (Day1~Day5)
- **제출:** Meta Global AI Developer Hackathon / Cerebral Valley
- **심사 매핑:**
  - Impact: 가족 일상
  - Tooling: Muse 협상
  - Demo: 6컷
  - Depth: 프로토콜과 누수 수치

## 시스템 구조

사람은 자기 Muse하고만 대화합니다. Muse는 WRU를 통해 다른 Muse와 협상하고, WhereCtx에서는 자기 presence/ETA만 읽습니다.

```
가족 3명 (엄마·아빠·형)
   │ 태스크 / 통지
Muse Spark ×3 (사람당 에이전트 1개)
   │ offer · counter · commit          │ get_presence / ETA
WRU (인박스 · 협상 · assignment)   WhereCtx (presence / ETA only)
   │ 협상 로그만                        ▲ 상태 주입
누수 테스트                          시뮬레이터
```

**원칙:**
- WhereCtx가 좌표를 주지 않으면 Muse도 모릅니다.
- WRU 로그에도 lat/lng, 정확한 주소, 학교명을 쓰지 않습니다.
- 누수 테스트는 이 로그만으로 집이나 학교를 추론할 수 있는지를 숫자로 보여 줍니다.

## 만들 모듈 (모두 Must)

1. **시뮬레이터**
   - 서울 경로를 따라 3명의 상태만 갱신합니다. 실제 GPS는 필요 없습니다.
   - 상태는 home / near_home / in_transit과 ETA(분)입니다.
2. **WhereCtx 어댑터**
   - `get_presence`, `get_eta`를 제공합니다.
   - home 반경 안이면 좌표와 상세 정보를 거절합니다.
   - 시뮬레이터와 실제 MCP 모두 같은 인터페이스를 씁니다.
3. **협상 엔진 (WRU 코어)**
   - 태스크 인박스, 라운드, offer/counter/commit/refuse를 처리합니다.
   - 용량 제약(한 사람이 태스크 두 개를 맡지 못하게 하는 옵션)을 둡니다.
4. **Muse 에이전트 ×3**
   - 각자 자기 WhereCtx만 호출하고 협상 메시지를 생성합니다.
   - Meta Muse Spark / Model API를 사용합니다.
5. **데모 UI**
   - 맵(상태만 표시, 핀 없음), 협상 타임라인, 최종 assignment를 보여 줍니다.
   - 선택: 사람 승인 1회.
6. **누수 테스트**
   - 협상 로그를 적대적 Muse에 주고 집/학교를 추정하게 한 뒤 성공/실패율을 리포트합니다.
   - 게이트 on/off를 비교하면 가산점입니다.

## 데이터 계약

에이전트는 아래 스키마를 깨지 않습니다. 필드는 추가할 수 있지만, 좌표나 정확한 주소 필드는 금지합니다.

### Presence

| 필드 | 타입 | 규칙 |
| --- | --- | --- |
| person_id | string | mom \| dad \| sibling |
| state | enum | home \| near_home \| in_transit \| unknown |
| eta_minutes | number \| null | 도착까지 남은 분. home이면 null |
| updated_at | ISO8601 | 시뮬레이터 시계 기준 |
| raw_coords | — | 응답에 포함 금지. 요청하면 refuse |

### Task

| 필드 | 예시 |
| --- | --- |
| task_id | t_pickup_milk_001 |
| deadline | 오늘 18:00 (로컬) |
| subtasks | [{id:pickup, label:민아 픽업}, {id:milk, label:우유 사기}] |
| constraints | 한 사람이 두 subtask를 동시에 맡지 않음 (Should) |

### Negotiation message

| type | 필수 필드 | 금지 |
| --- | --- | --- |
| offer | from, subtask_id, reason(상태 기반) | 좌표·주소·학교명 |
| counter | from, subtask_id, alternative, reason | 동일 |
| commit | from, subtask_id | 동일 |
| refuse | from, subtask_id, reason_code | 상세 위치 설명 |

- **reason_code 예:** busy_in_transit | near_home_unavailable | already_assigned | capacity_full
- **거절 문구:** 템플릿(예: "지금은 이동 중, ETA만")만 허용합니다 (Should).

### Assignment

| 필드 | 예시 |
| --- | --- |
| task_id | t_pickup_milk_001 |
| assignments | [{subtask:pickup, person:dad}, {subtask:milk, person:sibling}] |
| notify | 사람별로 자기 역할만 표시 |

## 범위

**Must**
- 시뮬레이터 3명 + presence/ETA
- WhereCtx 어댑터 + home 근처 거절
- offer / counter / commit / refuse
- Muse ×3 + 태스크 인박스
- 데모 UI 3면(맵·로그·assignment)
- 누수 테스트 + 성공률 숫자

**Should** (시간이 되면)
- 거절 이유 템플릿
- 용량 제약
- 커밋 후 사람 승인 1회
- 게이트 on/off 누수 비교

**Cut** (하지 말 것)
- 오픈웨이트 셀프호스팅
- 실제 가족 온보딩, 카카오톡 봇
- 예쁜 지도 다듬기, 다국어
- 푸시 앱, 계정 시스템
- 픽업 외 심부름 10종

## 데모 스크립트 수락 기준

라이브 시연이나 영상으로 2~3분입니다. 아래 6컷이 끊기지 않으면 Day4 완료입니다.

1. **맵 (상태만):** 3명이 home / near_home / in_transit(~20분)로만 표시됩니다. 핀과 좌표는 없습니다.
2. **태스크 투입:** "6시에 민아 픽업 + 우유"가 인박스에 들어옵니다.
3. **협상 로그:** 각 Muse가 offer → counter → commit을 주고받고, 타임라인에 메시지 type이 보입니다.
4. **역할 통지:** "아빠=픽업, 형=우유"처럼 assignment만 보여 줍니다. 위치 정보는 없습니다.
5. **누수 컷:** 같은 로그를 적대 Muse에 주고 집/학교를 추정하게 한 결과(성공/실패율)를 한 장으로 보여 줍니다.
6. **게이트 비교 (선택):** 프라이버시 게이트를 끄면 추론이 쉬워진다는 것을 숫자로 대비합니다.

## 5일 빌드 순서

| Day | 할 일 | 수락 기준 |
| --- | --- | --- |
| Day1 뼈대 | 시뮬레이터 3명, WhereCtx 가짜 presence/ETA, 태스크 인박스. 맵에 상태만 표시하고 태스크를 넣을 수 있음 | 맵+인박스 |
| Day2 협상 | Muse×3로 offer→counter→commit. 로그 한 바퀴와 assignment(아빠 픽업/형 우유) | 협상 완료 |
| Day3 프라이버시 | home 근처 거절, 누수 테스트 리포트(가능하면 게이트 on/off) | 수치 1장 |
| Day4 데모 고정 | 6컷이 끊김 없이 이어짐. 2~3분 녹화 초안, 화면 문구 확정 | 영상 초안 |
| Day5 제출물 | 영상 다듬기, 1페이지 설명(문제·WhereCtx·Muse·수치), 제출 폼 | 제출 가능 |

## 에이전트 작업 지시

목표는 프로덕션 앱이 아니라, 심사관이 2~3분 안에 이해하는 데모입니다. Must만 완성하고 Should는 Day3 이후 여유가 있을 때만 합니다. Cut 항목은 이슈로도 만들지 않습니다.

1. **스택 선택**
   - 웹 데모를 우선합니다(단일 레포). UI는 맵 패널, 로그, assignment 세 영역이면 충분합니다.
   - Muse/Meta Model API 키가 있으면 실제로 호출합니다. 없으면 같은 스키마의 mock Muse로 Day2까지 진행하고 나중에 키를 연결합니다.
   - WhereCtx는 시뮬레이터 구현을 기본으로 하고, 실제 MCP는 같은 어댑터 뒤에 옵션으로 둡니다.
2. **레포 산출물**
   - README: 실행 방법, 데모 6컷, 환경변수
   - `/demo` 한 페이지에서 전체 플로우
   - `leak-report.md` 또는 UI 리포트 화면(성공률)
   - 샘플 협상 로그 JSON (좌표 필드 없음)
3. **품질 게이트**
   - 응답·로그·UI 문자열에서 lat/lng, 상세 도로명, 학교 고유명을 검색하면 0건이어야 합니다.
   - happy path: 태스크 1회 → assignment 2개 확정
   - 누수: 최소 N회(권장 20회 이상) 추정을 시도하고 성공률을 표기합니다.
4. **하지 말 것**
   - Cut 목록 기능, 인증/결제, 모바일 앱스토어 배포
   - 실사용자 PII 수집
   - 데모 외 시나리오 확장

**진행 원칙:**
- 질문이 생기면 이 기획서의 Must와 수락 기준을 우선합니다.
- 각 Day는 PR이나 데모 가능한 상태까지 맞춘 뒤 다음 Day로 넘어갑니다.
- 카피와 영상 문구는 제출자가 확인할 수 있게 Day4에 모아 둡니다.
