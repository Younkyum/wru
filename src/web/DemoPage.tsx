import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DemoState, PersonId, Presence, PresenceState, Task } from '../shared/contracts';
import { PERSON_IDS, PERSON_LABEL_KO, STATE_LABEL_KO, localHHMM } from '../shared/contracts';
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
  /** Muse 응답(JSON)을 펼쳤는지. 기본 true */
  museShown?: boolean;
  onStartDemo?: () => void;
  demo?: DemoView | null;
  /** 영상 녹화 모드 (/demo?video=1): 자막 · 인트로 · 아웃트로 */
  video?: VideoOverlay | null;
}

export interface VideoOverlay {
  caption: string | null;
  scene: 'intro' | 'host' | 'outro' | null;
  /** 내레이션이 지금 가리키는 대상 (강조) */
  hl: string | null;
}

// ── 영상 강조: 내레이션이 가리키는 대상은 또렷하게, 같은 묶음의 나머지는 흐리게 ──
const HL_GROUP: Record<string, string> = {
  phones: 'phones', mom: 'phones', dad: 'phones', sibling: 'phones', roles: 'phones',
  diag: 'matrix', 'dad-mom': 'matrix',
  request: 'muse', response: 'muse', split: 'muse', rewrite: 'muse',
  logs: 'leak-on', bound: 'leak-on', actual: 'leak-on',
  'card-on': 'leak', 'card-off': 'leak', 'card-filter_only': 'leak',
  hub: 'hub',
};
const HighlightContext = createContext<string | null>(null);

/** keys 중 하나가 지금 강조 대상이면 hl-on, 같은 묶음의 다른 대상이 강조 중이면 hl-dim */
function useHl(group: string, ...keys: string[]): string {
  const hl = useContext(HighlightContext);
  if (!hl || HL_GROUP[hl] !== group) return '';
  return keys.includes(hl) ? ' hl-on' : ' hl-dim';
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

const INITIAL: Record<PersonId, string> = { mom: '엄', dad: '아', sibling: '형' };

function Avatar({ person, size = 'md' }: { person: PersonId; size?: 'sm' | 'md' }) {
  return (
    <span className={`avatar avatar-${person} avatar-${size}`} aria-hidden>
      {INITIAL[person]}
    </span>
  );
}

function etaText(p: Presence): string {
  return p.eta_minutes === null ? '지금 집이에요' : `집까지 약 ${p.eta_minutes}분`;
}

function subtaskLabel(task: Task | undefined, id: string): string {
  return task?.subtasks.find((s) => s.id === id)?.label ?? id;
}

const FIT_LABEL: Record<Fit, string> = { high: '적합 높음', medium: '적합 보통', low: '적합 낮음' };

function messageText(m: NegotiationMessage, task: Task | undefined): string {
  switch (m.type) {
    case 'offer':
      return `${subtaskLabel(task, m.subtask_id)} 할게요`;
    case 'counter':
      return `${subtaskLabel(task, m.subtask_id)} 대신 ${subtaskLabel(task, m.alternative)}`;
    case 'commit':
      return `${subtaskLabel(task, m.subtask_id)} 확정`;
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

function Phone({ person, tokenMark, presence, clock, task, messages, role }: PhoneProps) {
  const feed = useRef<HTMLDivElement>(null);
  const hl = useHl('phones', 'phones', person, ...(role && !role.includes('없어요') ? ['roles'] : []));
  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [messages.length, role]);
  return (
    <article className={`phone phone-${person}${hl}`} aria-label={`${PERSON_LABEL_KO[person]}의 폰`}>
      <div className="phone-screen">
        <div className="phone-status">
          <span>{clock}</span>
          <span className="notch" />
          <span>WRU</span>
        </div>
        <header className="phone-head">
          <Avatar person={person} />
          <div>
            <div className="phone-owner">{PERSON_LABEL_KO[person]}</div>
            <div className="phone-sub">내 WhereCtx · 내 Muse</div>
          </div>
          {tokenMark && (
            <span className="key zone-key" title="이 에이전트의 토큰 (지문)">
              <KeyIcon />
              {tokenMark.replace('wru_ag_…', '')}
            </span>
          )}
        </header>
        <section className="me zone-presence">
          <SelfRing presence={presence} />
          <div>
            <div className={`state state-${presence.state}`}>{STATE_LABEL_KO[presence.state]}</div>
            <div className="eta">{etaText(presence)}</div>
          </div>
        </section>
        <div className="feed zone-feed" ref={feed}>
          {!task && <p className="feed-empty">다른 가족의 위치는 이 폰에 없어요.</p>}
          {task && (
            <div className="note">
              <div className="note-title">가족 일 · {localHHMM(task.deadline)}까지</div>
              <div className="note-body">{task.subtasks.map((s) => s.label).join(' + ')}</div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className="bubble">
              <TypeBadge type={m.type} />
              <span>{messageText(m, task)}</span>
            </div>
          ))}
          {role && <div className={`role-card zone-role${role.includes('없어요') ? ' role-none' : ''}`}>{role}</div>}
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
          <div className="hub-title">가족 일이 없어요</div>
          <div className="hub-sub">태스크를 넣으면 Muse 3명이 역할을 나눠요</div>
        </div>
        <button className="btn btn-primary" onClick={onSubmitHeroTask}>
          ＋ 6시에 민아 픽업 + 우유
        </button>
      </>
    );
  } else if (!latest || latest.task_id !== task.task_id) {
    body = (
      <>
        <div className="hub-text">
          <div className="hub-title">
            {task.subtasks.map((s) => s.label).join(' + ')}
            <span className="hub-deadline">{localHHMM(task.deadline)}까지</span>
          </div>
          <div className="hub-sub">
            {task.requested_by ? `${PERSON_LABEL_KO[task.requested_by]}가 낸 일 · ` : ''}
            {task.constraints.max_subtasks_per_person === 1 ? '한 사람은 한 가지 일만' : '인원 제한 없음'}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => onNegotiate(task.task_id)}>
          Muse 3명에게 맡기기
        </button>
      </>
    );
  } else if (revealing) {
    body = (
      <div className="hub-text">
        <div className="hub-title">Muse 3명이 협상하는 중</div>
        <div className="hub-sub">
          메시지 {shown}/{latest.messages.length}
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
              {PERSON_LABEL_KO[a.person]} = {subtaskLabel(task, a.subtask)}
            </span>
          ))}
          {latest.assignment.unassigned.map((id) => (
            <span key={id} className="hub-role hub-role-none">
              미배정 · {subtaskLabel(task, id)}
            </span>
          ))}
        </div>
        {latest.status === 'approved' ? (
          <span className="hub-ok">
            {task.requested_by ? `${PERSON_LABEL_KO[task.requested_by]}가 승인 · ` : '승인됨 · '}각자 자기 역할만 받았어요
          </span>
        ) : (
          <button className="btn btn-primary" onClick={() => onApprove(latest.negotiation_id)}>
            {task.requested_by ? `${PERSON_LABEL_KO[task.requested_by]}가 승인하고 통지 보내기` : '이대로 승인하고 통지 보내기'}
          </button>
        )}
      </>
    );
  }
  const hl = useHl('hub', 'hub');
  return (
    <section className={`hub zone-hub${hl}`} aria-label="WRU 인박스와 역할">
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
}

function Channel({ messages, task, total, log }: ChannelProps) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.length]);
  return (
    <>
      <div className="side-head">
        <h2>Muse 채널</h2>
        <div className="chain">에이전트 Muse → Meta Model API → 모델 Muse Spark</div>
        <span>{total ? `메시지 ${messages.length}/${total}` : 'WRU가 중계하는 메시지 전부'}</span>
      </div>
      {messages.length === 0 ? (
        <p className="side-empty">아직 오간 메시지가 없어요. 여기에는 메시지만 지나가고, 위치는 지나가지 않아요.</p>
      ) : (
        <ol className="channel" ref={list} aria-label="협상 타임라인">
          {messages.map((m, i) => (
            <li key={m.id} className="msg">
              {(i === 0 || messages[i - 1]!.round !== m.round) && <div className="round">라운드 {m.round}</div>}
              <div className="msg-row">
                <Avatar person={m.from} size="sm" />
                <span className="msg-from">{PERSON_LABEL_KO[m.from]}</span>
                <TypeBadge type={m.type} />
              </div>
              <div className="msg-text">{messageText(m, task)}</div>
              {messageDetail(m) && <div className="msg-detail">{messageDetail(m)}</div>}
            </li>
          ))}
        </ol>
      )}
      {log.length > 0 && (
        <details className="log">
          <summary>이벤트 로그 {log.length}</summary>
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
  mom: '엄마 토큰',
  dad: '아빠 토큰',
  sibling: '형 토큰',
  none: '토큰 없음',
  forged: '위조 토큰',
};

function statusText(status: number): string {
  if (status === 200) return '200 허용';
  if (status === 403) return '403 거절';
  if (status === 401) return '401 거절';
  return String(status);
}

function MatrixCell({ holder, target, status }: { holder: string; target: string; status: number }) {
  const hl = useHl('matrix', ...(holder === target ? ['diag'] : []), `${holder}-${target}`);
  return <td className={`cell cell-${status}${hl}`}>{statusText(status)}</td>;
}

function BoundaryPanel({ boundary, onShow }: { boundary: BoundaryMatrix | null | undefined; onShow?: () => void }) {
  return (
    <>
      <div className="side-head">
        <h2>토큰 경계</h2>
        <span>에이전트 토큰으로 GET /api/agent/presence/:id를 실제로 보낸 결과</span>
      </div>
      {!boundary ? (
        <button className="btn" onClick={onShow}>
          경계 확인하기
        </button>
      ) : (
        <table className="matrix" aria-label="토큰 경계표">
          <thead>
            <tr>
              <th scope="col">요청한 쪽 ↓ · 대상 →</th>
              {PERSON_IDS.map((p) => (
                <th key={p} scope="col">
                  <Avatar person={p} size="sm" />
                  {PERSON_LABEL_KO[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {boundary.rows.map((row) => (
              <tr key={row.holder} className={`row-${row.holder}`}>
                <th scope="row">
                  <div>{HOLDER_LABEL[row.holder]}</div>
                  {row.token && row.holder !== 'forged' && <div className="mask">{row.token}</div>}
                </th>
                {row.cells.map((c) => (
                  <MatrixCell key={c.target} holder={row.holder} target={c.target} status={c.status} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="leak-note">대각선만 열려요. 서버는 토큰 원문이 아니라 해시만 비교하고, 화면에는 지문만 보여요.</p>
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
  return (
    <>
      <div className="side-head">
        <h2>Muse에게 가는 것</h2>
        <span>아빠 에이전트의 한 차례 · Meta Model API 요청 본문 (실제 코드 경로)</span>
      </div>
      {turn?.muse === 'mock' && <p className="mock-note">응답: 키 발급 전이라 같은 JSON 스키마의 mock</p>}
      {!turn ? (
        <p className="side-empty">협상을 먼저 돌려 주세요.</p>
      ) : (
        <div className="io">
          <div className={`split${hlSplit}`}>
            <div>
              <div className="split-title">모델이 정함</div>
              <div>어느 일에 나설지 · 적합도 · offer / counter / commit / refuse</div>
            </div>
            <div>
              <div className="split-title">WRU가 정함</div>
              <div>토큰 · 스키마 검사 · 이유 문장 템플릿화 · 겹친 commit 판정</div>
            </div>
          </div>
          <div className={`io-col${hlReq}`}>
            <div className="io-label">
              요청 <code>POST /v1/chat/completions</code>
              <span>
                model: $MUSE_MODEL · response_format: {turn.response_format.type}
              </span>
            </div>
            <pre className="code">{compact(turn.user)}</pre>
          </div>
          <div className={`io-col${hlRes}`}>
            <div className="io-label">응답 (JSON 하나)</div>
            {shown ? (
              <pre className="code code-out">{JSON.stringify(turn.action, null, 2)}</pre>
            ) : (
              <pre className="code code-wait">모델이 답하는 중…</pre>
            )}
          </div>
          <div className={`rewrite${hlRewrite}`}>
            <div className="rewrite-label">모델이 위치를 섞어 써도 (실제 필터 코드)</div>
            <div className="rewrite-from">{turn.rewrite.from}</div>
            <div className="rewrite-arrow">↓ 로그에 나가는 문장</div>
            <div className="rewrite-to">{turn.rewrite.to}</div>
          </div>
        </div>
      )}
    </>
  );
}

function VideoScene({ scene }: { scene: VideoOverlay['scene'] & string }) {
  if (scene === 'intro') {
    return (
      <div className="scene" role="presentation">
        <div className="scene-kicker">Meta Global AI Developer Hackathon</div>
        <div className="scene-title">WRU</div>
        <div className="scene-line">좌표 없이, 가족의 Muse들이 할 일을 나눠요</div>
        <div className="contrast">
          <div className="contrast-card">
            <div className="contrast-head">보통의 위치 공유</div>
            <div className="fake-map" aria-hidden>
              {['p1', 'p2', 'p3'].map((p) => (
                <span key={p} className={`pin ${p}`} />
              ))}
            </div>
            <div className="contrast-foot">가족 모두의 좌표가 늘 서버에</div>
          </div>
          <div className="contrast-arrow">→</div>
          <div className="contrast-card contrast-wru">
            <div className="contrast-head">WRU</div>
            <div className="chips">
              <span className="chip-state state-home">엄마 · 집</span>
              <span className="chip-state state-in_transit">아빠 · 이동 중 20분</span>
              <span className="chip-state state-near_home">형 · 집 근처</span>
            </div>
            <div className="contrast-foot">상태만 오가고, 결과는 역할만</div>
          </div>
        </div>
      </div>
    );
  }
  if (scene === 'host') {
    return (
      <div className="scene scene-light" role="presentation">
        <div className="scene-kicker">Host your own</div>
        <ol className="host-steps">
          <li>
            <b>각자</b> 자기 WhereCtx에서 agent 토큰 발급
          </li>
          <li>
            <b>가족 서버</b>의 .env에 토큰, family.config.json에 주소
          </li>
          <li>
            <b>npm start</b> 또는 Docker 한 번 · 에이전트 토큰은 서버가 발급
          </li>
        </ol>
        <div className="scene-line">위치는 각자의 서버에, WRU는 상태만 읽어요</div>
      </div>
    );
  }
  return (
    <div className="scene" role="presentation">
      <div className="scene-title">WRU</div>
      <ul className="scene-points">
        <li><b>WhereCtx</b> 각자 자기 서버에서 상태만</li>
        <li><b>에이전트 토큰</b> 내 토큰으로는 내 것만</li>
        <li><b>Muse</b> offer · counter · commit으로 역할만</li>
        <li><b>게이트</b> 위치를 알아도 로그는 같다</li>
        <li><b>자가 호스팅</b> npm start · Docker, 가족 서버 하나</li>
      </ul>
      <div className="scene-note">이 녹화의 Muse는 같은 스키마의 mock · MODEL_API_KEY를 넣으면 Muse Spark</div>
    </div>
  );
}

const CONDITION_LABEL: Record<Condition, { title: string; desc: string }> = {
  off: { title: '게이트 off', desc: '동네 이름 · 거리 · 정확한 ETA를 그대로 말할 때' },
  filter_only: { title: '게이트 on · 에이전트가 위치를 알 때', desc: '위치를 몰래 쥐여 줘도 로그엔 템플릿만 → on과 같은 숫자' },
  on: { title: '게이트 on (WRU 기본)', desc: '상세 위치 거절 · 상태 템플릿 · ETA 구간' },
};

/** 조건마다 로그에 남는 문장 꼴 (동네 이름 · 숫자는 가림) */
const EXAMPLE: Partial<Record<Condition, string>> = {
  off: '"지금 ○○동 지나는 중이에요. 집까지 N km, N분 남았어요"',
  on: '"이동 중이라 가는 길에 들를 수 있어요 (도착 20분 이내)"',
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
  const hlLogs = useHl('leak-on', 'logs');
  const hlBound = useHl('leak-on', 'bound');
  const hlActual = useHl('leak-on', 'actual');
  return (
    <section className={`leak-card leak-${k}${hlCard}`}>
      <div className="leak-title">{CONDITION_LABEL[k].title}</div>
      <div className="leak-desc">{CONDITION_LABEL[k].desc}</div>
      <div className={`logs${hlLogs}`}>
        시나리오 {g.trials}개 → 로그 <b>{g.distinct_logs}</b>종류
      </div>
      <div className={`bound-big${hlBound}`}>
        <div className="bound-label">어떤 적대자든 맞힐 수 있는 최대</div>
        <div className="bound-nums">
          <span>
            집 <b>{pct(g.bound_home_rate)}</b>
          </span>
          <span>
            학교 <b>{pct(g.bound_school_rate)}</b>
          </span>
        </div>
      </div>
      <div className={`actual${hlActual}`}>
        <div className="actual-label">규칙 기반 적대자가 실제로 맞힌 비율</div>
        <Metric label="집" rate={g.home_rate} chance={report.chance} />
        <Metric label="학교" rate={g.school_rate} chance={report.chance} />
      </div>
      {EXAMPLE[k] && <div className="example">로그 예: {EXAMPLE[k]}</div>}
    </section>
  );
}

function LeakPanel({ report, conditions, onShowReport }: LeakPanelProps) {
  return (
    <>
      <div className="side-head">
        <h2>누수 테스트</h2>
        <span>협상 로그만 보고 집 · 학교가 서울 25개 구 중 어디인지 맞히기 (우연 {report ? pct(report.chance) : '4%'})</span>
      </div>
      {!report ? (
        <button className="btn" onClick={onShowReport}>
          누수 테스트 결과 보기
        </button>
      ) : (
        <>
          <div className="leak">
            {conditions.map((k) => (
              <LeakCard key={k} k={k} report={report} />
            ))}
          </div>
          <p className="leak-note">
            최대: 같은 로그끼리 묶어 정답을 미리 알고 골랐을 때의 적중률이라 적대자(LLM 포함) 구현과 무관 · 막대의 세로선은 우연 {pct(report.chance)}
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
    <div className="demo-bar" role="region" aria-label="데모 진행">
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
            나가기
          </button>
        )}
        <button className="btn btn-light" disabled={demo.busy} onClick={last ? demo.onExit : demo.onNext}>
          {last ? '데모 끝내기' : '다음 ▶'}
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
  const reveal = demo?.reveal ?? null;
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
      className={`wru${demo ? ` demo-on focus-${demo.focus}` : ''}${video ? ' video-on' : ''}${video?.hl ? ' has-hl' : ''}${video?.scene ? ' scene-on' : ''}`}
    >
      <header className="top">
        <div className="brand">
          <strong>WRU</strong>
          <span>좌표 없이, 가족의 Muse들이 할 일을 나눠요</span>
        </div>
        <div className="controls">
          <span className="clock" aria-label="시뮬 시계">
            {state.clock.label}
          </span>
          {!demo && (
            <>
              <div className="seg">
                <button onClick={() => props.onAdvance(1)}>+1분</button>
                <button onClick={() => props.onAdvance(5)}>+5분</button>
                <button onClick={() => props.onAdvance(10)}>+10분</button>
                <button onClick={props.onTogglePlay}>{playing ? '⏸ 일시정지' : '▶ 재생'}</button>
                <button onClick={props.onReset}>리셋</button>
              </div>
              {props.onStartDemo && (
                <button className="btn btn-primary" onClick={props.onStartDemo}>
                  ▶ 데모 모드
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
              <button role="tab" aria-selected={side === 'channel'} onClick={() => setTab('channel')}>
                Muse 채널
              </button>
              <button
                role="tab"
                aria-selected={side === 'boundary'}
                onClick={() => {
                  setTab('boundary');
                  props.onShowBoundary?.();
                }}
              >
                토큰 경계
              </button>
              <button
                role="tab"
                aria-selected={side === 'report'}
                onClick={() => {
                  setTab('report');
                  if (!props.report) props.onShowReport();
                }}
              >
                누수 테스트
              </button>
            </div>
          )}
          {side === 'channel' ? (
            <Channel messages={shown} task={negotiatedTask} total={all.length} log={demo ? [] : state.log} />
          ) : side === 'boundary' ? (
            <BoundaryPanel boundary={props.boundary} onShow={props.onShowBoundary} />
          ) : side === 'muse' ? (
            <MusePanel turn={props.museTurn} shown={props.museShown ?? true} />
          ) : (
            <LeakPanel
              report={props.report}
              conditions={demo?.conditions ?? ['off', 'filter_only', 'on']}
              onShowReport={props.onShowReport}
            />
          )}
        </aside>
      </div>

      <footer>좌표 · 주소 · 학교 이름은 받지도, 보여 주지도 않아요. WhereCtx에서는 상태와 ETA만 받습니다.</footer>
      {video?.caption && <div className="subtitle">{video.caption}</div>}
      {video?.scene && <VideoScene scene={video.scene} />}
    </div>
    </HighlightContext.Provider>
  );
}
