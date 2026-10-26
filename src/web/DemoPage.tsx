import { useEffect, useRef } from 'react';
import type { DemoState, PersonId, Presence, PresenceState, Task } from '../shared/contracts';
import { PERSON_IDS, PERSON_LABEL_KO, STATE_LABEL_KO, localHHMM } from '../shared/contracts';
import type { Fit, MessageType, NegotiationMessage, NegotiationRecord } from '../shared/negotiation';
import { REASON_CODE_TEXT } from '../shared/negotiation';
import type { Condition, LeakReport } from '../shared/leak-report';
import type { PanelName } from './demoSteps';

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
  onStartDemo?: () => void;
  demo?: DemoView | null;
}

/** 데모 모드 진행 상태 */
export interface DemoView {
  step: number;
  total: number;
  title: string;
  caption: string;
  focus: PanelName;
  /** 협상 타임라인에서 지금까지 보여 줄 메시지 수 (애니메이션) */
  reveal: number | null;
  /** 누수 패널에서 보여 줄 조건 */
  conditions: Condition[];
  busy: boolean;
  onNext: () => void;
  onExit: () => void;
}

function panelClass(base: string, name: PanelName, demo?: DemoView | null): string {
  if (!demo) return `panel ${base}`;
  return `panel ${base} ${demo.focus === name ? 'spotlight' : 'dim'}`;
}

// 거리 링은 상태 단계만 나타낸다. 실제 방향·거리와 무관한 고정 배치.
const RING_RADIUS: Record<PresenceState, number> = { home: 0, near_home: 92, in_transit: 150, unknown: 150 };
const PERSON_ANGLE: Record<PersonId, number> = { mom: -90, dad: 30, sibling: 150 };
const PERSON_EMOJI: Record<PersonId, string> = { mom: '👩', dad: '👨', sibling: '🧑' };
const HOME_SLOT: Record<PersonId, [number, number]> = { mom: [-26, 30], dad: [0, 38], sibling: [26, 30] };
const C = 180;

function slot(p: Presence): [number, number] {
  if (p.state === 'home') {
    const [dx, dy] = HOME_SLOT[p.person_id];
    return [C + dx, C + dy];
  }
  const rad = (PERSON_ANGLE[p.person_id] * Math.PI) / 180;
  const r = RING_RADIUS[p.state];
  return [Math.round(C + r * Math.cos(rad)), Math.round(C + r * Math.sin(rad))];
}

function etaText(p: Presence): string {
  return p.eta_minutes === null ? '—' : `약 ${p.eta_minutes}분`;
}

function MapPanel({ presence, demo }: { presence: Presence[]; demo?: DemoView | null }) {
  return (
    <section className={panelClass('map-panel', 'map', demo)} aria-label="맵">
      <h2>맵 <span className="hint">상태만 · 핀 없음</span></h2>
      <svg viewBox="0 0 360 360" className="map" role="img" aria-label="가족 상태 링">
        <circle cx={C} cy={C} r={150} className="ring ring-transit" />
        <circle cx={C} cy={C} r={92} className="ring ring-near" />
        <circle cx={C} cy={C} r={44} className="ring ring-home" />
        <text x={C} y={C - 156} className="ring-label">이동 중</text>
        <text x={C} y={C - 98} className="ring-label">집 근처</text>
        <text x={C} y={C + 6} className="home-icon">🏠</text>
        {presence.map((p) => {
          const [x, y] = slot(p);
          return (
            <g key={p.person_id} transform={`translate(${x} ${y})`} className={`avatar state-${p.state}`}>
              <circle r={17} />
              <text y={6} className="avatar-emoji">{PERSON_EMOJI[p.person_id]}</text>
              {p.state !== 'home' && (
                <text y={33} className="avatar-label">{`${PERSON_LABEL_KO[p.person_id]} · ${etaText(p)}`}</text>
              )}
            </g>
          );
        })}
      </svg>
      <ul className="badges">
        {presence.map((p) => (
          <li key={p.person_id} data-person={p.person_id}>
            <span className="who">{PERSON_EMOJI[p.person_id]} {PERSON_LABEL_KO[p.person_id]}</span>
            <span className={`badge state-${p.state}`}>{STATE_LABEL_KO[p.state]}</span>
            <span className="eta">ETA {etaText(p)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function subtaskLabel(task: Task | undefined, id: string): string {
  return task?.subtasks.find((s) => s.id === id)?.label ?? id;
}

const TYPE_LABEL: Record<MessageType, string> = { offer: 'offer', counter: 'counter', commit: 'commit', refuse: 'refuse' };
const FIT_LABEL: Record<Fit, string> = { high: '적합 높음', medium: '적합 보통', low: '적합 낮음' };

function messageText(m: NegotiationMessage, task: Task | undefined): string {
  switch (m.type) {
    case 'offer':
      return `${subtaskLabel(task, m.subtask_id)} 할게요 — ${m.reason}`;
    case 'counter':
      return `${subtaskLabel(task, m.subtask_id)} → ${subtaskLabel(task, m.alternative)} — ${m.reason}`;
    case 'commit':
      return `${subtaskLabel(task, m.subtask_id)} 확정`;
    case 'refuse':
      return `${subtaskLabel(task, m.subtask_id)}: ${REASON_CODE_TEXT[m.reason_code]}`;
  }
}

function Timeline({ record, task, reveal }: { record: NegotiationRecord; task: Task | undefined; reveal?: number | null }) {
  const shown = reveal == null ? record.messages : record.messages.slice(0, reveal);
  const list = useRef<HTMLOListElement>(null);
  // 새 메시지가 보이면 타임라인 안에서 맨 아래로
  useEffect(() => {
    if (reveal != null && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [reveal]);
  return (
    <ol className="timeline" aria-label="협상 타임라인" ref={list}>
      {shown.map((m, i) => (
        <li key={m.id} className={`msg msg-${m.type}${reveal != null && i === shown.length - 1 ? ' msg-new' : ''}`}>
          {(i === 0 || record.messages[i - 1]!.round !== m.round) && <div className="round">라운드 {m.round}</div>}
          <div className="msg-row">
            <span className={`type-badge type-${m.type}`}>{TYPE_LABEL[m.type]}</span>
            <span className="from">{PERSON_EMOJI[m.from]} {PERSON_LABEL_KO[m.from]}</span>
            {(m.type === 'offer' || m.type === 'counter') && <span className="fit">{FIT_LABEL[m.fit]}</span>}
          </div>
          <div className="msg-text">{messageText(m, task)}</div>
        </li>
      ))}
    </ol>
  );
}

function InboxPanel(props: {
  state: DemoState;
  onSubmitHeroTask: () => void;
  onNegotiate: (taskId: string) => void;
  demo?: DemoView | null;
}) {
  const { state } = props;
  const log = [...state.log].reverse();
  const latest = state.negotiations.at(-1);
  const latestTask = latest && state.tasks.find((t) => t.task_id === latest.task_id);
  return (
    <section className={panelClass('inbox-panel', 'inbox', props.demo)} aria-label="인박스와 협상">
      <h2>인박스 · 협상 <span className="hint">Muse: {state.muse === 'meta' ? 'Meta Model API' : 'mock'}</span></h2>
      <button className="primary" onClick={props.onSubmitHeroTask}>＋ 태스크 투입: 6시에 민아 픽업 + 우유</button>
      {state.tasks.length === 0 ? (
        <p className="empty">아직 들어온 태스크가 없어요.</p>
      ) : (
        <ul className="tasks">
          {state.tasks.map((t) => {
            const negotiated = state.negotiations.some((n) => n.task_id === t.task_id);
            return (
              <li key={t.task_id} className="task">
                <div className="task-head">
                  <code>{t.task_id}</code>
                  <span className="deadline">마감 {localHHMM(t.deadline)}</span>
                </div>
                <div className="chips">
                  {t.subtasks.map((s) => (
                    <span key={s.id} className="chip">{s.label}</span>
                  ))}
                </div>
                {t.constraints.max_subtasks_per_person !== null && (
                  <div className="constraint">한 사람당 최대 {t.constraints.max_subtasks_per_person}개</div>
                )}
                {!negotiated && (
                  <button className="negotiate" onClick={() => props.onNegotiate(t.task_id)}>Muse 3명에게 협상 맡기기</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {latest && (
        <>
          <h3>협상 타임라인 <span className="hint">{latest.rounds}라운드 · 메시지 {latest.messages.length}개</span></h3>
          <Timeline record={latest} task={latestTask} reveal={props.demo?.reveal} />
        </>
      )}
      <details className="log-wrap">
        <summary>이벤트 로그 ({log.length})</summary>
        <ol className="log">
          {log.map((e) => (
            <li key={e.id} className={`log-${e.kind}`}>
              <time>{e.at.slice(11, 16)}</time>
              <span className="kind">{e.kind}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function AssignmentPanel({ state, onApprove, demo }: { state: DemoState; onApprove: (id: string) => void; demo?: DemoView | null }) {
  const latest = state.negotiations.at(-1);
  const revealing = demo?.reveal != null && latest != null && demo.reveal < latest.messages.length;
  if (!latest || revealing) {
    return (
      <section className={panelClass('assignment-panel', 'assignment', demo)} aria-label="역할 배정">
        <h2>역할 배정</h2>
        <div className="placeholder">
          <p>{revealing ? 'Muse 3명이 협상하는 중이에요…' : '태스크를 넣고 협상을 맡기면 Muse 3명이 offer → counter → commit으로 역할을 정해요.'}</p>
          <p className="hint">결과에는 역할만 나오고, 위치는 나오지 않아요.</p>
        </div>
      </section>
    );
  }
  const task = state.tasks.find((t) => t.task_id === latest.task_id);
  const { assignment } = latest;
  return (
    <section className={panelClass('assignment-panel', 'assignment', demo)} aria-label="역할 배정">
      <h2>역할 배정 <span className={`status status-${latest.status}`}>{latest.status === 'approved' ? '승인됨' : '승인 대기'}</span></h2>
      <ul className="roles">
        {assignment.assignments.map((a) => (
          <li key={a.subtask}>
            <span className="role-person">{PERSON_EMOJI[a.person]} {PERSON_LABEL_KO[a.person]}</span>
            <span className="role-arrow">=</span>
            <span className="role-task">{subtaskLabel(task, a.subtask)}</span>
          </li>
        ))}
        {assignment.unassigned.map((id) => (
          <li key={id} className="unassigned">
            <span className="role-person">미배정</span>
            <span className="role-arrow">·</span>
            <span className="role-task">{subtaskLabel(task, id)}</span>
          </li>
        ))}
      </ul>
      {latest.status === 'awaiting_approval' ? (
        <button className="primary" onClick={() => onApprove(latest.negotiation_id)}>이대로 승인하고 통지 보내기</button>
      ) : (
        <>
          <h3>사람별 통지 <span className="hint">각자 자기 역할만 받아요</span></h3>
          <ul className="notify">
            {PERSON_IDS.map((p) => (
              <li key={p} className="phone" data-person={p}>
                <div className="phone-head">{PERSON_EMOJI[p]} {PERSON_LABEL_KO[p]}의 화면</div>
                <div className="phone-body">{assignment.notify[p]}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

const CONDITION_LABEL: Record<Condition, { title: string; desc: string }> = {
  off: { title: '게이트 off', desc: '동네 이름 · 거리 · 정확한 ETA를 그대로 말할 때' },
  filter_only: { title: '게이트 on · 에이전트가 위치를 알 때', desc: '말하려 해도 자유 문장은 내보내지 않음' },
  on: { title: '게이트 on (WRU 기본)', desc: '상세 위치 거절 · 상태 템플릿 · ETA 구간' },
};

function pct(v: number): string {
  return `${Math.round(v * 1000) / 10}%`;
}

function Bar({ label, rate, chance }: { label: string; rate: number; chance: number }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.max(rate * 100, 0.8)}%` }} />
        <div className="bar-chance" style={{ left: `${chance * 100}%` }} title="우연 수준" />
      </div>
      <span className="bar-value">{pct(rate)}</span>
    </div>
  );
}

function ReportPanel({
  report,
  onShowReport,
  demo,
}: {
  report: LeakReport | null;
  onShowReport: () => void;
  demo?: DemoView | null;
}) {
  const shown = demo?.conditions ?? (['off', 'filter_only', 'on'] as const);
  return (
    <section className={panelClass('report-panel', 'report', demo)} aria-label="누수 테스트">
      <h2>
        누수 테스트 <span className="hint">협상 로그만 보고 집 · 학교가 서울 25개 구 중 어디인지 맞히기</span>
      </h2>
      {!report ? (
        <button onClick={onShowReport}>누수 테스트 결과 보기</button>
      ) : (
        <>
          <div className="report-grid">
            {shown.map((k) => {
              const g = report.gates[k];
              return (
                <div key={k} className={`report-card cond-${k}`}>
                  <div className="report-title">{CONDITION_LABEL[k].title}</div>
                  <div className="report-desc">{CONDITION_LABEL[k].desc}</div>
                  <Bar label="집" rate={g.home_rate} chance={report.chance} />
                  <Bar label="학교" rate={g.school_rate} chance={report.chance} />
                  <div className="report-foot">
                    로그 속 위치 단서 {g.location_hints}개 · 템플릿으로 바뀐 메시지 {g.filtered}/{g.messages}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="report-note">
            조건마다 {report.trials}회 (시드마다 집 · 학교 · 경로가 다름) · 적대자{' '}
            {report.adversary === 'meta' ? 'Muse' : 'mock 추론기'} · 세로선은 우연 수준 {pct(report.chance)}
          </p>
        </>
      )}
    </section>
  );
}

function DemoBar({ demo }: { demo: DemoView }) {
  const last = demo.step === demo.total - 1;
  return (
    <div className="demo-bar" role="region" aria-label="데모 진행">
      <div className="demo-steps" aria-hidden>
        {Array.from({ length: demo.total }, (_, i) => (
          <span key={i} className={i < demo.step ? 'done' : i === demo.step ? 'now' : ''} />
        ))}
      </div>
      <div className="demo-text">
        <div className="demo-title">
          {demo.step + 1}/{demo.total} · {demo.title}
        </div>
        <div className="demo-caption">{demo.caption}</div>
      </div>
      <div className="demo-actions">
        <button className="primary" disabled={demo.busy} onClick={last ? demo.onExit : demo.onNext}>
          {last ? '데모 끝내기' : '다음 ▶'}
        </button>
        {!last && <button onClick={demo.onExit}>나가기</button>}
      </div>
    </div>
  );
}

export function DemoPage(props: DemoPageProps) {
  const { state, playing, error, demo } = props;
  return (
    <div className={`demo${demo ? ' demo-on' : ''}`}>
      <header>
        <div className="brand">
          <strong>WRU</strong>
          <span>좌표 없이, 가족의 Muse들이 할 일을 나눠요</span>
        </div>
        <div className="controls">
          <span className="clock" aria-label="시뮬 시계">{state.clock.label}</span>
          {!demo && (
            <>
              <button onClick={() => props.onAdvance(1)}>+1분</button>
              <button onClick={() => props.onAdvance(5)}>+5분</button>
              <button onClick={() => props.onAdvance(10)}>+10분</button>
              <button onClick={props.onTogglePlay}>{playing ? '⏸ 일시정지' : '▶ 재생'}</button>
              <button onClick={props.onReset}>리셋</button>
              {props.onStartDemo && (
                <button className="demo-start" onClick={props.onStartDemo}>
                  ▶ 데모 모드
                </button>
              )}
            </>
          )}
        </div>
      </header>
      {demo && <DemoBar demo={demo} />}
      {error && <div className="error">{error}</div>}
      <main>
        <MapPanel presence={state.presence} demo={demo} />
        <InboxPanel state={state} onSubmitHeroTask={props.onSubmitHeroTask} onNegotiate={props.onNegotiate} demo={demo} />
        <AssignmentPanel state={state} onApprove={props.onApprove} demo={demo} />
      </main>
      {(!demo || demo.focus === 'report') && <ReportPanel report={props.report} onShowReport={props.onShowReport} demo={demo} />}
      <footer>좌표 · 주소 · 학교 이름은 받지도, 보여 주지도 않아요. WhereCtx에서는 상태와 ETA만 받습니다.</footer>
    </div>
  );
}
