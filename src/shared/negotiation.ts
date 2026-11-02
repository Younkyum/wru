// 협상 메시지 · assignment 계약 (docs/PLAN.md "Negotiation message", "Assignment").
// 좌표·주소·학교명은 어떤 필드에도 넣지 않는다.

import type { PersonId } from './contracts';

export const FITS = ['high', 'medium', 'low'] as const;
/** 상태로 본 적합도. 숫자 대신 세 단계만 공개한다. */
export type Fit = (typeof FITS)[number];
export const FIT_SCORE: Record<Fit, number> = { high: 3, medium: 2, low: 1 };

export const REASON_CODES = [
  'busy_in_transit',
  'near_home_unavailable',
  'already_assigned',
  'capacity_full',
  'deadline_unreachable',
  'better_fit_available',
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/** refuse 문구는 이 템플릿만 쓴다 */
export const REASON_CODE_TEXT: Record<ReasonCode, string> = {
  busy_in_transit: "I'm out and can't take this one",
  near_home_unavailable: "I'm near home but can't take it now",
  already_assigned: 'Someone already took it',
  capacity_full: "I'm already on another task",
  deadline_unreachable: "I can't make the deadline",
  better_fit_available: 'Someone else is a better fit',
};

export interface OfferBody {
  type: 'offer';
  subtask_id: string;
  fit: Fit;
  reason: string;
}
export interface CounterBody {
  type: 'counter';
  subtask_id: string;
  alternative: string;
  fit: Fit;
  reason: string;
}
export interface CommitBody {
  type: 'commit';
  subtask_id: string;
}
export interface RefuseBody {
  type: 'refuse';
  subtask_id: string;
  reason_code: ReasonCode;
}
export type MessageBody = OfferBody | CounterBody | CommitBody | RefuseBody;
export type MessageType = MessageBody['type'];
export const MESSAGE_TYPES: readonly MessageType[] = ['offer', 'counter', 'commit', 'refuse'];

/** 에이전트가 이번 차례에 할 행동. pass는 기록하지 않는다. */
export type AgentAction = MessageBody | { type: 'pass' };

export type NegotiationMessage = MessageBody & {
  id: number;
  round: number;
  at: string;
  from: PersonId;
  /** 실제 Muse 출력이 검증을 못 넘어 템플릿으로 바뀌었는지 */
  fallback?: boolean;
  /** 프라이버시 게이트가 reason의 위치 단서를 템플릿으로 바꿨는지 */
  filtered?: boolean;
};

export interface Assignment {
  task_id: string;
  assignments: { subtask: string; person: PersonId }[];
  unassigned: string[];
  /** 사람별 통지. 각자 자기 역할만 담는다 */
  notify: Record<PersonId, string>;
}

export type NegotiationStatus = 'awaiting_approval' | 'approved';

export interface NegotiationRecord {
  negotiation_id: string;
  task_id: string;
  muse: 'mock' | 'meta';
  rounds: number;
  max_rounds: number;
  outcome: 'complete' | 'partial' | 'unassigned';
  messages: NegotiationMessage[];
  assignment: Assignment;
  status: NegotiationStatus;
  approved_at: string | null;
}

/**
 * 밖으로 나가는 메시지(API 응답 · 로그 · 적대자 입력)에서 내부 플래그(fallback · filtered)를 뗀다.
 * 플래그가 남으면 "에이전트가 원래 다른 말을 하려 했다"는 신호가 새기 때문이다.
 */
export function publicMessages(messages: NegotiationMessage[]): NegotiationMessage[] {
  return messages.map(({ fallback: _f, filtered: _fl, ...m }) => m as NegotiationMessage);
}
