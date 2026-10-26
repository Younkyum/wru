// MuseClient: 사람마다 하나씩 붙는 협상 에이전트의 두뇌.
// 입력은 자기 presence와 지금까지의 협상 메시지뿐이다. 다른 사람의 presence는 받지 않는다.

import type { PersonId, Presence, Task } from '../../shared/contracts.js';
import type { AgentAction, NegotiationMessage } from '../../shared/negotiation.js';

export interface AgentTurnInput {
  self: PersonId;
  /** 자기 WhereCtx에서 읽은 자기 presence만 */
  presence: Presence;
  now: string;
  task: Task;
  round: number;
  max_rounds: number;
  /** 지금까지 오간 협상 메시지 (모든 참여자가 똑같이 본다) */
  transcript: NegotiationMessage[];
}

export interface AgentDecision {
  action: AgentAction;
  /** 실제 Muse 출력이 검증을 못 넘어 템플릿으로 대체됐는지 */
  fallback?: boolean;
}

export interface MuseClient {
  readonly kind: 'mock' | 'meta';
  decide(input: AgentTurnInput): Promise<AgentDecision>;
}

export interface MuseEnv {
  MODEL_API_KEY?: string;
  MODEL_API_BASE_URL?: string;
  MUSE_MODEL?: string;
}

export const DEFAULT_BASE_URL = 'https://api.meta.ai/v1';
/** 모델 id는 가정값. MUSE_MODEL로 덮어쓴다 */
export const DEFAULT_MODEL = 'muse-spark-1.3';

