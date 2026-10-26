// 결정론적 mock Muse. 같은 입력이면 항상 같은 행동을 낸다.
// 자기 presence · ETA · 마감까지 남은 시간과 협상 메시지만 보고 판단한다.

import { PERSON_IDS, type PersonId, type Subtask } from '../../shared/contracts.js';
import { FIT_SCORE, type AgentAction, type Fit, type NegotiationMessage } from '../../shared/negotiation.js';
import type { AgentDecision, AgentTurnInput, MuseClient } from './client.js';
import { assess, counterReason, infeasibleCode, minutesUntil, offerReason } from './policy.js';

interface Claim {
  person: PersonId;
  subtask: string;
  fit: Fit;
  round: number;
}

/** 사람별 마지막 유효 주장(offer / counter의 alternative)과 커밋 상태를 메시지에서 재구성 */
export function readTranscript(transcript: NegotiationMessage[]) {
  const claims = new Map<PersonId, Claim>();
  const committed = new Map<string, PersonId>();
  const commitsBy = new Map<PersonId, number>();
  for (const m of transcript) {
    if (m.type === 'offer') claims.set(m.from, { person: m.from, subtask: m.subtask_id, fit: m.fit, round: m.round });
    else if (m.type === 'counter') claims.set(m.from, { person: m.from, subtask: m.alternative, fit: m.fit, round: m.round });
    else if (m.type === 'commit') {
      committed.set(m.subtask_id, m.from);
      commitsBy.set(m.from, (commitsBy.get(m.from) ?? 0) + 1);
      claims.delete(m.from);
    } else if (m.type === 'refuse' && claims.get(m.from)?.subtask === m.subtask_id) claims.delete(m.from);
  }
  return { claims, committed, commitsBy };
}

/** a가 b보다 우선인가: 적합도가 높거나, 같으면 사람 순서가 앞인 쪽 */
export function beats(aFit: Fit, aPerson: PersonId, bFit: Fit, bPerson: PersonId): boolean {
  if (FIT_SCORE[aFit] !== FIT_SCORE[bFit]) return FIT_SCORE[aFit] > FIT_SCORE[bFit];
  return PERSON_IDS.indexOf(aPerson) < PERSON_IDS.indexOf(bPerson);
}

export function decideMock(input: AgentTurnInput): AgentAction {
  const { self, presence, task, transcript, round } = input;
  const slack = minutesUntil(input.now, task.deadline);
  const { claims, committed, commitsBy } = readTranscript(transcript);
  const capacity = task.constraints.max_subtasks_per_person ?? Infinity;
  const open = task.subtasks.filter((s) => !committed.has(s.id));
  if (open.length === 0 || (commitsBy.get(self) ?? 0) >= capacity) return { type: 'pass' };

  const others = [...claims.values()].filter((c) => c.person !== self);
  const wouldWin = (s: Subtask, fit: Fit) =>
    !committed.has(s.id) && others.filter((c) => c.subtask === s.id).every((c) => beats(fit, self, c.fit, c.person));
  const feasible = open
    .map((s) => ({ s, a: assess(presence, s, slack) }))
    .filter(({ a }) => a.feasible);

  const spoke = transcript.some((m) => m.from === self);
  const mine = claims.get(self);

  if (!spoke) {
    // 첫 차례: 마감이 급한 순(태스크 순서)으로 할 수 있는 첫 일에 손을 든다
    const first = feasible[0];
    if (!first) return { type: 'refuse', subtask_id: open[0]!.id, reason_code: infeasibleCode(presence) };
    return { type: 'offer', subtask_id: first.s.id, fit: first.a.fit, reason: offerReason(presence, first.s, input.detail) };
  }

  if (!mine) {
    // 주장이 없으면(거절했거나 커밋 후 여유가 남음) 이길 수 있는 일이 생겼을 때만 다시 나선다
    const next = feasible.find(({ s, a }) => wouldWin(s, a.fit));
    return next
      ? { type: 'offer', subtask_id: next.s.id, fit: next.a.fit, reason: offerReason(presence, next.s, input.detail) }
      : { type: 'pass' };
  }

  const claimed = task.subtasks.find((s) => s.id === mine.subtask)!;
  if (wouldWin(claimed, mine.fit)) {
    // 한 라운드 동안 아무도 더 나은 제안을 못 냈으면 확정
    return mine.round < round ? { type: 'commit', subtask_id: claimed.id } : { type: 'pass' };
  }

  // 밀렸으면 이길 수 있는 다른 일을 찾아 counter, 없으면 refuse
  const alt = feasible
    .filter(({ s, a }) => s.id !== claimed.id && wouldWin(s, a.fit))
    .sort((x, y) => FIT_SCORE[y.a.fit] - FIT_SCORE[x.a.fit])[0];
  if (alt) {
    return {
      type: 'counter',
      subtask_id: claimed.id,
      alternative: alt.s.id,
      fit: alt.a.fit,
      reason: counterReason(presence, claimed, alt.s, input.detail),
    };
  }
  return {
    type: 'refuse',
    subtask_id: claimed.id,
    reason_code: committed.has(claimed.id) ? 'already_assigned' : 'better_fit_available',
  };
}

export class MockMuse implements MuseClient {
  readonly kind = 'mock' as const;
  async decide(input: AgentTurnInput): Promise<AgentDecision> {
    return { action: decideMock(input) };
  }
}
