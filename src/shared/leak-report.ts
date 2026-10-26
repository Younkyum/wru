// 누수 테스트 리포트 계약 (API · UI · samples/leak-report.json)

export interface GateResult {
  trials: number;
  home_hits: number;
  school_hits: number;
  home_rate: number;
  school_rate: number;
  /** 필터나 출력 검증이 템플릿으로 바꾼 메시지 수 */
  filtered: number;
  /** 로그에 남은 위치 단서(지명 · 거리 · 정확한 ETA 등) 개수 */
  location_hints: number;
  messages: number;
}

/**
 * 실험 조건
 * - on: 운영과 같은 게이트 (상세 거절 + 필터 + ETA 구간)
 * - filter_only: 게이트 on인데 에이전트가 어떻게든 상세 위치를 알고 말하려는 경우. 필터 · 검증만으로 막히는지 본다
 * - off: 게이트 없음. 상세 위치와 정확한 ETA가 에이전트에게 가고 문구도 그대로 나간다
 */
export const CONDITIONS = ['on', 'filter_only', 'off'] as const;
export type Condition = (typeof CONDITIONS)[number];

export interface LeakReport {
  trials: number;
  seed_start: number;
  candidates: number;
  chance: number;
  adversary: 'mock' | 'meta';
  muse: 'mock' | 'meta';
  gates: Record<Condition, GateResult>;
}
