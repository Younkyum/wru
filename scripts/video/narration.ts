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
      L('"Who\'s picking up Mina?" To answer that,'),
      L('should a family stream everyone\'s coordinates to a server all day?'),
      L('WRU lets each family member\'s AI agent split the errands, with no coordinates.'),
    ],
    hold: 0.3,
  },
  {
    id: 'phones',
    title: '1. A map without coordinates',
    screen: 'Three phones (Mom home · Dad on the way, 20 min · Brother near home)',
    rubric: 'Impact · Demo',
    step: 0,
    lines: [
      L('Each person keeps their location on their own server, called WhereCtx.'),
      L('WRU only receives a coarse status: home, near home, or on the way.'),
      L('Mom is home, Dad is twenty minutes out, Brother is near home.', { hl: 'phones' }),
    ],
  },
  {
    id: 'task',
    title: '2. A task comes in',
    screen: 'WRU bar shows the task (requested by Mom); each phone gets a "Family task" note',
    rubric: 'Demo',
    step: 1,
    lines: [L('Mom posts a task: pick up Mina and buy milk by six.', { hl: 'hub' }), L('One task per person.', { hl: 'hub' })],
  },
  {
    id: 'negotiation',
    title: '3. Three Muses negotiate',
    screen: 'Phones + Muse channel; messages appear round by round in step with the narration',
    rubric: 'Use of Meta AI Tooling · Demo',
    step: 2,
    lines: [
      L("Each agent, a Muse, is built to call Meta's Muse Spark model.", { reveal: 0 }),
      L('In this recording, a mock with the same schema answers in its place.', { reveal: 0 }),
      L('Round one: everyone who can make the deadline offers to do the pickup.', { reveal: 3 }),
      L("Dad is already out with time to spare, so his fit is high.", { reveal: 3, hl: 'dad' }),
      L('Mom and Brother switch to the milk, and Dad commits to the pickup.', { reveal: 6 }),
      L("Brother is near home, so Mom yields the milk to him.", { reveal: 8, hl: 'sibling' }),
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
      L('The model answers with one JSON object: which task, and how good a fit.', { hl: 'response' }),
      L('WRU checks the token and the schema.', { hl: 'split' }),
      L('Even if the model slips in a location, only a status template reaches the log.', { hl: 'rewrite' }),
    ],
  },
  {
    id: 'roles',
    title: '5. Roles, not locations',
    screen: 'WRU bar shows roles → Mom approves → each phone shows only its own role',
    rubric: 'Impact · Demo',
    step: 4,
    lines: [
      L('What comes out is roles. Mom approves once,', { hl: 'hub', after: 'approve' }),
      L("and Dad's phone says pickup, Brother's says milk. Nothing else.", { hl: 'roles' }),
    ],
  },
  {
    id: 'boundary',
    title: '6. Nobody can peek',
    screen: 'Token boundary matrix 5×3 (only the diagonal is 200), the 403 cell highlighted',
    rubric: 'Technical Depth',
    step: 5,
    lines: [
      L('Could one agent peek at another? Every agent reads its own status with its own token.', { hl: 'diag' }),
      L("Dad's token asking for Mom's status gets a 403.", { hl: 'dad-mom' }),
      L('These are fifteen real requests just sent to the server.'),
    ],
  },
  {
    id: 'leak',
    title: '7. Can the log reveal home?',
    screen: 'Gate-on card: 5 distinct logs · best any adversary could do: home 22% · school 24% (chance 4%); rule-based adversary 6% · 0%',
    rubric: 'Technical Depth',
    step: 6,
    lines: [
      L('Can anyone find the home from this log?'),
      L("We ran fifty scenarios with different homes and schools across Seoul's twenty-five districts."),
      L('They produced only five distinct logs. Different homes, same log.', { hl: 'logs' }),
      L('So even an ideal adversary tops out at home 22 percent, school 24 percent.', { hl: 'bound' }),
      L('That is exactly what the shared status alone reveals. The negotiation adds nothing on top.', { hl: 'bound' }),
      L('A rule-based adversary scanning the log hit home 6 percent, school 0 percent.', { hl: 'actual' }),
    ],
  },
  {
    id: 'gate',
    title: '8. Same log, even if it knows',
    screen: 'Three cards: agent knows its location (center) · gate on · gate off 98% · 72%, bound 100%',
    rubric: 'Technical Depth',
    step: 7,
    lines: [
      L('In the middle, we secretly handed each agent its exact location.', { hl: 'card-filter_only' }),
      L('The filter still publishes the very same log as the default, character for character.', { hl: 'card-filter_only' }),
      L('Turn the gate off, and all fifty logs differ. The same adversary hits home 98 percent, school 72 percent.', { hl: 'card-off' }),
    ],
    hold: 0.5,
  },
  {
    id: 'host',
    title: 'Self-hosting',
    screen: 'Light card: WhereCtx token per person → family server .env and family.config.json → npm start / Docker',
    rubric: 'Impact · Technical Depth',
    scene: 'host',
    lines: [
      L('A family runs one server. Each person adds a read-only key from their own WhereCtx, then runs npm start.'),
      L('The server then gives each agent its own agent token.'),
    ],
  },
  {
    id: 'outro',
    title: 'Closing card',
    screen: 'Dark card: five-line summary + mock disclosure',
    rubric: 'Use of Meta AI Tooling · Impact',
    scene: 'outro',
    lines: [
      L('Status in, roles out. No coordinates in between.'),
      L('The model in this recording is a mock. Add a key, and Muse Spark answers on the same path.'),
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
    .replace("twenty-five districts", '25 districts')
    .replace('twenty minutes out', '20 minutes out')
    .replace('read-only', 'read\u2011only');
}
