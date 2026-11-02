// 영상 내레이션 · 자막 원본. docs/VIDEO_SCRIPT.md의 대본과 같은 문장을 쓴다.
// 각 구간은 화면 동작(scene: 인트로 · 아웃트로 카드, step: 데모 모드 컷)과 문장 목록으로 되어 있다.
// 문장 하나가 자막 한 줄이 되고, 내레이션은 구간 문장을 이어 읽는다.

/** 내레이션 한 문장 = 자막 한 줄 */
export interface Line {
  text: string;
  /** 이 문장을 읽는 동안 화면에서 강조할 대상 (DemoPage의 data-hl 키) */
  hl?: string;
  /** 협상 컷: 이 문장을 시작할 때까지 보여 줄 메시지 수 */
  reveal?: number;
  /** 이 문장을 읽은 뒤 화면에서 할 일 */
  after?: 'approve' | 'museShow';
}

export interface Segment {
  id: string;
  /** 대본 문서에 쓰는 컷 이름 · 화면 설명 · 겨냥하는 심사 항목 */
  title: string;
  screen: string;
  rubric: string;
  /** 인트로 · 아웃트로 카드. 없으면 데모 화면 */
  scene?: 'intro' | 'host' | 'outro';
  /** 이 구간에서 들어갈 데모 모드 컷 (0부터). 없으면 컷을 넘기지 않는다 */
  step?: number;
  lines: Line[];
  /** 내레이션이 끝난 뒤 더 머무를 초 */
  hold?: number;
}

const L = (text: string, opts: Omit<Line, 'text'> = {}): Line => ({ text, ...opts });

export const SEGMENTS: Segment[] = [
  {
    id: 'intro',
    title: '오프닝 카드',
    screen: '검은 카드: WRU · 보통의 위치 공유(지도에 핀) ↔ WRU(상태 칩)',
    rubric: 'Impact',
    scene: 'intro',
    lines: [
      L('"누가 민아 데리러 가?" 이걸 정하려고,'),
      L('가족 모두의 좌표를 하루 종일 서버에 올려야 할까요?'),
      L('WRU는 좌표 없이, 가족 각자의 AI 에이전트가 일을 나눕니다.'),
    ],
    hold: 0.3,
  },
  {
    id: 'phones',
    title: '1. 좌표 없는 지도',
    screen: '폰 3대 (엄마 집 · 아빠 이동 중 20분 · 형 집 근처), 문장마다 해당 폰 강조',
    rubric: 'Impact · Demo',
    step: 0,
    lines: [
      L('위치는 각자 자기 서버, WhereCtx에 둡니다.'),
      L('WRU가 받는 건 집, 집 근처, 이동 중 같은 거친 상태뿐.'),
      L('엄마는 집, 아빠는 이동 중 20분, 형은 집 근처입니다.', { hl: 'phones' }),
    ],
  },
  {
    id: 'boundary',
    title: '2. 내 토큰으로는 내 것만',
    screen: '토큰 경계표 5×3 (대각선만 200), 403 칸 강조',
    rubric: 'Technical Depth',
    step: 1,
    lines: [
      L('에이전트는 자기 토큰으로 자기 상태만 읽습니다.', { hl: 'diag' }),
      L('아빠 토큰으로 엄마 상태를 달라고 하면 403.', { hl: 'dad-mom' }),
      L('방금 서버에 보낸 실제 요청 15개의 결과입니다.'),
    ],
  },
  {
    id: 'task',
    title: '3. 태스크 투입',
    screen: 'WRU 바에 태스크(엄마가 낸 일), 폰마다 "가족 일" 알림',
    rubric: 'Demo',
    step: 2,
    lines: [L('저녁 6시까지 민아 픽업과 우유 사기.', { hl: 'hub' }), L('엄마가 낸 일이고, 한 사람은 한 가지만 맡습니다.', { hl: 'hub' })],
  },
  {
    id: 'negotiation',
    title: '4. Muse 3명의 협상',
    screen: '폰 3대 + Muse 채널. 메시지가 문장에 맞춰 라운드별로 나타남',
    rubric: 'Use of Meta AI Tooling · Demo',
    step: 3,
    lines: [
      L('에이전트 Muse는 Meta의 Muse Spark 모델을 부르도록 만들었고,', { reveal: 0 }),
      L('이 녹화에서는 같은 스키마의 mock이 모델 자리에서 답합니다.', { reveal: 0 }),
      L('첫 라운드엔 마감이 급한 픽업부터, 할 수 있는 사람이 모두 손을 듭니다.', { reveal: 3 }),
      L('밖에 있고 시간 여유가 있는 아빠가 적합도 높음.', { reveal: 3, hl: 'dad' }),
      L('엄마와 형은 우유로 바꾸고, 아빠가 픽업을 확정합니다.', { reveal: 6 }),
      L('집 근처라 들르기 쉬운 형에게 엄마가 양보합니다.', { reveal: 8, hl: 'sibling' }),
    ],
  },
  {
    id: 'muse',
    title: '5. Muse에게 가는 것',
    screen: 'Meta Model API 요청 본문(JSON) → 응답 JSON, "모델이 정함 / WRU가 정함"',
    rubric: 'Use of Meta AI Tooling · Technical Depth',
    step: 4,
    lines: [
      L('아빠의 Muse가 모델에 보내는 건 이게 전부입니다.', { hl: 'request' }),
      L('내 상태, ETA 구간, 마감까지 남은 분, 오간 메시지.', { hl: 'request', after: 'museShow' }),
      L('모델은 어느 일에 나설지와 적합도를 JSON으로 답하고,', { hl: 'response' }),
      L('WRU는 토큰과 스키마를 검사합니다.', { hl: 'split' }),
      L('모델이 위치를 섞어 써도, 로그에는 상태 템플릿만 나갑니다.', { hl: 'rewrite' }),
    ],
  },
  {
    id: 'roles',
    title: '6. 역할 통지',
    screen: 'WRU 바에 역할 → 엄마가 승인 → 폰마다 자기 역할 카드',
    rubric: 'Impact · Demo',
    step: 5,
    lines: [
      L('결과는 역할뿐입니다. 엄마가 한 번 승인하면,', { hl: 'hub', after: 'approve' }),
      L('아빠 폰엔 픽업, 형 폰엔 우유만 뜹니다.', { hl: 'roles' }),
    ],
  },
  {
    id: 'leak',
    title: '7. 로그로 집을 찾을 수 있을까?',
    screen: '게이트 on 카드: 로그 5종류 · 어떤 적대자든 상한 집 22% · 학교 24% (우연 4%), 규칙 기반 적대자 6% · 0%',
    rubric: 'Technical Depth',
    step: 6,
    lines: [
      L('이 로그만으로 집을 찾을 수 있을까요?'),
      L('집과 학교가 다른 시나리오 50개로, 서울 25개 구 중 어디인지 재 봤습니다.'),
      L('로그는 다섯 종류뿐이었습니다. 집이 달라도 로그가 같다는 뜻입니다.', { hl: 'logs' }),
      L('그래서 정답을 미리 알고 골라도 최대 집 22퍼센트, 학교 24퍼센트.', { hl: 'bound' }),
      L('"이동 중, 20분 이내" 같은 상태 자체가 주는 몫이라, 상태를 나누는 한 줄일 수 없습니다.', { hl: 'bound' }),
      L('로그에서 단서를 찾는 규칙 기반 적대자는 실제로 집 6퍼센트, 학교 0퍼센트를 맞혔습니다.', { hl: 'actual' }),
    ],
  },
  {
    id: 'gate',
    title: '8. 위치를 알아도 같은 로그',
    screen: '카드 3장: 위치를 알 때(가운데) · 게이트 on · 게이트 off 98% · 72%, 상한 100%',
    rubric: 'Technical Depth',
    step: 7,
    lines: [
      L('가운데는 에이전트에게 위치를 몰래 쥐여 준 경우입니다.', { hl: 'card-filter_only' }),
      L('그래도 로그는 게이트 on과 글자 하나 다르지 않습니다.', { hl: 'card-filter_only' }),
      L('게이트를 끄면 로그 50개가 다 달라지고, 같은 적대자가 집 98퍼센트, 학교 72퍼센트를 맞힙니다.', { hl: 'card-off' }),
    ],
    hold: 0.5,
  },
  {
    id: 'host',
    title: '자가 호스팅',
    screen: '밝은 카드: 각자 WhereCtx 토큰 → 가족 서버 .env · family.config.json → npm start / Docker',
    rubric: 'Impact · Technical Depth',
    scene: 'host',
    lines: [
      L('가족은 서버 하나를 띄웁니다. 각자 자기 WhereCtx 토큰을 등록하고, npm start.'),
      L('에이전트 토큰은 그 서버가 구성원마다 발급합니다.'),
    ],
  },
  {
    id: 'outro',
    title: '클로징 카드',
    screen: '검은 카드: 네 줄 요약 + 자가 호스팅 + mock 고지',
    rubric: 'Use of Meta AI Tooling · Impact',
    scene: 'outro',
    lines: [
      L('WhereCtx는 상태만, 토큰은 내 것만, Muse는 역할만.'),
      L('이 녹화의 모델 자리는 mock이고, 키를 넣으면 같은 경로로 Muse Spark가 답합니다.'),
    ],
    hold: 1.2,
  },
];

/** 자막에는 읽기용 표기(퍼센트 → %)를 쓴다 */
export function captionText(line: string): string {
  return line.replace(/(\d+)퍼센트/g, '$1%').replace('열다섯 개', '15개');
}
