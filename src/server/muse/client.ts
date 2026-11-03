// MuseClient: 사람마다 하나씩 붙는 협상 에이전트의 두뇌.
// 입력은 자기 presence와 지금까지의 협상 메시지뿐이다. 다른 사람의 presence는 받지 않는다.

import type { Eta, PersonId, Presence, Task } from '../../shared/contracts.js';
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
  /** 게이트 off 실험에서만 채워지는 상세 위치. 운영 경로(게이트 on)에서는 항상 없다 */
  detail?: LocationDetail;
  /**
   * 이 에이전트의 토큰에 묶인 WRU 어댑터 도구. 실제 Muse는 presence를 프롬프트로 받지 않고
   * tool calling으로 직접 읽는다. 다른 사람을 물으면 게이트웨이가 403(AuthError)을 던진다.
   * presence 필드는 mock과 템플릿 대체만 쓴다.
   */
  tools?: AgentTools;
}

export interface AgentTools {
  get_presence(person_id: PersonId): Promise<Presence>;
  get_eta(person_id: PersonId): Promise<Eta>;
}

/** 모델이 부른 도구 한 번 (감사용. 위치 값은 담지 않는다) */
export interface ToolCallRecord {
  name: string;
  person_id: string | null;
  status: 200 | 400 | 401 | 403 | 502;
}

/** 게이트 off일 때 WhereCtx가 내주는 상세 위치 (누수 실험 전용) */
export interface LocationDetail {
  /** 지금 있는 동 이름 */
  area: string;
  /** 집까지 거리 */
  distance_km: number;
  /** 말투: 거리만 말하는지, 동네 이름을 어떤 식으로 섞는지 */
  style: DetailStyle;
}

/**
 * 게이트 off 실험의 말투. plain은 동네 이름 없이 거리 · 정확한 ETA만,
 * 나머지는 동네 이름을 정식(area) · 어간(stem) · 띄어 쓰기(spaced) · 제로폭 문자(zw) · 역 이름(station)으로 섞는다.
 */
export const DETAIL_STYLES = ['plain', 'area', 'stem', 'spaced', 'zw', 'station'] as const;
export type DetailStyle = (typeof DETAIL_STYLES)[number];

export interface AgentDecision {
  action: AgentAction;
  /** 실제 Muse 출력이 검증을 못 넘어 템플릿으로 대체됐는지 */
  fallback?: boolean;
  /** 실제 Muse가 이번 차례에 부른 도구 */
  tool_calls?: ToolCallRecord[];
}

export interface MuseClient {
  readonly kind: 'mock' | 'meta';
  decide(input: AgentTurnInput): Promise<AgentDecision>;
}

export interface MuseEnv {
  MODEL_API_KEY?: string;
  MODEL_API_BASE_URL?: string;
  MUSE_MODEL?: string;
  /** 프로세스 하나가 보낼 수 있는 최대 API 호출 수 (비용 상한) */
  MUSE_MAX_CALLS?: string;
  /** 예상 비용 상한(USD). 넘으면 남은 차례는 템플릿으로 */
  MUSE_MAX_USD?: string;
  /** reasoning_effort (기본 low) */
  MUSE_REASONING_EFFORT?: string;
}

export const DEFAULT_BASE_URL = 'https://api.meta.ai/v1';
/** 최신 Muse Spark (Standard). https://dev.meta.ai/docs/models 에서 "Recommended for new work" */
export const DEFAULT_MODEL = 'muse-spark-1.3';
export const DEFAULT_MAX_CALLS = 300;
/** 한 차례 2~7초. minimal이면 더 빠르고, 협상 규칙을 따르기엔 low로 충분했다 */
export const DEFAULT_REASONING_EFFORT = 'low';
/** 추론 + 출력 토큰 상한. 200이면 추론만 하다 잘렸고, 2000이면 low에서 여유가 있었다 */
export const DEFAULT_MAX_COMPLETION_TOKENS = 2000;

/** base URL로 provider 이름을 정한다 (Meta Model API · Baseten 둘 다 OpenAI 호환 Chat Completions) */
export function providerOf(baseUrl: string): string {
  const host = new URL(baseUrl).host;
  if (host.endsWith('api.meta.ai')) return 'Meta Model API';
  if (host.endsWith('baseten.co')) return 'Baseten';
  return host;
}
export const DEFAULT_MAX_USD = 5;
/** muse-spark-1.3 Standard 요금 (USD / 1M tokens). https://dev.meta.ai/docs/pricing-rate-limits */
export const PRICE_PER_MTOK = { input: 1.25, output: 4.25 };

export interface MuseUsage {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export function estimateUsd(u: MuseUsage): number {
  return (u.prompt_tokens * PRICE_PER_MTOK.input + u.completion_tokens * PRICE_PER_MTOK.output) / 1_000_000;
}

