// 누수 실험: 시드별 시나리오로 협상을 돌리고, 그 로그만 적대자에게 줘서 집 · 학교 구를 맞히게 한다.
// 게이트 on(템플릿 · ETA 구간 · 상세 거절)과 off(동네명 · 거리 · 정확한 ETA 그대로)를 비교한다.

import { PERSON_IDS, type PersonId, type Presence, type Task } from '../../shared/contracts.js';
import type { MuseClient } from '../muse/client.js';
import { MockMuse } from '../muse/mock.js';
import { runNegotiation, type Agent } from '../negotiation/engine.js';
import { makeFamilyAgents } from '../auth/gateway.js';
import { publicMessages } from '../../shared/negotiation.js';
import { StaticWhereCtx } from '../wherectx/static-adapter.js';
import { createAdversary, type Adversary, type PublicLog } from './adversary.js';
import { labelHints, locationHints, sanitizeSubtasks, type Gate } from './filter.js';
import { DISTRICTS } from './gazetteer.js';
import { CONDITIONS, type Condition, type GateResult, type LeakReport } from '../../shared/leak-report.js';
import { makeScenario, type Scenario } from './scenarios.js';

const DATE = '2026-10-26';
const NOW = `${DATE}T17:30:00+09:00`;

function scenarioTask(s: Scenario, gate: Gate): Task {
  // 요청자가 쓴 라벨: 가끔 학교 쪽 동네를 적는다. 게이트 on이면 괄호 속 위치 설명이 지워진다.
  const subtasks = [
    { id: 'pickup', label: s.labelHasSchoolArea ? `Pick up Mina (near ${s.schoolArea})` : 'Pick up Mina', kind: 'pickup' as const },
    { id: 'milk', label: 'Buy milk', kind: 'errand' as const },
  ];
  return {
    task_id: `t_leak_${s.seed}`,
    deadline: `${DATE}T18:00:00+09:00`,
    subtasks: gate === 'on' ? sanitizeSubtasks(subtasks) : subtasks,
    constraints: { max_subtasks_per_person: 1 },
    received_at: NOW,
  };
}

/** 시나리오용 에이전트: 구성원마다 토큰을 받고, 게이트 off일 때만 게이트웨이가 상세를 내준다 */
function scenarioAgents(s: Scenario, condition: Condition, muse: MuseClient): Agent[] {
  const gate: Gate = condition === 'off' ? 'off' : 'on';
  const people = Object.fromEntries(
    PERSON_IDS.map((person_id) => {
      const p = s.people[person_id];
      return [person_id, { person_id, state: p.state, eta_minutes: p.eta_minutes, updated_at: NOW } satisfies Presence];
    }),
  ) as Record<PersonId, Presence>;
  const detailOf = (person_id: PersonId) => {
    const p = s.people[person_id];
    return { area: p.area, distance_km: p.distance_km, style: p.style };
  };
  const { agents } = makeFamilyAgents(new StaticWhereCtx(people), muse, {
    // 게이트 on에서는 엔진이 detail을 부르지 않는다. off일 때만 상세가 나간다.
    detail: (person_id) => (gate === 'off' ? detailOf(person_id) : null),
  });
  if (condition !== 'filter_only') return agents;
  // filter_only: WhereCtx를 거치지 않고 에이전트 입력에 상세 위치를 몰래 끼워 넣는다
  return agents.map((a) => ({
    ...a,
    muse: { kind: muse.kind, decide: (input) => muse.decide({ ...input, detail: detailOf(a.person_id) }) },
  }));
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
      distinct_logs: 0,
      bound_home_rate: 0,
      bound_school_rate: 0,
    };
    const groups = new Map<string, { home: Map<string, number>; school: Map<string, number> }>();
    for (let i = 0; i < trials; i += 1) {
      const scenario = makeScenario(seedStart + i);
      const task = scenarioTask(scenario, gate);
      const result = await runNegotiation({ task, agents: scenarioAgents(scenario, condition, muse), now: NOW, gate });
      // 적대자에게는 공개 로그만 넘긴다
      const log: PublicLog = {
        subtasks: task.subtasks.map(({ id, label }) => ({ id, label })),
        messages: publicMessages(result.messages),
      };
      const guess = await adversary.guess(structuredClone(log));
      // 상한 계산용: 적대자가 보는 그대로의 로그로 묶는다
      const key = JSON.stringify(log);
      const g = groups.get(key) ?? { home: new Map(), school: new Map() };
      g.home.set(scenario.home.name, (g.home.get(scenario.home.name) ?? 0) + 1);
      g.school.set(scenario.school.name, (g.school.get(scenario.school.name) ?? 0) + 1);
      groups.set(key, g);
      if (guess.home === scenario.home.name) r.home_hits += 1;
      if (guess.school === scenario.school.name) r.school_hits += 1;
      r.messages += result.messages.length;
      r.filtered += result.messages.filter((m) => m.filtered || m.fallback).length;
      r.location_hints +=
        log.messages.filter((m) => 'reason' in m && locationHints(m.reason).length > 0).length +
        log.subtasks.filter((s) => labelHints(s.label).length > 0).length;
    }
    const best = (m: Map<string, number>) => Math.max(...m.values());
    r.distinct_logs = groups.size;
    r.bound_home_rate = [...groups.values()].reduce((n, g) => n + best(g.home), 0) / trials;
    r.bound_school_rate = [...groups.values()].reduce((n, g) => n + best(g.school), 0) / trials;
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
    return `| ${label} | ${g.distinct_logs} | ${pct(g.bound_home_rate)} · ${pct(g.bound_school_rate)} | ${g.home_hits}/${g.trials} (${pct(g.home_rate)}) | ${g.school_hits}/${g.trials} (${pct(g.school_rate)}) | ${g.location_hints} | ${g.filtered}/${g.messages} |`;
  };
  return `# WRU leak test report

We give an attacker ("adversary") nothing but the negotiation log and ask it to guess which of Seoul's 25 districts (gu) the family's **home** and the child's **school** are in.

- Trials: ${r.trials} per condition (scenario seeds ${r.seed_start} to ${r.seed_start + r.trials - 1}; home, school and routes differ per seed)
- Adversary: ${r.adversary === 'meta' ? 'Muse (Meta Model API)' : 'rule-based mock (scores districts from neighborhood names, remaining distance and ETA found in the log text; it never sees the scenario answers)'}
- Negotiating agents: ${r.muse === 'meta' ? 'Muse (Meta Model API)' : 'deterministic mock Muse'}
- Chance: 1/${r.candidates} = ${pct(r.chance)}

| Condition | Distinct logs | Hindsight bound: best any attacker could do (home · school) | Rule-based adversary: home | Rule-based adversary: school | Messages/labels with location hints | Agent wording that differed from the template¹ |
| --- | --- | --- | --- | --- | --- | --- |
${row('on', '**gate on** (detail refused · status templates · ETA ranges)')}
${row('filter_only', 'gate on, agent secretly knows its location')}
${row('off', 'gate off (neighborhood names, distances, exact ETAs as-is)')}

¹ Every published offer/counter reason is a stock status phrase. This column counts messages where the agent tried to say something else, which was replaced. In the default row the mock agent already writes the stock phrase.

## A hindsight bound that does not depend on the attacker

A low hit rate from one attacker could just mean that attacker is weak. So we also measure a ceiling that holds for any attacker on these scenarios. Identical logs cannot be told apart by anyone, LLMs included. Group the scenarios by identical log and assume the attacker always picks the most common true answer in each group: that is the best hit rate any attacker could achieve on these scenarios, at district level.

- Gate on: the ${r.trials} scenarios produce only ${r.gates.on.distinct_logs} distinct logs (they differ only in states, ETA ranges and the negotiation outcome). The bound is home ${pct(r.gates.on.bound_home_rate)} · school ${pct(r.gates.on.bound_school_rate)}, and it is a ceiling, since it assumes the attacker already knows the answers. What remains comes from the coarse status itself ("on the way, within 20 min"), which the family chose to share; the gate cannot remove it.
- Gate on with an agent that secretly knows its location: the number of distinct logs and the bound are identical to gate on. Public logs also drop internal flags (fallback, filtered), so nobody outside can tell what an agent tried to say.
- Gate off: all ${r.gates.off.distinct_logs} logs are different, so the bound is ${pct(r.gates.off.bound_home_rate)}.

## How to read it

- **Gate off**: agents say the neighborhood they are passing through, the distance home and the exact minutes left. Neighborhood names are mixed in several forms (full name, stem, spaced out, zero-width characters, station name). The adversary narrows down the home district from "near X" mentions and from "passing through X + distance (or ETA × car speed)".
- **Gate on**: WhereCtx refuses location detail (home_zone_refused inside the home zone). Agents' own words are never published: every offer/counter reason is a status template, and ETAs are only ever shown as ranges ("within 10 min"). Task labels containing locations are rejected by the inbox, so in this condition the requester resubmits a label with the location removed.
- **Gate on, agent knows its location**: the agent tries to talk exactly like in gate off, but none of that text is published. The protection does not depend on a word list: free text is simply never published.
- With no clues the rule-based adversary always guesses the most central district, so its gate-on hit rate (6%) is just the share of scenarios where that district happens to be the answer, close to chance (4%).
- The school leaks in gate off when the requester writes the school's neighborhood into the label; otherwise the adversary guesses "school is near home".

## Limitations

- The gate-off phrasing and the rule-based adversary were written by the same team. The gate-off numbers are an example of "how far such talk narrows things down", not a model of every way an LLM might leak. That is why the hindsight bound is the headline number. With a key, \`npm run leak\` re-measures with Muse as both negotiator and adversary.
- The family screen (map) shows exact ETA minutes per the Presence contract; negotiation logs and agent messages carry only ranges.
- Candidates are the 25 Seoul districts; we did not measure finer-grained (neighborhood-level) guesses.

## Reproduce

\`\`\`bash
npm run leak
\`\`\`

With \`MODEL_API_KEY\` set, both the negotiating agents and the adversary use Muse. Without it, mock runs reproduce the same numbers (deterministic).
`;
}
