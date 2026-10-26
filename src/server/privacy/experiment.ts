// 누수 실험: 시드별 시나리오로 협상을 돌리고, 그 로그만 적대자에게 줘서 집 · 학교 구를 맞히게 한다.
// 게이트 on(템플릿 · ETA 구간 · 상세 거절)과 off(동네명 · 거리 · 정확한 ETA 그대로)를 비교한다.

import { PERSON_IDS, type PersonId, type Presence, type Task } from '../../shared/contracts.js';
import type { MuseClient } from '../muse/client.js';
import { MockMuse } from '../muse/mock.js';
import { runNegotiation, type Agent } from '../negotiation/engine.js';
import { createAdversary, type Adversary, type PublicLog } from './adversary.js';
import { locationHints, sanitizeSubtasks, type Gate } from './filter.js';
import { DISTRICTS } from './gazetteer.js';
import { CONDITIONS, type Condition, type GateResult, type LeakReport } from '../../shared/leak-report.js';
import { makeScenario, type Scenario } from './scenarios.js';

const DATE = '2026-10-26';
const NOW = `${DATE}T17:30:00+09:00`;

function scenarioTask(s: Scenario, gate: Gate): Task {
  // 요청자가 쓴 라벨: 가끔 학교 쪽 동네를 적는다. 게이트 on이면 괄호 속 위치 설명이 지워진다.
  const subtasks = [
    { id: 'pickup', label: s.labelHasSchoolArea ? `민아 픽업 (${s.schoolArea} 쪽)` : '민아 픽업', kind: 'pickup' as const },
    { id: 'milk', label: '우유 사기', kind: 'errand' as const },
  ];
  return {
    task_id: `t_leak_${s.seed}`,
    deadline: `${DATE}T18:00:00+09:00`,
    subtasks: gate === 'on' ? sanitizeSubtasks(subtasks) : subtasks,
    constraints: { max_subtasks_per_person: 1 },
    received_at: NOW,
  };
}

/** 시나리오용 WhereCtx: 게이트 off일 때만 상세를 내준다 */
function scenarioAgents(s: Scenario, condition: Condition, muse: MuseClient): Agent[] {
  const gate: Gate = condition === 'off' ? 'off' : 'on';
  return PERSON_IDS.map((person_id: PersonId) => {
    const p = s.people[person_id];
    const presence: Presence = { person_id, state: p.state, eta_minutes: p.eta_minutes, updated_at: NOW };
    const detail = { area: p.area, distance_km: p.distance_km, verbose: p.verbose };
    // filter_only: WhereCtx를 거치지 않고 에이전트 입력에 상세 위치를 몰래 끼워 넣는다
    const leaky: MuseClient = { kind: muse.kind, decide: (input) => muse.decide({ ...input, detail }) };
    return {
      person_id,
      muse: condition === 'filter_only' ? leaky : muse,
      wherectx: {
        person_id,
        presence: () => presence,
        // 게이트 on에서는 엔진이 detail을 부르지 않는다. off일 때만 상세가 나간다.
        detail: () => (gate === 'off' ? detail : null),
      },
    };
  });
}

export interface ExperimentOptions {
  trials?: number;
  seed_start?: number;
  muse?: MuseClient;
  adversary?: Adversary;
}

export async function runLeakExperiment(opts: ExperimentOptions = {}): Promise<LeakReport> {
  const trials = opts.trials ?? 50;
  const seedStart = opts.seed_start ?? 1;
  const muse = opts.muse ?? new MockMuse();
  const adversary = opts.adversary ?? createAdversary(muse);
  const gates = {} as Record<Condition, GateResult>;

  for (const condition of CONDITIONS) {
    const gate: Gate = condition === 'off' ? 'off' : 'on';
    const r: GateResult = {
      trials,
      home_hits: 0,
      school_hits: 0,
      home_rate: 0,
      school_rate: 0,
      location_hints: 0,
      messages: 0,
      filtered: 0,
    };
    for (let i = 0; i < trials; i += 1) {
      const scenario = makeScenario(seedStart + i);
      const task = scenarioTask(scenario, gate);
      const result = await runNegotiation({ task, agents: scenarioAgents(scenario, condition, muse), now: NOW, gate });
      // 적대자에게는 공개 로그만 넘긴다
      const log: PublicLog = {
        subtasks: task.subtasks.map(({ id, label }) => ({ id, label })),
        messages: result.messages,
      };
      const guess = await adversary.guess(structuredClone(log));
      if (guess.home === scenario.home.name) r.home_hits += 1;
      if (guess.school === scenario.school.name) r.school_hits += 1;
      r.messages += result.messages.length;
      r.filtered += result.messages.filter((m) => m.filtered || m.fallback).length;
      r.location_hints += locationHints(JSON.stringify(log)).length;
    }
    r.home_rate = r.home_hits / trials;
    r.school_rate = r.school_hits / trials;
    gates[condition] = r;
  }

  return {
    trials,
    seed_start: seedStart,
    candidates: DISTRICTS.length,
    chance: 1 / DISTRICTS.length,
    adversary: adversary.kind,
    muse: muse.kind,
    gates,
  };
}

/** 사람이 읽는 리포트 (지명 · 예시 로그 없이 숫자만) */
export function renderLeakReport(r: LeakReport): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const row = (condition: Condition, label: string) => {
    const g = r.gates[condition];
    return `| ${label} | ${g.home_hits}/${g.trials} (${pct(g.home_rate)}) | ${g.school_hits}/${g.trials} (${pct(g.school_rate)}) | ${g.location_hints} | ${g.filtered}/${g.messages} |`;
  };
  return `# WRU 누수 테스트 리포트

협상 로그만 적대자에게 주고, 가족의 **집**과 **학교**가 서울 25개 구 중 어디인지 맞히게 했습니다.

- 시도: 조건마다 ${r.trials}회 (시나리오 시드 ${r.seed_start}~${r.seed_start + r.trials - 1}, 시드마다 집 · 학교 · 경로가 다름)
- 적대자: ${r.adversary === 'meta' ? 'Muse (Meta Model API)' : 'mock 추론기 (로그 속 동네 이름 · 거리 · ETA 단서로 구를 추정하는 휴리스틱)'}
- 협상 에이전트: ${r.muse === 'meta' ? 'Muse (Meta Model API)' : '결정론적 mock Muse'}
- 우연 수준: 1/${r.candidates} = ${pct(r.chance)}

| 조건 | 집 적중 | 학교 적중 | 로그 속 위치 단서 | 필터 · 검증이 바꾼 메시지 |
| --- | --- | --- | --- | --- |
${row('on', '**on** (템플릿 · ETA 구간 · 상세 거절)')}
${row('filter_only', 'on, 에이전트가 위치를 알 때 (필터 · 검증만)')}
${row('off', 'off (동네명 · 거리 · 정확한 ETA 그대로)')}

## 읽는 법

- 게이트 off에서는 에이전트가 지나는 동네, 집까지 거리, 정확한 분 단위 ETA를 그대로 말합니다. 적대자는 이 단서로 집 구를 좁힙니다.
- 게이트 on에서는 WhereCtx가 상세 위치를 거절하고(home 반경 안은 home_zone_refused), 메시지 필터가 위치어를 상태 템플릿으로 바꾸고, ETA는 구간(10분 이내 등)으로만 나갑니다. 적대자에게 남는 건 상태와 ETA 구간뿐이라 우연 수준에 가깝습니다.
- "에이전트가 위치를 알 때" 줄은 게이트 on인데 에이전트 입력에 상세 위치를 몰래 넣은 경우입니다. 에이전트가 동네 이름 · 거리 · 정확한 ETA를 말해도 출력 검증과 메시지 필터가 상태 템플릿으로 바꿔서, 로그에는 위치 단서가 남지 않습니다.
- 학교는 게이트 off에서 요청자가 라벨에 동네를 적었을 때 드러납니다. 게이트 on은 라벨의 위치 설명도 지웁니다.

## 재현

\`\`\`bash
npm run leak
\`\`\`

\`MODEL_API_KEY\`가 있으면 협상 에이전트와 적대자 모두 Muse를 씁니다. 없으면 mock으로 같은 숫자가 다시 나옵니다(결정론).
`;
}
