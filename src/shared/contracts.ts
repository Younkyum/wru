// WRU 데이터 계약 (docs/PLAN.md "데이터 계약").
// 필드는 추가할 수 있지만 좌표·정확한 주소 필드는 금지한다.

import type { NegotiationRecord } from './negotiation';

export const PERSON_IDS = ['mom', 'dad', 'sibling'] as const;
export type PersonId = (typeof PERSON_IDS)[number];

export const PRESENCE_STATES = ['home', 'near_home', 'in_transit', 'unknown'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

export interface Presence {
  person_id: PersonId;
  state: PresenceState;
  /** 도착까지 남은 분. home이면 null */
  eta_minutes: number | null;
  /** 시뮬레이터 시계 기준 ISO8601 */
  updated_at: string;
}

export interface Eta {
  person_id: PersonId;
  eta_minutes: number | null;
  updated_at: string;
}

/** 좌표·상세 위치 요청에 대한 거절. 사유는 템플릿 문구만 쓴다. */
export interface Refusal {
  refused: true;
  person_id: PersonId;
  requested: string;
  reason_code: 'location_detail_refused';
  message: string;
}

export const SUBTASK_KINDS = ['pickup', 'errand'] as const;
export type SubtaskKind = (typeof SUBTASK_KINDS)[number];

export interface Subtask {
  id: string;
  label: string;
  /** pickup: 마감까지 데리러 가야 하는 일, errand: 집 근처 심부름. 없으면 id로 추정 */
  kind?: SubtaskKind;
}

export function subtaskKind(s: Subtask): SubtaskKind {
  return s.kind ?? (s.id.includes('pickup') ? 'pickup' : 'errand');
}

export interface TaskConstraints {
  /** 한 사람이 동시에 맡을 수 있는 subtask 수. null이면 제한 없음 */
  max_subtasks_per_person: number | null;
}

export interface Task {
  task_id: string;
  /** 로컬 마감 시각 (ISO8601, 시뮬레이터 날짜 기준) */
  deadline: string;
  subtasks: Subtask[];
  constraints: TaskConstraints;
  /** 인박스에 들어온 시각 (시뮬 시계) */
  received_at: string;
}

export type LogKind = 'task_received' | 'clock' | 'refusal' | 'reset' | 'negotiation' | 'approval';

export interface LogEntry {
  id: number;
  at: string;
  kind: LogKind;
  text: string;
}

export interface DemoState {
  clock: { now: string; label: string };
  muse: 'mock' | 'meta';
  presence: Presence[];
  tasks: Task[];
  negotiations: NegotiationRecord[];
  log: LogEntry[];
}

/** 응답·로그·UI 어디에도 나타나면 안 되는 위치 키 */
export const FORBIDDEN_LOCATION_KEYS = [
  'raw_coords',
  'coords',
  'coordinates',
  'lat',
  'lng',
  'lon',
  'latitude',
  'longitude',
  'address',
  'geo',
] as const;

/** ISO8601 → 서울 기준 HH:MM */
export function localHHMM(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso),
  );
}

export function isPersonId(value: string): value is PersonId {
  return (PERSON_IDS as readonly string[]).includes(value);
}

export function isForbiddenLocationKey(key: string): boolean {
  return (FORBIDDEN_LOCATION_KEYS as readonly string[]).includes(key.toLowerCase());
}

/** 객체 트리 어딘가에 금지 키가 있으면 그 키를 돌려준다 */
export function findForbiddenKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findForbiddenKey(item);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (isForbiddenLocationKey(key)) return key;
      const hit = findForbiddenKey(child);
      if (hit) return hit;
    }
  }
  return null;
}

export const STATE_LABEL_KO: Record<PresenceState, string> = {
  home: '집',
  near_home: '집 근처',
  in_transit: '이동 중',
  unknown: '알 수 없음',
};

export const PERSON_LABEL_KO: Record<PersonId, string> = {
  mom: '엄마',
  dad: '아빠',
  sibling: '형',
};
