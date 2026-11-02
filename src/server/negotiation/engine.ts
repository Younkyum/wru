// WRU 협상 엔진. 라운드마다 에이전트가 정해진 순서로 한 번씩 행동한다.
// 엔진은 메시지만 중계하고, 에이전트에게 다른 사람의 presence를 넘기지 않는다.

import { PERSON_LABEL, localTime, type PersonId, type Task } from '../../shared/contracts.js';
import type { Assignment, MessageBody, NegotiationMessage } from '../../shared/negotiation.js';
import type { PresenceGateway } from '../auth/gateway.js';
import type { MuseClient } from '../muse/client.js';
import { filterMessage, type Gate } from '../privacy/filter.js';
import { beats, decideMock, readTranscript } from '../muse/mock.js';
import { validateAction } from './validate.js';

/**
 * 에이전트 하나 = 구성원 하나. 에이전트는 자기 토큰만 들고 있고, presence는 게이트웨이를 거쳐 읽는다.
 * 게이트웨이가 토큰 주인을 확인하므로 다른 구성원의 presence는 읽을 수 없다 (403).
 */
export interface Agent {
  person_id: PersonId;
  token: string;
  gateway: PresenceGateway;
  muse: MuseClient;
}

export interface NegotiationInput {
  task: Task;
  agents: Agent[];
  now: string;
  max_rounds?: number;
  /** 협상 전체 시간 예산. 넘기면 남은 차례는 템플릿 판단으로 진행한다 */
  budget_ms?: number;
  /** 프라이버시 게이트. 기본 on. off는 누수 실험에서만 쓴다 */
  gate?: Gate;
}

export interface NegotiationResult {
  messages: NegotiationMessage[];
  rounds: number;
  max_rounds: number;
  outcome: 'complete' | 'partial' | 'unassigned';
  assignment: Assignment;
}

export const DEFAULT_MAX_ROUNDS = 4;
export const DEFAULT_BUDGET_MS = 45_000;

export async function runNegotiation(input: NegotiationInput): Promise<NegotiationResult> {
  const { task, agents, now } = input;
  const maxRounds = input.max_rounds ?? DEFAULT_MAX_ROUNDS;
  const gate = input.gate ?? 'on';
  const messages: NegotiationMessage[] = [];
  const capacity = task.constraints.max_subtasks_per_person ?? Infinity;
  const deadline = Date.now() + (input.budget_ms ?? DEFAULT_BUDGET_MS);
  const allCommitted = () => readTranscript(messages).committed.size === task.subtasks.length;

  let round = 0;
  while (round < maxRounds && !allCommitted()) {
    round += 1;
    let spoke = false;
    for (const agent of agents) {
      if (allCommitted()) break;
      const presence = await agent.gateway.presence(agent.token, agent.person_id);
      const detail = gate === 'off' ? ((await agent.gateway.detail?.(agent.token, agent.person_id)) ?? undefined) : undefined;
      const turn = {
        self: agent.person_id,
        presence,
        now,
        task,
        round,
        max_rounds: maxRounds,
        transcript: [...messages],
        ...(detail ? { detail } : {}),
      };
      const decision =
        Date.now() > deadline
          ? { action: decideMock(turn), fallback: true }
          : await agent.muse.decide(turn).catch(() => ({ action: decideMock(turn), fallback: true }));

      // 검증을 못 넘으면 같은 입력의 템플릿 판단으로 대체
      let fallback = decision.fallback ?? false;
      let checked = validateAction(decision.action, task, { leakCheck: gate === 'on' });
      if (!checked.ok) {
        fallback = true;
        checked = { ok: true, action: decideMock(turn) };
      }
      if (checked.action.type === 'pass') continue;

      // 게이트 on: 위치 단서가 섞인 reason은 상태 템플릿으로
      const { body: filteredBody, filtered } =
        gate === 'on' ? filterMessage(checked.action, presence, task) : { body: checked.action, filtered: false };
      const body = enforceProtocol(filteredBody, agent.person_id, messages, capacity, round);
      messages.push({
        ...body,
        id: messages.length + 1,
        round,
        at: now,
        from: agent.person_id,
        ...(fallback ? { fallback } : {}),
        ...(filtered ? { filtered } : {}),
      });
      spoke = true;
    }
    if (!spoke) break;
  }

  const assignment = buildAssignment(task, messages, agents.map((a) => a.person_id));
  const outcome =
    assignment.unassigned.length === 0 ? 'complete' : assignment.assignments.length === 0 ? 'unassigned' : 'partial';
  return { messages, rounds: round, max_rounds: maxRounds, outcome, assignment };
}

/**
 * 커밋 규칙: 이미 맡겨진 일, 용량 초과는 막는다. 커밋하려면 그 subtask에 대한 자기 주장이
 * 지난 라운드 이전부터 있고, 지금 다른 누구의 주장에도 밀리지 않아야 한다.
 */
function enforceProtocol(
  body: MessageBody,
  from: PersonId,
  messages: NegotiationMessage[],
  capacity: number,
  round: number,
): MessageBody {
  if (body.type !== 'commit') return body;
  const refuse = (reason_code: 'already_assigned' | 'capacity_full' | 'better_fit_available'): MessageBody => ({
    type: 'refuse',
    subtask_id: body.subtask_id,
    reason_code,
  });
  const { claims, committed, commitsBy } = readTranscript(messages);
  if (committed.has(body.subtask_id)) return refuse('already_assigned');
  if ((commitsBy.get(from) ?? 0) >= capacity) return refuse('capacity_full');
  const mine = claims.get(from);
  if (!mine || mine.subtask !== body.subtask_id || mine.round >= round) return refuse('better_fit_available');
  const beaten = [...claims.values()].some(
    (c) => c.person !== from && c.subtask === body.subtask_id && !beats(mine.fit, from, c.fit, c.person),
  );
  return beaten ? refuse('better_fit_available') : body;
}

export function buildAssignment(task: Task, messages: NegotiationMessage[], people: PersonId[]): Assignment {
  const { committed } = readTranscript(messages);
  const assignments = task.subtasks
    .filter((s) => committed.has(s.id))
    .map((s) => ({ subtask: s.id, person: committed.get(s.id)! }));
  const unassigned = task.subtasks.filter((s) => !committed.has(s.id)).map((s) => s.id);
  const deadline = localTime(task.deadline);
  const notify = Object.fromEntries(
    people.map((p) => {
      const mine = task.subtasks.filter((s) => committed.get(s.id) === p).map((s) => s.label);
      const text = mine.length
        ? `${PERSON_LABEL[p]}, you're on: ${mine.join(', ')} (by ${deadline})`
        : `${PERSON_LABEL[p]}, nothing for you this time`;
      return [p, text];
    }),
  ) as Assignment['notify'];
  return { task_id: task.task_id, assignments, unassigned, notify };
}
