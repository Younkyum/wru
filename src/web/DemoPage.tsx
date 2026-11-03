import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DemoState, PersonId, Presence, PresenceState, Task } from '../shared/contracts';
import { PERSON_IDS, PERSON_LABEL, STATE_LABEL, localTime } from '../shared/contracts';
import type { Condition, LeakReport } from '../shared/leak-report';
import type { Fit, MessageType, NegotiationMessage, NegotiationRecord } from '../shared/negotiation';
import { REASON_CODE_TEXT } from '../shared/negotiation';
import type { PanelName } from './demoSteps';
import type { BoundaryMatrix, BoundaryRow } from '../shared/boundary';
import type { MuseTurnView } from '../shared/muse-turn';

export interface DemoPageProps {
  state: DemoState;
  playing: boolean;
  error: string | null;
  onAdvance: (minutes: number) => void;
  onReset: () => void;
  onTogglePlay: () => void;
  onSubmitHeroTask: () => void;
  onNegotiate: (taskId: string) => void;
  onApprove: (negotiationId: string) => void;
  report: LeakReport | null;
  onShowReport: () => void;
  boundary?: BoundaryMatrix | null;
  onShowBoundary?: () => void;
  museTurn?: MuseTurnView | null;
  onShowMuse?: () => void;
  /** 데모 모드 밖에서도 협상 메시지를 몇 개까지 보여 줄지 (영상 녹화) */
  reveal?: number | null;
  /** Muse 응답(JSON)을 펼쳤는지. 기본 true */
  museShown?: boolean;
  onStartDemo?: () => void;
  demo?: DemoView | null;
  /** 영상 녹화 모드 (/demo?video=1): 자막 · 인트로 · 아웃트로 */
  video?: VideoOverlay | null;
}

export interface VideoOverlay {
  caption: string | null;
  /** 브라우저 바에 보이는 챕터 이름 */
  chapter: string | null;
  /** 녹화용 가짜 커서 (화면 좌표) */
  cursor: { x: number; y: number; down: boolean } | null;
  scene: 'intro' | 'host' | 'outro' | null;
  /** 오른쪽 패널을 설명 중이면 "panel" (폰과 WRU 바를 흐리게) */
  camera?: 'panel' | null;
  /** 내레이션이 지금 가리키는 대상 (강조) */
  hl: string | null;
}

// ── 영상 강조: 내레이션이 가리키는 대상은 또렷하게, 같은 묶음의 나머지는 흐리게 ──
const HL_GROUP: Record<string, string> = {
  phones: 'phones', mom: 'phones', dad: 'phones', sibling: 'phones', roles: 'phones',
  diag: 'matrix', 'dad-mom': 'matrix', grid: 'matrix',
  request: 'muse', response: 'muse', split: 'muse', rewrite: 'muse', tools: 'muse',
  ...Object.fromEntries(
    ['off', 'on', 'filter_only'].flatMap((k) => ['logs', 'bound', 'actual'].map((part) => [`${k}-${part}`, 'leak-sub'])),
  ),
  'card-on': 'leak', 'card-off': 'leak', 'card-filter_only': 'leak',
  hub: 'hub',
};
const HighlightContext = createContext<string | null>(null);

/** keys 중 하나가 지금 강조 대상이면 hl-on, 같은 묶음의 다른 대상이 강조 중이면 hl-dim */
function useHl(group: string, ...keys: string[]): string {
  const hl = useContext(HighlightContext);
  if (!hl) return '';
  // "mom+sibling"처럼 +로 여러 대상을 함께 강조할 수 있다
  const parts = hl.split('+');
  if (HL_GROUP[parts[0]!] !== group) return '';
  return parts.some((k) => keys.includes(k)) ? ' hl-on' : ' hl-dim';
}

/** 데모 모드 진행 상태 */
export interface DemoView {
  step: number;
  total: number;
  title: string;
  caption: string;
  focus: PanelName;
  /** 협상 메시지를 지금까지 몇 개 보여 줄지 (애니메이션) */
  reveal: number | null;
  /** 누수 패널에서 보여 줄 조건 */
  conditions: Condition[];
  busy: boolean;
  onNext: () => void;
  onExit: () => void;
}

const INITIAL: Record<PersonId, string> = { mom: 'M', dad: 'D', sibling: 'B' };

function Avatar({ person, size = 'md' }: { person: PersonId; size?: 'sm' | 'md' }) {
  return (
    <span className={`avatar avatar-${person} avatar-${size}`} aria-hidden>
      {INITIAL[person]}
    </span>
  );
}

function etaText(p: Presence): string {
  return p.eta_minutes === null ? 'At home now' : `About ${p.eta_minutes} min from home`;
}

function subtaskLabel(task: Task | undefined, id: string): string {
  return task?.subtasks.find((s) => s.id === id)?.label ?? id;
}

const FIT_LABEL: Record<Fit, string> = { high: 'fit: high', medium: 'fit: medium', low: 'fit: low' };

/** 문장 중간에 오는 할 일 이름: "Pick up Mina" → "pick up Mina" */
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function messageText(m: NegotiationMessage, task: Task | undefined): string {
  switch (m.type) {
    case 'offer':
      return `I'll ${lower(subtaskLabel(task, m.subtask_id))}`;
    case 'counter':
      return `I'll ${lower(subtaskLabel(task, m.alternative))} instead`;
    case 'commit':
      return subtaskLabel(task, m.subtask_id);
    case 'refuse':
      return `${subtaskLabel(task, m.subtask_id)}: ${REASON_CODE_TEXT[m.reason_code]}`;
  }
}

function messageDetail(m: NegotiationMessage): string | null {
  return m.type === 'offer' || m.type === 'counter' ? `${m.reason} · ${FIT_LABEL[m.fit]}` : null;
}

function TypeBadge({ type }: { type: MessageType }) {
  return <span className={`type type-${type}`}>{type}</span>;
}

// ── 폰: 각자 자기 상태와 자기 Muse가 한 말만 본다 ──────────────────────

const RING: Record<PresenceState, number> = { home: 0, near_home: 27, in_transit: 44, unknown: 44 };

/** 자기 점 하나만 찍힌 추상 링. 방향은 의미 없고 거리 단계만 나타낸다 */
function SelfRing({ presence }: { presence: Presence }) {
  const r = RING[presence.state];
  const x = Math.round(50 + r * Math.cos(-Math.PI / 4));
  const y = Math.round(50 + r * Math.sin(-Math.PI / 4));
  return (
    <svg viewBox="0 0 100 100" className="self-ring" aria-hidden>
      <circle cx={50} cy={50} r={44} className="ring" />
      <circle cx={50} cy={50} r={27} className="ring" />
      <circle cx={50} cy={50} r={12} className={`ring-home${presence.state === 'home' ? ' is-home' : ''}`} />
      <path d="M44 52 L50 46 L56 52 L56 57 L44 57 Z" className="house" />
      {presence.state !== 'home' && <circle cx={x} cy={y} r={6} className={`dot dot-${presence.state}`} />}
    </svg>
  );
}

interface PhoneProps {
  person: PersonId;
  /** 이 폰의 에이전트가 든 토큰 지문 */
  tokenMark: string | null;
  presence: Presence;
  clock: string;
  task: Task | undefined;
  messages: NegotiationMessage[];
  role: string | null;
}

/** 폰 상태 표시줄 시계: "17:30" → "5:30" (아이폰처럼 12시간제) */
function phoneClock(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  const n = Number(h);
  return Number.isNaN(n) ? hhmm : `${n % 12 === 0 ? 12 : n % 12}:${m}`;
}

function Phone({ person, tokenMark, presence, clock, task, messages, role }: PhoneProps) {
  const feed = useRef<HTMLDivElement>(null);
  const hl = useHl('phones', 'phones', person, ...(role && !role.includes('nothing') ? ['roles'] : []));
  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [messages.length, role]);
  return (
    <article className={`phone phone-${person}${hl}`} aria-label={`${PERSON_LABEL[person]}'s phone`}>
      <div className="phone-screen">
        <div className="phone-status">
          <span>{phoneClock(clock)}</span>
          <span className="notch" />
          <span>WRU</span>
        </div>
        <header className="phone-head">
          <Avatar person={person} />
          <div>
            <div className="phone-owner">{PERSON_LABEL[person]}</div>
            <div className="phone-sub">my WhereCtx · my Muse</div>
          </div>
          {tokenMark && (
            <span className="key zone-key" title="This agent's token (fingerprint)">
              <KeyIcon />
              {tokenMark.replace('wru_ag_…', '')}
            </span>
          )}
        </header>
        <section className="me zone-presence">
          <SelfRing presence={presence} />
          <div>
            <div className={`state state-${presence.state}`}>{STATE_LABEL[presence.state]}</div>
            <div className="eta">{etaText(presence)}</div>
          </div>
        </section>
        <div className="feed zone-feed" ref={feed}>
          {!task && <p className="feed-empty">This phone never shows anyone else's location.</p>}
          {task && (
            <div className="note">
              <div className="note-title">Family task · by {localTime(task.deadline)}</div>
              <div className="note-body">{task.subtasks.map((s) => s.label).join(' + ')}</div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className="bubble">
              <TypeBadge type={m.type} />
              <span>{messageText(m, task)}</span>
            </div>
          ))}
          {role && <div className={`role-card zone-role${role.includes('nothing') ? ' role-none' : ''}`}>{role}</div>}
        </div>
      </div>
    </article>
  );
}

// ── WRU 바: 태스크 → 협상 → 결과 → 승인 ────────────────────────────

interface HubProps {
  state: DemoState;
  task: Task | undefined;
  latest: NegotiationRecord | undefined;
  revealing: boolean;
  shown: number;
  onSubmitHeroTask: () => void;
  onNegotiate: (taskId: string) => void;
  onApprove: (id: string) => void;
}

function Hub({ state, task, latest, revealing, shown, onSubmitHeroTask, onNegotiate, onApprove }: HubProps) {
  let body: ReactNode;
  if (!task) {
    body = (
      <>
        <div className="hub-text">
          <div className="hub-title">No family task yet</div>
          <div className="hub-sub">Add a task and the three Muses split it up</div>
        </div>
        <button className="btn btn-primary" data-demo="hero" onClick={onSubmitHeroTask}>
          ＋ Pick up Mina + buy milk by 6 PM
        </button>
      </>
    );
  } else if (!latest || latest.task_id !== task.task_id) {
    body = (
      <>
        <div className="hub-text">
          <div className="hub-title">
            {task.subtasks.map((s) => s.label).join(' + ')}
            <span className="hub-deadline">by {localTime(task.deadline)}</span>
          </div>
          <div className="hub-sub">
            {task.requested_by ? `Requested by ${PERSON_LABEL[task.requested_by]} · ` : ''}
            {task.constraints.max_subtasks_per_person === 1 ? 'one task per person' : 'no per-person limit'}
          </div>
        </div>
        <button className="btn btn-primary" data-demo="negotiate" onClick={() => onNegotiate(task.task_id)}>
          Hand it to the three Muses
        </button>
      </>
    );
  } else if (revealing) {
    body = (
      <div className="hub-text">
        <div className="hub-title">Three Muses negotiate</div>
        <div className="hub-sub">
          message {shown}/{latest.messages.length}
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <div className="hub-roles">
          {latest.assignment.assignments.map((a) => (
            <span key={a.subtask} className="hub-role">
              <Avatar person={a.person} size="sm" />
              {PERSON_LABEL[a.person]} = {subtaskLabel(task, a.subtask)}
            </span>
          ))}
          {latest.assignment.unassigned.map((id) => (
            <span key={id} className="hub-role hub-role-none">
              unassigned · {subtaskLabel(task, id)}
            </span>
          ))}
        </div>
        {latest.status === 'approved' ? (
          <span className="hub-ok">
            {task.requested_by ? `Approved by ${PERSON_LABEL[task.requested_by]} · ` : 'Approved · '}each person got only their own role
          </span>
        ) : (
          <button className="btn btn-primary" data-demo="approve" onClick={() => onApprove(latest.negotiation_id)}>
            {task.requested_by ? `Approve as ${PERSON_LABEL[task.requested_by]} & notify` : 'Approve & notify'}
          </button>
        )}
      </>
    );
  }
  const hl = useHl('hub', 'hub');
  return (
    <section className={`hub zone-hub${hl}`} aria-label="WRU inbox and roles">
      <span className="hub-label">WRU</span>
      {body}
      <span className="hub-muse">Muse: {state.muse === 'meta' ? 'Meta Model API' : 'mock'}</span>
    </section>
  );
}

// ── 오른쪽 열: Muse 채널 / 누수 테스트 ─────────────────────────────

interface ChannelProps {
  messages: NegotiationMessage[];
  task: Task | undefined;
  total: number;
  log: DemoState['log'];
  /** 다음 메시지를 준비 중인 사람 (영상에서 "생각 중" 표시) */
  next?: PersonId;
}

function Channel({ messages, task, total, log, next }: ChannelProps) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.length]);
  return (
    <>
      <div className="side-head">
        <h2>Muse channel</h2>
        <div className="chain">Muse agent → Meta Model API → Muse Spark</div>
        <span>{total ? `message ${messages.length}/${total}` : 'Every message WRU relays'}</span>
      </div>
      {messages.length === 0 ? (
        <p className="side-empty">No messages yet. Only messages pass through here. Locations never do.</p>
      ) : (
        <ol className="channel" ref={list} aria-label="Negotiation timeline">
          {messages.map((m, i) => (
            <li key={m.id} className="msg">
              {(i === 0 || messages[i - 1]!.round !== m.round) && <div className="round">Round {m.round}</div>}
              <div className="msg-row">
                <Avatar person={m.from} size="sm" />
                <span className="msg-from">{PERSON_LABEL[m.from]}</span>
                <TypeBadge type={m.type} />
              </div>
              <div className="msg-text">{messageText(m, task)}</div>
              {messageDetail(m) && <div className="msg-detail">{messageDetail(m)}</div>}
            </li>
          ))}
          {next && (
            <li className="msg msg-thinking" aria-live="polite">
              <div className="msg-row">
                <Avatar person={next} size="sm" />
                <span className="msg-from">{PERSON_LABEL[next]}'s Muse is thinking</span>
                <span className="dots-typing">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </li>
          )}
        </ol>
      )}
      {log.length > 0 && (
        <details className="log">
          <summary>Event log {log.length}</summary>
          <ol>
            {[...log].reverse().map((e) => (
              <li key={e.id}>
                <time>{e.at.slice(11, 16)}</time> <code>{e.kind}</code> {e.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden>
      <circle cx="5" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 8h6.5M12 8v2.6M14.2 8v1.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const HOLDER_LABEL: Record<BoundaryRow['holder'], string> = {
  mom: "Mom's token",
  dad: "Dad's token",
  sibling: "Brother's token",
  none: 'No token',
  forged: 'Forged token',
};

function statusText(status: number): string {
  if (status === 200) return '200 allowed';
  if (status === 403) return '403 denied';
  if (status === 401) return '401 denied';
  return String(status);
}

function MatrixCell({ holder, target, status, delay }: { holder: string; target: string; status: number; delay: number }) {
  const hl = useHl('matrix', ...(holder === target ? ['diag'] : []), `${holder}-${target}`);
  // 요청 결과가 하나씩 도착하듯 칸이 차례로 찬다
  return (
    <td className={`cell cell-${status}${hl}`} style={{ animationDelay: `${delay}s` }}>
      {statusText(status)}
    </td>
  );
}

function BoundaryPanel({ boundary, onShow }: { boundary: BoundaryMatrix | null | undefined; onShow?: () => void }) {
  const hlGrid = useHl('matrix', 'grid');
  return (
    <>
      <div className="side-head">
        <h2>Token boundary</h2>
        <span>Real GET /api/agent/presence/:id requests with each agent token</span>
      </div>
      {!boundary ? (
        <button className="btn btn-primary" data-demo="run-boundary" onClick={onShow}>
          Send the 15 requests
        </button>
      ) : (
        <table className={`matrix${hlGrid === ' hl-on' ? hlGrid : ''}`} aria-label="Token boundary matrix">
          <thead>
            <tr>
              <th scope="col">Caller ↓ · Target →</th>
              {PERSON_IDS.map((p) => (
                <th key={p} scope="col">
                  <Avatar person={p} size="sm" />
                  {PERSON_LABEL[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {boundary.rows.map((row, ri) => (
              <tr key={row.holder} className={`row-${row.holder}`}>
                <th scope="row">
                  <div>{HOLDER_LABEL[row.holder]}</div>
                  {row.token && row.holder !== 'forged' && <div className="mask">{row.token}</div>}
                </th>
                {row.cells.map((c, ci) => (
                  <MatrixCell key={c.target} holder={row.holder} target={c.target} status={c.status} delay={(ri * 3 + ci) * 0.11} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="leak-note">Only the diagonal is open. The server compares hashes, never raw tokens, and the screen shows fingerprints only.</p>
    </>
  );
}

/** JSON을 보기 좋게: 긴 transcript는 줄인다 */
function compact(value: Record<string, unknown>): string {
  const v = { ...value };
  if (Array.isArray(v.transcript)) {
    v.transcript = (v.transcript as Record<string, unknown>[]).map(({ reason: _r, round: _round, ...m }) => JSON.stringify(m));
  }
  if (Array.isArray(v.subtasks)) v.subtasks = (v.subtasks as { id: string }[]).map((s) => s.id).join(', ');
  delete v.max_rounds;
  delete v.round;
  delete v.capacity;
  return JSON.stringify(v, null, 1)
    .replace(/\n\s*/g, '\n  ')
    .replace(/\n  }$/, '\n}')
    .replace(/"(\{.*?\})"/g, (_m, inner: string) => inner.replace(/\\"/g, '"'));
}

function MusePanel({ turn, shown }: { turn: MuseTurnView | null | undefined; shown: boolean }) {
  const hlSplit = useHl('muse', 'split');
  const hlReq = useHl('muse', 'request');
  const hlRes = useHl('muse', 'response');
  const hlRewrite = useHl('muse', 'rewrite');
  const hlTools = useHl('muse', 'tools');
  return (
    <>
      <div className="side-head">
        <h2>What the model sees</h2>
        <span>One turn from Dad's agent: it reads its own status through a tool, never from the prompt.{turn?.muse === 'mock' ? ' In this recording, a mock with the same JSON format replies.' : ''}</span>
      </div>
      {!turn ? (
        <p className="side-empty">Run a negotiation first.</p>
      ) : (
        <div className="io">
          <div className={`split${hlSplit}`}>
            <div>
              <div className="split-title">The model decides</div>
              <div>which subtask to go for · fit · offer / counter / commit / refuse</div>
            </div>
            <div>
              <div className="split-title">WRU enforces</div>
              <div>tokens · schema check · reasons rewritten to templates · conflicting commits</div>
            </div>
          </div>
          <div className={`io-col${hlReq}`}>
            <div className="io-label">
              Request <code>POST /v1/chat/completions</code>
              <span>
                model: $MUSE_MODEL · tools: {turn.tools.join(', ')} · response_format: {turn.response_format.type}
              </span>
            </div>
            <pre className="code">{compact(turn.user)}</pre>
          </div>
          <div className={`io-col${hlTools}`}>
            <div className="io-label">Tool calls with Dad's own token (real gateway)</div>
            <pre className="code code-tools">{turn.tool_exchange.map((t) => `${t.call} → ${t.result}`).join('\n')}</pre>
          </div>
          <div className={`io-col${hlRes}`}>
            <div className="io-label">Response (one JSON object)</div>
            {shown ? (
              <pre className="code code-out">{JSON.stringify(turn.action, null, 2)}</pre>
            ) : (
              <pre className="code code-wait">Model is answering…</pre>
            )}
          </div>
          <div className={`rewrite${hlRewrite}`}>
            <div className="rewrite-label">Even if the model slips in a location (real filter code)</div>
            <div className="rewrite-from">{turn.rewrite.from}</div>
            <div className="rewrite-arrow">↓ what the log gets</div>
            <div className="rewrite-to">{turn.rewrite.to}</div>
          </div>
        </div>
      )}
    </>
  );
}

/** 터미널 장면: 명령은 한 글자씩 쳐지고, 출력은 엔터 뒤에 한 번에 나온다 */
const TERM_LINES: { kind: 'c' | 'cmd' | 'out' | 'err'; text: string; at: number }[] = [
  { kind: 'cmd', text: 'cat .env', at: 0.3 },
  { kind: 'out', text: 'WRU_WHERECTX_TOKEN_MOM=wct_••••••••  # read-only, from Mom\'s own WhereCtx\nWRU_ADMIN_TOKEN=••••••••', at: 1.2 },
  { kind: 'cmd', text: 'npm start', at: 4.6 },
  { kind: 'out', text: '[wru] http://localhost:8787  (family: mom=location.example.com, dad=sim, sibling=sim, admin token on)', at: 6.0 },
];
const TYPE_CPS = 30;

function TermTyping() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setT((performance.now() - start) / 1000), 33);
    return () => clearInterval(id);
  }, []);
  const shown = TERM_LINES.filter((l) => t >= l.at);
  const typing = shown.at(-1);
  return (
    <pre className="term-body">
      {shown.map((l, i) => {
        const text = l.kind === 'cmd' ? l.text.slice(0, Math.floor((t - l.at) * TYPE_CPS)) : l.text;
        const caret = l === typing && (l.kind === 'cmd' ? text.length < l.text.length || t - l.at < 0.6 : false);
        return (
          <span key={i} className={`tl${l.kind === 'cmd' && i > 1 ? ' gap' : ''}`}>
            {l.kind === 'cmd' && <span className="p">$ </span>}
            <span className={l.kind === 'c' ? 'c' : l.kind === 'err' ? 'err' : undefined}>{text}</span>
            {caret && <span className="caret" />}
          </span>
        );
      })}
    </pre>
  );
}

function VideoScene({ scene }: { scene: VideoOverlay['scene'] & string }) {
  if (scene === 'intro') {
    return (
      <div className="scene" role="presentation">
        <div className="scene-kicker">Meta Global AI Developer Hackathon</div>
        <div className="scene-title">WRU</div>
        <div className="scene-line">AI agents split family errands. No coordinates shared.</div>
        <div className="contrast">
          <div className="contrast-card">
            <div className="contrast-head">Typical location sharing</div>
            <div className="fake-map" aria-hidden>
              {['p1', 'p2', 'p3'].map((p) => (
                <span key={p} className={`pin ${p}`} />
              ))}
            </div>
            <div className="contrast-foot">Everyone's coordinates, always on a server</div>
          </div>
          <div className="contrast-arrow">→</div>
          <div className="contrast-card contrast-wru">
            <div className="contrast-head">WRU</div>
            <div className="chips">
              <span className="chip-state state-home">Mom · Home</span>
              <span className="chip-state state-in_transit">Dad · On the way, 20 min</span>
              <span className="chip-state state-near_home">Brother · Near home</span>
            </div>
            <div className="contrast-foot">Only status goes in, only roles come out</div>
          </div>
        </div>
      </div>
    );
  }
  if (scene === 'host') {
    return (
      <div className="scene scene-term" role="presentation">
        <div className="term">
          <div className="term-bar">
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
            <span>family-server — zsh</span>
          </div>
          <TermTyping />
        </div>
      </div>
    );
  }
  return (
    <div className="scene" role="presentation">
      <div className="scene-title">WRU</div>
      <ul className="scene-points">
        <li><b>WhereCtx</b> status only, from each person's own server (pre-existing project)</li>
        <li><b>Agent tokens</b> each token reads only its owner's status</li>
        <li><b>Muse</b> offer · counter · commit → roles only</li>
        <li><b>Privacy gate</b> no location text reaches the log, even if the agent knows it</li>
        <li><b>Self-hosted</b> npm start, one server per family</li>
      </ul>
      <div className="scene-note">Muse Spark (muse-spark-1.3) via the Meta Model API · the negotiation is replayed from a recorded live run</div>
    </div>
  );
}

const CONDITION_LABEL: Record<Condition, { title: string; desc: string }> = {
  off: { title: 'Privacy gate off', desc: 'Naive agent chat: neighborhood, distance and exact ETA as-is' },
  filter_only: { title: 'Gate on · agent knows its location', desc: 'Exact location given to the agent; none of its words reach the log' },
  on: { title: 'Privacy gate on (default)', desc: 'Agents can only say their status and a rough ETA' },
};

/** 조건마다 로그에 남는 문장 꼴 (동네 이름 · 숫자는 가림) */
const EXAMPLE: Partial<Record<Condition, string>> = {
  off: '"Passing through [neighborhood] now, [N] km from home, [N] min left"',
  on: '"I\'m already out and can stop by on the way (home within 20 min)"',
};

function pct(v: number): string {
  return `${Math.round(v * 1000) / 10}%`;
}

function Metric({ label, rate, chance }: { label: string; rate: number; chance: number }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <div className="metric-track">
        <div className="metric-fill" style={{ width: `${Math.max(rate * 100, 1)}%` }} />
        <div className="metric-chance" style={{ left: `${chance * 100}%` }} />
      </div>
      <span className="metric-value">{pct(rate)}</span>
    </div>
  );
}

interface LeakPanelProps {
  report: LeakReport | null;
  conditions: Condition[];
  onShowReport: () => void;
}

function LeakCard({ k, report }: { k: Condition; report: LeakReport }) {
  const g = report.gates[k];
  const hlCard = useHl('leak', `card-${k}`);
  const hlLogs = useHl('leak-sub', `${k}-logs`);
  const hlBound = useHl('leak-sub', `${k}-bound`);
  const hlActual = useHl('leak-sub', `${k}-actual`);
  return (
    <section className={`leak-card leak-${k}${hlCard}`}>
      <div className="leak-title">{CONDITION_LABEL[k].title}</div>
      <div className="leak-desc">{CONDITION_LABEL[k].desc}</div>
      <div className={`logs${hlLogs}`}>
        {g.trials} families → <b>{g.distinct_logs}</b> distinct logs
      </div>
      <div className={`bound-big${hlBound}`}>
        <div className="bound-label">Best-case attacker <span>(knows which families share each log)</span></div>
        <div className="bound-nums">
          <span>
            home <b>{pct(g.bound_home_rate)}</b>
          </span>
          <span>
            school <b>{pct(g.bound_school_rate)}</b>
          </span>
        </div>
      </div>
      <div className={`actual${hlActual}`}>
        <div className="actual-label">What {report.adversary === 'meta' ? 'a Muse attacker' : 'a rule-based attacker'} actually found</div>
        <Metric label="home" rate={g.home_rate} chance={report.chance} />
        <Metric label="school" rate={g.school_rate} chance={report.chance} />
      </div>
      {EXAMPLE[k] && <div className="example">Log line: {EXAMPLE[k]}</div>}
    </section>
  );
}

function LeakPanel({ report, conditions, onShowReport }: LeakPanelProps) {
  return (
    <>
      <div className="side-head">
        <h2>Leak test</h2>
        <span>Can the logs alone reveal which district the family lives in, or where the school is? (Seoul has 25 districts; chance = {report ? pct(report.chance) : '4%'})</span>
      </div>
      {!report ? (
        <button className="btn" onClick={onShowReport}>
          Show leak test results
        </button>
      ) : (
        <>
          <div className="leak">
            {conditions.map((k) => (
              <LeakCard key={k} k={k} report={report} />
            ))}
          </div>
          <p className="leak-note">
            Best-case attacker: sees which families share each log and guesses the most common answer. No attacker can beat it with the same logs. Tick mark = chance ({pct(report.chance)})
          </p>
        </>
      )}
    </>
  );
}

// ── 데모 진행 막대 ───────────────────────────────────────────────

function DemoBar({ demo }: { demo: DemoView }) {
  const last = demo.step === demo.total - 1;
  return (
    <div className="demo-bar" role="region" aria-label="Demo progress">
      <div className="demo-count">
        {demo.step + 1}
        <span>/{demo.total}</span>
      </div>
      <div className="demo-text">
        <div className="demo-title">{demo.title}</div>
        <div className="demo-caption">{demo.caption}</div>
      </div>
      <div className="demo-actions">
        {!last && (
          <button className="btn btn-ghost" onClick={demo.onExit}>
            Exit
          </button>
        )}
        <button className="btn btn-light" disabled={demo.busy} onClick={last ? demo.onExit : demo.onNext}>
          {last ? 'End demo' : 'Next ▶'}
        </button>
      </div>
    </div>
  );
}

export function DemoPage(props: DemoPageProps) {
  const { state, playing, error, demo, video } = props;
  const [tab, setTab] = useState<'channel' | 'boundary' | 'muse' | 'report'>('channel');

  const latest = state.negotiations.at(-1);
  const negotiatedTask = latest && state.tasks.find((t) => t.task_id === latest.task_id);
  const task = state.tasks.at(-1);
  const all = latest?.messages ?? [];
  const reveal = demo?.reveal ?? props.reveal ?? null;
  const shown = reveal === null ? all : all.slice(0, reveal);
  const revealing = reveal !== null && reveal < all.length;
  const approved = latest?.status === 'approved' && !revealing;
  const side = demo
    ? demo.focus === 'report' || demo.focus === 'boundary' || demo.focus === 'muse'
      ? demo.focus
      : 'channel'
    : tab;
  const tokenMark = (p: PersonId) => props.boundary?.rows.find((r) => r.holder === p)?.token ?? null;

  return (
    <HighlightContext.Provider value={video?.hl ?? null}>
    <div
      className={`wru${demo ? ` demo-on focus-${demo.focus}` : ''}${video ? ' video-on' : ''}${video?.hl ? ' has-hl' : ''}${video?.scene ? ` scene-on scene-${video.scene}` : ''}`}
    >
      {/* 영상 모드의 앱 화면 묶음: 커서 좌표의 기준이고, 패널 컷(cam-panel)에서는 폰을 흐리게 한다 */}
      {video && (
        <div className="browser-bar" aria-hidden>
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
          <span className="tab">WRU · {video.chapter ?? 'Family errands'}</span>
          <span className="url">localhost:8787/demo</span>
        </div>
      )}
      <div className={`cam${video?.camera ? ` cam-${video.camera}` : ''}`}>
      <header className="top">
        <div className="brand">
          <strong>WRU</strong>
          <span>AI agents split family errands. No coordinates shared.</span>
        </div>
        <div className="controls">
          <span className="clock" aria-label="Sim clock">
            {state.clock.label}
          </span>
          {!demo && (
            <>
              <div className="seg">
                <button onClick={() => props.onAdvance(1)}>+1 min</button>
                <button onClick={() => props.onAdvance(5)}>+5 min</button>
                <button onClick={() => props.onAdvance(10)}>+10 min</button>
                <button onClick={props.onTogglePlay}>{playing ? '⏸ Pause' : '▶ Play'}</button>
                <button onClick={props.onReset}>Reset</button>
              </div>
              {props.onStartDemo && !video && (
                <button className="btn btn-primary" onClick={props.onStartDemo}>
                  ▶ Demo mode
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {demo && <DemoBar demo={demo} />}
      {error && <div className="error">{error}</div>}

      <Hub
        state={state}
        task={task}
        latest={latest}
        revealing={revealing}
        shown={shown.length}
        onSubmitHeroTask={props.onSubmitHeroTask}
        onNegotiate={props.onNegotiate}
        onApprove={props.onApprove}
      />

      <div className="stage">
        <div className="phones zone-phones">
          {PERSON_IDS.map((p) => (
            <Phone
              key={p}
              person={p}
              tokenMark={tokenMark(p)}
              presence={state.presence.find((x) => x.person_id === p)!}
              clock={state.clock.label}
              task={task}
              messages={shown.filter((m) => m.from === p)}
              role={approved && latest ? latest.assignment.notify[p] : null}
            />
          ))}
        </div>
        <aside className="side zone-side">
          {!demo && (
            <div className="tabs" role="tablist">
              <button role="tab" data-demo="tab-channel" aria-selected={side === 'channel'} onClick={() => setTab('channel')}>
                Muse channel
              </button>
              <button
                role="tab"
                data-demo="tab-model"
                aria-selected={side === 'muse'}
                onClick={() => {
                  setTab('muse');
                  props.onShowMuse?.();
                }}
              >
                Model
              </button>
              <button
                role="tab"
                data-demo="tab-boundary"
                aria-selected={side === 'boundary'}
                onClick={() => {
                  setTab('boundary');
                  // 영상에서는 탭을 연 뒤 버튼을 눌러 요청을 직접 보낸다
                  if (!video) props.onShowBoundary?.();
                }}
              >
                Token boundary
              </button>
              <button
                role="tab"
                data-demo="tab-leak"
                aria-selected={side === 'report'}
                onClick={() => {
                  setTab('report');
                  if (!props.report) props.onShowReport();
                }}
              >
                Leak test
              </button>
            </div>
          )}
          {side === 'channel' ? (
            <Channel messages={shown} task={negotiatedTask} total={all.length} log={demo ? [] : state.log} next={revealing ? all[shown.length]?.from : undefined} />
          ) : side === 'boundary' ? (
            <BoundaryPanel boundary={props.boundary} onShow={props.onShowBoundary} />
          ) : side === 'muse' ? (
            <MusePanel turn={props.museTurn} shown={props.museShown ?? true} />
          ) : (
            <LeakPanel
              report={props.report}
              conditions={demo?.conditions ?? ['off', 'on', 'filter_only']}
              onShowReport={props.onShowReport}
            />
          )}
        </aside>
      </div>

      <footer>No coordinates, addresses or school names are collected or shown. From WhereCtx we only take status and ETA.</footer>
      {video?.cursor && !video.scene && (
        <div className={`cursor${video.cursor.down ? ' down' : ''}`} style={{ left: video.cursor.x, top: video.cursor.y }} aria-hidden>
          <svg viewBox="0 0 24 24" width="26" height="26">
            <path d="M4 2 L4 20 L9 15 L12.5 22 L15.5 20.6 L12 13.8 L19 13.8 Z" fill="#111" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      </div>
      {video?.scene && <VideoScene scene={video.scene} />}
      {/* 자막은 브라우저 창 밖, 화면 아래 띠에 */}
      {video && <div className="sub-band">{video.caption && <div className="subtitle">{video.caption}</div>}</div>}
    </div>
    </HighlightContext.Provider>
  );
}
