import type { DemoState, PersonId, Presence, PresenceState, Task } from '../shared/contracts';
import { PERSON_IDS, PERSON_LABEL_KO, STATE_LABEL_KO, localHHMM } from '../shared/contracts';
import type { Fit, MessageType, NegotiationMessage, NegotiationRecord } from '../shared/negotiation';
import { REASON_CODE_TEXT } from '../shared/negotiation';

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

function MapPanel({ presence }: { presence: Presence[] }) {
  return (
    <section className="panel map-panel" aria-label="맵">
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
      return m.reason;
    case 'commit':
      return `${subtaskLabel(task, m.subtask_id)} 확정`;
    case 'refuse':
      return `${subtaskLabel(task, m.subtask_id)}: ${REASON_CODE_TEXT[m.reason_code]}`;
  }
}

function Timeline({ record, task }: { record: NegotiationRecord; task: Task | undefined }) {
  return (
    <ol className="timeline" aria-label="협상 타임라인">
      {record.messages.map((m, i) => (
        <li key={m.id} className={`msg msg-${m.type}`}>
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
}) {
  const { state } = props;
  const log = [...state.log].reverse();
  const latest = state.negotiations.at(-1);
  const latestTask = latest && state.tasks.find((t) => t.task_id === latest.task_id);
  return (
    <section className="panel inbox-panel" aria-label="인박스와 협상">
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
          <Timeline record={latest} task={latestTask} />
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

function AssignmentPanel({ state, onApprove }: { state: DemoState; onApprove: (id: string) => void }) {
  const latest = state.negotiations.at(-1);
  if (!latest) {
    return (
      <section className="panel assignment-panel" aria-label="역할 배정">
        <h2>역할 배정</h2>
        <div className="placeholder">
          <p>태스크를 넣고 협상을 맡기면 Muse 3명이 offer → counter → commit으로 역할을 정해요.</p>
          <p className="hint">결과에는 역할만 나오고, 위치는 나오지 않아요.</p>
        </div>
      </section>
    );
  }
  const task = state.tasks.find((t) => t.task_id === latest.task_id);
  const { assignment } = latest;
  return (
    <section className="panel assignment-panel" aria-label="역할 배정">
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

export function DemoPage(props: DemoPageProps) {
  const { state, playing, error } = props;
  return (
    <div className="demo">
      <header>
        <div className="brand">
          <strong>WRU</strong>
          <span>좌표 없이 가족 일을 나누는 협상 레이어</span>
        </div>
        <div className="controls">
          <span className="clock" aria-label="시뮬 시계">{state.clock.label}</span>
          <button onClick={() => props.onAdvance(1)}>+1분</button>
          <button onClick={() => props.onAdvance(5)}>+5분</button>
          <button onClick={() => props.onAdvance(10)}>+10분</button>
          <button onClick={props.onTogglePlay}>{playing ? '⏸ 일시정지' : '▶ 재생'}</button>
          <button onClick={props.onReset}>리셋</button>
        </div>
      </header>
      {error && <div className="error">{error}</div>}
      <main>
        <MapPanel presence={state.presence} />
        <InboxPanel state={state} onSubmitHeroTask={props.onSubmitHeroTask} onNegotiate={props.onNegotiate} />
        <AssignmentPanel state={state} onApprove={props.onApprove} />
      </main>
      <footer>좌표·주소·학교명은 수집하지도, 표시하지도 않습니다. WhereCtx에서는 상태와 ETA만 받아요.</footer>
    </div>
  );
}
