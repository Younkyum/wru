// 영상 내레이션 · 자막 원본. docs/VIDEO_SCRIPT.md의 대본과 같은 문장을 쓴다.
// 각 구간은 화면 동작(scene: 인트로 · 아웃트로 카드, step: 데모 모드 컷)과 문장 목록으로 되어 있다.
// 문장 하나가 자막 한 줄이 되고, 내레이션은 구간 문장을 이어 읽는다.

export interface Segment {
  id: string;
  /** 대본 문서에 쓰는 컷 이름 · 화면 설명 · 겨냥하는 심사 항목 */
  title: string;
  screen: string;
  rubric: string;
  /** 인트로 · 아웃트로 카드. 없으면 데모 화면 */
  scene?: 'intro' | 'outro';
  /** 이 구간에서 들어갈 데모 모드 컷 (0부터). 없으면 컷을 넘기지 않는다 */
  step?: number;
  lines: string[];
  /** 내레이션이 끝난 뒤 더 머무를 초 */
  hold?: number;
  /** 협상 메시지를 이 구간 내레이션 길이에 맞춰 하나씩 보여 준다 */
  reveal?: boolean;
  /** 문장을 읽은 뒤 화면에서 할 일: 승인 버튼 누르기, Muse 응답 펼치기 */
  after?: { line: number; call: 'approve' | 'museShow' }[];
}

export const SEGMENTS: Segment[] = [
  {
    id: 'intro',
    title: '오프닝 카드',
    screen: '검은 카드: WRU · "누가 민아 데리러 가?"',
    rubric: 'Impact',
    scene: 'intro',
    lines: [
      '"누가 민아 데리러 가?" 이걸 정하려고 가족 모두의 위치를 공유해야 할까요?',
      'WRU는 좌표 없이, 가족 각자의 AI 에이전트가 협상해서 일을 나눕니다.',
    ],
    hold: 0.4,
  },
  {
    id: 'phones',
    title: '1. 좌표 없는 지도',
    screen: '폰 3대의 상태 카드 강조 (엄마 집 · 아빠 이동 중 20분 · 형 집 근처)',
    rubric: 'Impact · Demo',
    step: 0,
    lines: [
      '위치는 각자 자기 서버, WhereCtx에 둡니다. WRU는 거기서 집, 집 근처, 이동 중 같은 거친 상태만 받습니다.',
      '엄마는 집, 아빠는 퇴근길 20분, 형은 집 근처. 폰마다 자기 것만 보이고, 지도도 좌표도 없습니다.',
    ],
  },
  {
    id: 'boundary',
    title: '2. 내 토큰으로는 내 것만',
    screen: '오른쪽 열에 토큰 경계표 5×3 (대각선만 200), 폰마다 토큰 지문',
    rubric: 'Technical Depth',
    step: 1,
    lines: [
      '에이전트는 자기 토큰으로 자기 상태만 읽습니다. 아빠 토큰으로 엄마 상태를 달라고 하면 403.',
      '이 표는 방금 서버에 실제로 보낸 요청 열다섯 개의 결과입니다.',
    ],
  },
  {
    id: 'task',
    title: '3. 태스크 투입',
    screen: 'WRU 바에 태스크, 폰마다 "가족 일" 알림',
    rubric: 'Demo',
    step: 2,
    lines: ['저녁 6시까지 민아 픽업과 우유 사기. 한 사람은 한 가지 일만 맡습니다.'],
  },
  {
    id: 'negotiation',
    title: '4. Muse 3명의 협상',
    screen: 'Muse 채널과 각자 폰에 메시지 8개가 내레이션에 맞춰 하나씩',
    rubric: 'Use of Meta AI Tooling · Demo',
    step: 3,
    reveal: true,
    lines: [
      '각 에이전트 Muse는 Meta Model API로 Muse Spark 모델을 부르도록 만들었습니다. 이 녹화는 키 발급 전이라, 같은 스키마의 mock이 모델 자리에서 답합니다.',
      '세 Muse가 자기 상태만 보고 손을 듭니다. 이미 밖에 나와 있고 마감까지 여유가 있는 아빠가 픽업에 적합도 높음, 집에서 새로 나서야 하는 엄마는 낮음.',
      '엄마와 형은 우유로 바꾸고, 이미 밖에 나와 있는 형에게 엄마가 양보합니다.',
      '아빠와 형이 차례로 확정합니다.',
    ],
  },
  {
    id: 'muse',
    after: [{ line: 0, call: 'museShow' }],
    title: '5. Muse에게 가는 것',
    screen: '오른쪽 열: Meta Model API 요청 본문(JSON)과 응답, 검사 목록',
    rubric: 'Use of Meta AI Tooling · Technical Depth',
    step: 4,
    lines: [
      '아빠의 Muse가 모델에게 보내는 건 이게 전부입니다. 내 상태, ETA 구간, 마감까지 남은 분, 지금까지 오간 메시지.',
      '어느 일에 나설지, 적합도, offer와 counter는 모델이 JSON 하나로 정합니다.',
      'WRU는 토큰과 스키마를 검사하고, 이유 문장을 템플릿으로 바꾸고, 겹친 commit만 판정합니다.',
    ],
  },
  {
    id: 'roles',
    title: '6. 역할 통지',
    screen: 'WRU 바에 역할 → 승인 버튼 → 폰마다 자기 역할 카드',
    rubric: 'Impact · Demo',
    step: 5,
    after: [{ line: 0, call: 'approve' }],
    lines: ['결과는 역할뿐입니다.', '태스크를 낸 엄마가 한 번 승인하면, 아빠 폰에는 픽업, 형 폰에는 우유만 뜹니다.'],
  },
  {
    id: 'leak',
    title: '7. 로그로 집을 찾을 수 있을까?',
    screen: '게이트 on 카드 (집 6% · 학교 0%, 우연 4%)',
    rubric: 'Technical Depth',
    step: 6,
    lines: [
      '그럼 이 로그만으로 집을 찾을 수 있을까요? 집과 학교가 다른 시나리오 50개로, 서울 25개 구 중 어디인지 맞히게 했습니다.',
      '로그에서 동네 이름과 거리를 찾는 규칙 기반 적대자는 집 6퍼센트, 학교 0퍼센트를 맞혔습니다.',
      '적대자 성능과 상관없는 상한도 쟀습니다. 로그가 다섯 종류뿐이라, 정답을 미리 알고 골라도 집 22퍼센트, 학교 24퍼센트가 최대입니다. 남는 몫은 상태와 ETA 구간에서 옵니다.',
    ],
  },
  {
    id: 'gate',
    title: '8. 게이트를 끄면',
    screen: '카드 3장: off 98% · 72% / 위치를 알 때 6% · 0% / on 6% · 0%',
    rubric: 'Technical Depth',
    step: 7,
    lines: [
      '핵심은 가운데 칸입니다. 에이전트에게 위치를 몰래 쥐여 줘도, 로그는 게이트 on과 글자 하나 다르지 않습니다.',
      '비교로 게이트를 끄고 동네 이름과 거리를 그대로 말하게 두면, 로그 50개가 모두 달라지고 집 98퍼센트, 학교 72퍼센트를 맞힙니다.',
    ],
    hold: 0.6,
  },
  {
    id: 'outro',
    title: '클로징 카드',
    screen: '검은 카드: 네 줄 요약 + 자가 호스팅 + mock 고지',
    rubric: 'Use of Meta AI Tooling · Impact',
    scene: 'outro',
    lines: [
      'WhereCtx는 상태만, 토큰은 내 것만, Muse는 역할만.',
      '누구나 자기 서버에 띄워 쓸 수 있고, Meta Model API 키를 넣으면 협상과 적대자 모두 Muse Spark로 바뀝니다.',
    ],
    hold: 1.2,
  },
];

/** 자막에는 읽기용 표기(퍼센트 → %)를 쓴다 */
export function captionText(line: string): string {
  return line.replace(/(\d+)퍼센트/g, '$1%').replace('열다섯 개', '15개');
}
