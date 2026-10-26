import type { DemoState, PersonId, Presence, PresenceState } from '../shared/contracts';
import { PERSON_LABEL_KO, STATE_LABEL_KO } from '../shared/contracts';

export interface DemoPageProps {
  state: DemoState;
  playing: boolean;
  error: string | null;
  onAdvance: (minutes: number) => void;
  onReset: () => void;
  onTogglePlay: () => void;
  onSubmitHeroTask: () => void;
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

function InboxPanel({ state, onSubmitHeroTask }: { state: DemoState; onSubmitHeroTask: () => void }) {
  const log = [...state.log].reverse();
  return (
    <section className="panel inbox-panel" aria-label="인박스와 로그">
      <h2>인박스 · 로그</h2>
      <button className="primary" onClick={onSubmitHeroTask}>＋ 태스크 투입: 6시에 민아 픽업 + 우유</button>
      {state.tasks.length === 0 ? (
        <p className="empty">아직 들어온 태스크가 없어요.</p>
      ) : (
        <ul className="tasks">
          {state.tasks.map((t) => (
            <li key={t.task_id} className="task">
              <div className="task-head">
                <code>{t.task_id}</code>
                <span className="deadline">마감 {t.deadline.slice(11, 16)}</span>
              </div>
              <div className="chips">
                {t.subtasks.map((s) => (
                  <span key={s.id} className="chip">{s.label}</span>
                ))}
              </div>
              {t.constraints.max_subtasks_per_person !== null && (
                <div className="constraint">한 사람당 최대 {t.constraints.max_subtasks_per_person}개</div>
              )}
            </li>
          ))}
        </ul>
      )}
      <h3>로그</h3>
      <ol className="log">
        {log.map((e) => (
          <li key={e.id} className={`log-${e.kind}`}>
            <time>{e.at.slice(11, 16)}</time>
            <span className="kind">{e.kind}</span>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AssignmentPanel() {
  return (
    <section className="panel assignment-panel" aria-label="역할 배정">
      <h2>역할 배정</h2>
      <div className="placeholder">
        <p>Day2: Muse 3명이 offer → counter → commit으로 협상하면 여기에 역할만 표시됩니다.</p>
        <p className="hint">예: 아빠 = 픽업, 형 = 우유</p>
      </div>
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
        <InboxPanel state={state} onSubmitHeroTask={props.onSubmitHeroTask} />
        <AssignmentPanel />
      </main>
      <footer>좌표·주소·학교명은 수집하지도, 표시하지도 않습니다. WhereCtx에서는 상태와 ETA만 받아요.</footer>
    </div>
  );
}
