// 에이전트 판단 규칙: 자기 presence · ETA와 마감까지 남은 시간만으로 적합도를 정한다.
// mock Muse와 실제 Muse의 템플릿 대체 경로가 같이 쓴다.

import { subtaskKind, type Presence, type PresenceState, type Subtask, type SubtaskKind } from '../../shared/contracts.js';
import type { Fit, ReasonCode } from '../../shared/negotiation.js';

/** 상태별로 일을 끝내는 데 드는 대략의 분 (in_transit은 ETA를 더한다) */
const NEEDED_MINUTES: Record<SubtaskKind, Record<Exclude<PresenceState, 'unknown'>, number>> = {
  // 픽업: 이동 중이면 가는 길에 들러 ETA+5, 집 근처면 15, 집에서 나가면 20
  pickup: { in_transit: 5, near_home: 15, home: 20 },
  // 심부름(집 근처 가게): 이동 중이면 들어가는 길에, 집 근처 10, 집에서 15
  errand: { in_transit: 0, near_home: 10, home: 15 },
};

const FIT_TABLE: Record<SubtaskKind, Record<Exclude<PresenceState, 'unknown'>, Fit>> = {
  pickup: { in_transit: 'high', near_home: 'medium', home: 'low' },
  errand: { near_home: 'high', in_transit: 'medium', home: 'low' },
};

export interface Assessment {
  feasible: boolean;
  fit: Fit;
  needed_minutes: number | null;
}

export function minutesUntil(fromIso: string, toIso: string): number {
  return Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 60_000);
}

export function assess(presence: Presence, subtask: Subtask, slackMinutes: number): Assessment {
  if (presence.state === 'unknown') return { feasible: false, fit: 'low', needed_minutes: null };
  const kind = subtaskKind(subtask);
  const base = NEEDED_MINUTES[kind][presence.state];
  const needed = presence.state === 'in_transit' ? base + (presence.eta_minutes ?? 0) : base;
  return { feasible: needed <= slackMinutes, fit: FIT_TABLE[kind][presence.state], needed_minutes: needed };
}

export function infeasibleCode(presence: Presence): ReasonCode {
  if (presence.state === 'in_transit') return 'busy_in_transit';
  if (presence.state === 'near_home') return 'near_home_unavailable';
  return 'deadline_unreachable';
}

/** 메시지에는 정확한 분 대신 구간만 쓴다 */
export function etaBucket(minutes: number | null): string {
  if (minutes === null) return '집';
  if (minutes <= 10) return '10분 이내';
  if (minutes <= 20) return '20분 이내';
  if (minutes <= 30) return '30분 이내';
  return '30분 넘게';
}

const OFFER_TEXT: Record<SubtaskKind, Record<Exclude<PresenceState, 'unknown'>, (eta: string) => string>> = {
  pickup: {
    in_transit: (eta) => `이동 중이라 가는 길에 들를 수 있어요 (도착 ${eta})`,
    near_home: () => '집 근처라 다녀올 수 있어요',
    home: () => '집에서 출발하면 맞출 수 있어요',
  },
  errand: {
    near_home: () => '집 근처라 들러 오기 쉬워요',
    in_transit: (eta) => `들어가는 길에 살 수 있어요 (도착 ${eta})`,
    home: () => '집에서 잠깐 다녀올 수 있어요',
  },
};

/** 상태 기반 offer 이유 템플릿 */
export function offerReason(presence: Presence, subtask: Subtask): string {
  if (presence.state === 'unknown') return '지금 상태를 알 수 없어요';
  return OFFER_TEXT[subtaskKind(subtask)][presence.state](etaBucket(presence.eta_minutes));
}

/** 받침에 맞춰 은/는 */
export function topic(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${word}${hasBatchim ? '은' : '는'}`;
}

export function counterReason(presence: Presence, from: Subtask, alternative: Subtask): string {
  return `${topic(from.label)} 더 잘 맞는 제안이 있어요. 대신 ${alternative.label} — ${offerReason(presence, alternative)}`;
}
