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
    title: 'Opening card',
    screen: 'Dark card: WRU · typical location sharing (pins on a map) vs WRU (status chips)',
    rubric: 'Impact',
    scene: 'intro',
    lines: [
      L('"Who\'s picking up Mina?" Usually, answering that means everyone shares their live location all day.'),
      L('Or nobody answers the group chat until it is too late.'),
      L('WRU, short for "where are you", lets each person\'s AI agent split the errands without sharing coordinates.'),
    ],
    hold: 0.3,
  },
  {
    id: 'phones',
    title: '1. Status only',
    screen: 'Three phones (Mom home · Dad on the way, 20 min · Brother near home)',
    rubric: 'Impact · Demo',
    step: 0,
    lines: [
      L('Each person runs WhereCtx, a small location server of their own.'),
      L('WRU only gets a coarse status from it: home, near home, or on the way.'),
      L('Mom is home, Dad is twenty minutes out, and Brother is near home.', { hl: 'phones' }),
    ],
  },
  {
    id: 'task',
    title: '2. A task comes in',
    screen: 'WRU bar shows the task (requested by Mom); each phone gets a "Family task" note',
    rubric: 'Demo',
    step: 1,
    lines: [
      L("Mom posts a task: pick up Mina and buy milk by 6 pm. Mina's school is a fifteen-minute trip from home.", { hl: 'hub' }),
      L('The rule: one task per person.', { hl: 'hub' }),
    ],
  },
  {
    id: 'negotiation',
    title: '3. Three Muses negotiate',
    screen: 'Phones + Muse channel; messages appear round by round in step with the narration',
    rubric: 'Use of Meta AI Tooling · Demo',
    step: 2,
    lines: [
      L("We call each agent a Muse. It runs on Meta's Muse Spark model.", { reveal: 0 }),
      L('In this recording, a mock with the same output format stands in for the model.', { reveal: 0 }),
      L('In round one, everyone who can make it in time offers to do the pickup.', { reveal: 3 }),
      L("Dad is already out with time to spare, so he's the best fit for the pickup.", { reveal: 3, hl: 'dad' }),
      L('Mom and Brother both offer to get the milk instead.', { reveal: 6 }),
      L('Brother is near home, so Mom steps aside.', { reveal: 8, hl: 'sibling' }),
    ],
  },
  {
    id: 'muse',
    title: '4. What goes to the model',
    screen: 'Meta Model API request body (JSON) → response JSON, "The model decides / WRU enforces", a real filter rewrite',
    rubric: 'Use of Meta AI Tooling · Technical Depth',
    step: 3,
    lines: [
      L("This is everything Dad's Muse sends to the model:", { hl: 'request' }),
      L('its own state, an ETA range, minutes to the deadline, and the messages so far.', { hl: 'request', after: 'museShow' }),
      L('The model replies with one JSON object: which task, and how good a fit.', { hl: 'response' }),
      L('WRU checks that the reply is valid and comes from the right agent.', { hl: 'split' }),
      L('If the model slips a location into its reason, the log still only shows a fixed sentence.', { hl: 'rewrite' }),
    ],
  },
  {
    id: 'roles',
    title: '5. Only roles come out',
    screen: 'WRU bar shows roles → Mom approves → each phone shows only its own role',
    rubric: 'Impact · Demo',
    step: 4,
    lines: [
      L('What comes out is roles. Mom approves once,', { hl: 'hub', after: 'approve' }),
      L("and each phone gets only its own job: pickup for Dad, milk for Brother.", { hl: 'roles' }),
    ],
  },
  {
    id: 'boundary',
    title: '6. Nobody can peek',
    screen: 'Token boundary matrix 5×3 (only the diagonal is 200), the 403 cell highlighted',
    rubric: 'Technical Depth',
    step: 5,
    lines: [
      L('Could one agent peek at another? Each one holds its own token.', { hl: 'diag' }),
      L("Dad's token asking for Mom's status gets a 403.", { hl: 'dad-mom' }),
      L('That is every agent asking about every person: fifteen real requests, just sent.'),
    ],
  },
  {
    id: 'leak',
    title: '7. Can the log reveal home?',
    screen: 'Three cards in order: gate off (50 logs, home 98% · school 72%) → gate on (5 logs, ceiling 22% · 24%, rule-based attacker 6% · 0%, chance 4%) → agent secretly knows (same 5 logs)',
    rubric: 'Technical Depth',
    step: 6,
    lines: [
      L("Could these logs reveal where the family lives? We tried fifty families across Seoul's twenty-five districts."),
      L('Without the privacy gate, which hides everything but status, every log is different.', { hl: 'card-off' }),
      L('A simple attacker then finds the home district 98 percent of the time.', { hl: 'card-off' }),
      L('With the gate on, those fifty families produce just five different logs.', { hl: 'card-on' }),
      L('Even the best possible guess, made in hindsight, is right only 22 percent of the time.', { hl: 'card-on' }),
      L('That floor comes from the status itself. The negotiation adds nothing.', { hl: 'card-on' }),
      L('And an agent that secretly knows its exact location produces the very same logs.', { hl: 'card-filter_only' }),
    ],
  },
  {
    id: 'host',
    title: 'Self-hosting',
    screen: 'Light card: WhereCtx token per person → family server .env and family.config.json → npm start / Docker',
    rubric: 'Impact · Technical Depth',
    scene: 'host',
    lines: [
      L('One family runs one server.'),
      L('Each member adds a read-only token from their own WhereCtx, and one command starts the server.'),
      L('Locations never leave each person\'s own server.'),
    ],
  },
  {
    id: 'outro',
    title: 'Closing card',
    screen: 'Dark card: five-line summary + mock disclosure',
    rubric: 'Use of Meta AI Tooling · Impact',
    scene: 'outro',
    lines: [
      L('Add a Meta API key, and the same code calls Muse Spark.'),
    ],
    hold: 1.2,
  },

];

/** 자막에는 읽기용 표기(숫자 · %)를 쓴다 */
export function captionText(line: string): string {
  return line
    .replace(/(\d+) percent/g, '$1%')
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
