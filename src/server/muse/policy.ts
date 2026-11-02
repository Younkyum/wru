// 에이전트 판단 규칙: 자기 presence · ETA와 마감까지 남은 시간만으로 적합도를 정한다.
// mock Muse와 실제 Muse의 템플릿 대체 경로가 같이 쓴다.

import { subtaskKind, type Presence, type PresenceState, type Subtask, type SubtaskKind } from '../../shared/contracts.js';
import type { Fit, ReasonCode } from '../../shared/negotiation.js';
import type { DetailStyle, LocationDetail } from './client.js';

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
  if (minutes === null) return 'home';
  if (minutes <= 10) return 'within 10 min';
  if (minutes <= 20) return 'within 20 min';
  if (minutes <= 30) return 'within 30 min';
  return 'over 30 min';
}

const OFFER_TEXT: Record<SubtaskKind, Record<Exclude<PresenceState, 'unknown'>, (eta: string) => string>> = {
  pickup: {
    in_transit: (eta) => `I'm already out and can stop by on the way (home ${eta})`,
    near_home: () => "I'm near home and can make the trip",
    home: () => 'I can make it if I leave home now',
  },
  errand: {
    near_home: () => "I'm near home, easy to drop by",
    in_transit: (eta) => `I can pick it up on my way home (home ${eta})`,
    home: () => 'I can pop out from home',
  },
};

/** 상태 기반 offer 이유 템플릿 */
export function offerReason(presence: Presence, subtask: Subtask, detail?: LocationDetail): string {
  if (presence.state === 'unknown') return "I don't know my status right now";
  if (detail) return verboseReason(presence, detail);
  return OFFER_TEXT[subtaskKind(subtask)][presence.state](etaBucket(presence.eta_minutes));
}

/**
 * 게이트 off 실험용: 필터가 없으면 에이전트가 할 법한 말. 동네 이름 · 거리 · 정확한 ETA가 그대로 들어가고,
 * 말투(style)에 따라 이름을 어간 · 띄어 쓰기 · 제로폭 문자 · 역 이름으로 섞는다. 운영 경로에서는 detail이 없어서 쓰이지 않는다.
 */
function verboseReason(presence: Presence, d: LocationDetail): string {
  const km = d.distance_km.toFixed(1);
  const m = Math.round(d.distance_km * 1000);
  const eta = presence.eta_minutes;
  const stem = d.area.length >= 3 ? d.area.slice(0, -1) : d.area;
  const name: Record<DetailStyle, string> = {
    plain: '',
    area: d.area,
    stem,
    spaced: [...d.area].join(' '),
    zw: [...d.area].join('\u200b'),
    station: `${stem}역 station`,
  };
  const n = name[d.style];
  switch (presence.state) {
    case 'in_transit':
      if (d.style === 'plain') return `${km} km from home, ${eta} min left`;
      if (d.style === 'stem') return `passing through ${n} area now, ${eta} min left`;
      if (d.style === 'station') return `getting off at ${n}, ${km} km from home`;
      return `passing through ${n} now, ${km} km from home, ${eta} min left`;
    case 'near_home':
      return d.style === 'plain' ? `${m} m from home, quick trip` : `near ${n}, quick trip (${m} m from home)`;
    default:
      return d.style === 'plain' ? 'at home, can leave right away' : `at home (${n}), can leave right away`;
  }
}

/** counter 이유. 사용자가 쓴 라벨은 넣지 않는다 (라벨이 메시지로 새지 않게) */
export function counterReason(presence: Presence, _from: Subtask, alternative: Subtask, detail?: LocationDetail): string {
  return `Someone fits better, so I'll switch. ${offerReason(presence, alternative, detail)}`;
}
