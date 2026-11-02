// 시연용: 에이전트 한 명이 한 차례에 Meta Model API로 보내는 요청과 돌아온 행동 (/api/demo/muse-turn)

import type { PersonId } from './contracts';

export interface MuseTurnView {
  person_id: PersonId;
  round: number;
  /** POST {base}/chat/completions 본문 중 model · response_format */
  model: string;
  response_format: { type: string };
  /** user 메시지(JSON 문자열을 파싱한 것). 자기 상태 · ETA 구간 · 마감까지 남은 분 · 지금까지의 메시지만 */
  user: Record<string, unknown>;
  /** 돌아온 행동 (검증 · 위치어 검사 · 문장 재작성을 거쳐 협상에 올라간 메시지) */
  action: Record<string, unknown>;
  /** 이 시연의 Muse가 mock인지 */
  muse: 'mock' | 'meta';
  checks: string[];
}
