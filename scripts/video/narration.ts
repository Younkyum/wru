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
  /** 이 문장을 읽으면서 커서로 누를 버튼 (DemoPage의 data-demo 값) */
  click?: string;
  /** 이 문장을 읽은 뒤 화면에서 할 일 */
  after?: 'museShow';
}

export interface Segment {
  id: string;
  /** 대본 문서에 쓰는 컷 이름 · 화면 설명 · 겨냥하는 심사 항목 */
  title: string;
  screen: string;
  rubric: string;
  /** 인트로 · 터미널 · 아웃트로 카드. 없으면 앱 화면 */
  scene?: 'intro' | 'host' | 'outro';
  /** 브라우저 탭에 보일 챕터 이름 (앱 화면일 때) */
  chapter?: string;
  /** 오른쪽 패널을 설명하는 컷: 폰과 WRU 바를 흐리게 해 시선을 패널로 보낸다 */
  camera?: 'panel';
  lines: Line[];
  /** 내레이션이 끝난 뒤 더 머무를 초 */
  hold?: number;
}

const L = (text: string, opts: Omit<Line, 'text'> = {}): Line => ({ text, ...opts });

export const SEGMENTS: Segment[] = [
  {
    id: 'intro',
    title: 'Opening card',
    screen: 'Dark card: WRU · typical location sharing (pins on a map) vs WRU (status chips)',
    rubric: 'Impact',
    scene: 'intro',
    lines: [
      L('"Who\'s picking up Mina?" Many families answer that by sharing their location all day.'),
    ],
    hold: 0.2,
  },
  {
    id: 'phones',
    chapter: 'Status only',
    title: '1. Status only',
    screen: 'Three phones (Mom home · Dad on the way, 20 min · Brother near home)',
    rubric: 'Impact · Demo',
    lines: [
      L('WRU, short for "where are you", lets each person\'s AI agent split the errands without sharing coordinates.'),
      L('Each person runs WhereCtx, their own small location server. WRU gets only a coarse status from it, like home, near home or on the way, plus a rough ETA.'),
      L('Mom is home,', { hl: 'mom' }),
      L('Dad is twenty minutes out,', { hl: 'dad' }),
      L('and Brother is near home.', { hl: 'sibling' }),
    ],
  },
  {
    id: 'task',
    chapter: 'A task comes in',
    title: '2. A task comes in',
    screen: 'WRU bar shows the task (requested by Mom); each phone gets a "Family task" note',
    rubric: 'Demo',
    lines: [
      L("Mom posts a task: pick up Mina from school and buy milk by 6 PM.", { click: 'hero', hl: 'hub' }),
      L('The rule: one task per person.', { hl: 'hub' }),
    ],
  },
  {
    id: 'negotiation',
    chapter: 'Three Muses negotiate',
    title: '3. Three Muses negotiate',
    screen: 'Phones + Muse channel; messages appear round by round in step with the narration',
    rubric: 'Use of Meta AI Tooling · Demo',
    lines: [
      L("Mom hands it to the family's agents. Each agent is called a Muse, and it's built to run on Meta's Muse Spark model.", { click: 'negotiate', reveal: 0 }),
      L('In round one, all three offer to do the pickup.', { reveal: 3 }),
      L("Each Muse judges only from its own status. Dad is already out and heading home, so the pickup fits him best.", { reveal: 3, hl: 'dad' }),
      L('Mom and Brother switch their offers to the milk.', { reveal: 6 }),
      L('Brother is near home and can drop by the store, so Mom steps back.', { reveal: 8, hl: 'mom+sibling' }),
    ],
  },
  {
    id: 'roles',
    chapter: 'Only roles come out',
    title: '4. Only roles come out',
    screen: 'WRU bar shows roles → Mom approves → each phone shows only its own role',
    rubric: 'Impact · Demo',
    lines: [
      L('The result is just who does what, and Mom approves it once.', { click: 'approve', hl: 'hub' }),
      L('Each phone gets only its own task: pickup for Dad, milk for Brother.', { hl: 'roles' }),
    ],
  },
  {
    id: 'muse',
    chapter: 'What the model sees',
    title: '5. What the model sees',
    screen: 'Phones fade; the panel shows the Meta Model API request body (JSON) → response JSON, "The model decides / WRU enforces", a real filter rewrite',
    rubric: 'Use of Meta AI Tooling · Technical Depth',
    camera: 'panel',
    lines: [
      L("Here is what Dad's Muse sends the model: its own status, an ETA range, minutes to the deadline, and the messages so far.", { click: 'tab-model', hl: 'request', after: 'museShow' }),
      L('The model replies with one JSON object: which task, and how good a fit.', { hl: 'response' }),
      L('In this recording, a mock that returns the same JSON format stands in for Muse Spark.', { hl: 'response' }),
      L('WRU checks that the reply is valid and comes from the right agent.', { hl: 'split' }),
      L('If the model slips a location into its reason, WRU swaps it for a fixed template before logging.', { hl: 'rewrite' }),
    ],
  },
  {
    id: 'boundary',
    chapter: 'Nobody can peek',
    title: '6. Nobody can peek',
    screen: 'Token boundary matrix 5×3 (only the diagonal is 200), the 403 cell highlighted',
    rubric: 'Technical Depth',
    camera: 'panel',
    lines: [
      L('Could one agent peek at another? Each one holds its own token.', { click: 'tab-boundary', hl: 'diag' }),
      L('We send fifteen real requests: five callers, each asking about all three people.', { click: 'run-boundary', hl: 'grid' }),
      L("A request with Dad's token for Mom's status gets 403 Forbidden.", { hl: 'dad-mom' }),
    ],
  },
  {
    id: 'leak',
    chapter: 'Can the log reveal home?',
    title: '7. Can the log reveal home?',
    screen: 'Three cards in order: gate off (50 logs, home 98% · school 72%) → gate on (5 logs, ceiling 22% · 24%, rule-based attacker 6% · 0%, chance 4%) → agent knows its location (same 5 logs)',
    rubric: 'Technical Depth',
    camera: 'panel',
    lines: [
      L("Could these logs reveal where the family lives? We simulated fifty families across Seoul's twenty-five districts.", { click: 'tab-leak' }),
      L("The privacy gate lets through only status and a rough ETA. Without it, agents chat freely and every family's log is unique.", { hl: 'card-off' }),
      L('A rule-based attacker then finds the home district 98 percent of the time.', { hl: 'off-actual' }),
      L('With the gate on, those fifty families produce just five different logs.', { hl: 'on-logs' }),
      L("Families that share a log look identical, so even the best-case attacker gets the home district right only 22 percent of the time.", { hl: 'on-bound' }),
      L('Our rule-based attacker got 6 percent, and random guessing gets 4 percent.', { hl: 'on-actual' }),
      L('Status alone is what gives away that 22 percent.', { hl: 'on-bound' }),
      L('Even an agent that knows its exact location produces the same logs.', { hl: 'card-filter_only' }),
    ],
  },
  {
    id: 'host',
    title: 'Self-hosting',
    screen: 'Terminal: cat .env shows a masked, read-only WhereCtx token for Mom; npm start prints the family (mom=location.example.com, dad=sim, sibling=sim)',
    rubric: 'Impact · Technical Depth',
    scene: 'host',
    lines: [
      L("Each member adds a read-only token from their own WhereCtx. In this config, Mom's is real and the others are simulated."),
      L('One command starts the family server.'),
      L('Exact locations never leave each person\'s own server.'),
    ],
  },
  {
    id: 'outro',
    title: 'Closing card',
    screen: 'Dark card: five-line summary + mock disclosure',
    rubric: 'Use of Meta AI Tooling · Impact',
    scene: 'outro',
    lines: [
      L('Add a Meta Model API key, and the same code calls Muse Spark.'),
    ],
    hold: 0.8,
  },

];

/** 자막에는 읽기용 표기(숫자 · %)를 쓴다 */
export function captionText(line: string): string {
  return line
    .replace(/(\d+) percent/g, '$1%')
    .replace(/(\d) PM/g, '$1\u00a0PM')
    .replace(/best-case/g, 'best\u2011case')
    .replace('fifteen', '15')
    .replace('fifty scenarios', '50 scenarios')
    .replace('all fifty logs', 'all 50 logs')
    .replace('fifty scenarios', '50 scenarios')
    .replace('five distinct logs', '5 distinct logs')
    .replace("twenty-five districts", '25 districts')
    .replace('twenty minutes out', '20 minutes out')
    .replace('fifty families', '50 families')
    .replace('fifteen-minute', '15-minute')
    .replace('fifteen real requests', '15 real requests')
    .replace('five different logs', '5 different logs')
    .replace('read-only', 'read\u2011only');
}
