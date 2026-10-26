// 가족 3명의 이동을 시뮬 시계로 흉내 낸다.
// 내부 위치는 "집까지의 거리(m)"뿐이고, 이 값은 모듈 밖으로 내보내지 않는다.
// 바깥에는 거친 상태(home/near_home/in_transit)와 ETA만 나간다.

import type { PersonId, Presence, PresenceState } from '../../shared/contracts.js';
import { PERSON_IDS } from '../../shared/contracts.js';

const HOME_RADIUS_M = 50;
const NEAR_HOME_RADIUS_M = 1000;
const WALK_M_PER_MIN = 80;

/** 기본 시작 시각 17:30 (히어로 시나리오: 18:00 마감 30분 전) */
export const DEFAULT_START_MINUTE = 17 * 60 + 30;

/** 구간: [fromMin, toMin) 동안 집까지 거리가 startM → endM으로 선형 변화 */
interface Leg {
  fromMin: number;
  toMin: number;
  startM: number;
  endM: number;
}

// 분 단위 오프셋은 시뮬 시작(17:30) 기준.
const ITINERARIES: Record<PersonId, Leg[]> = {
  // 엄마: 계속 집
  mom: [{ fromMin: 0, toMin: Infinity, startM: 0, endM: 0 }],
  // 아빠: 퇴근길, 17:30에 약 20분 거리 → 17:50 귀가
  dad: [
    { fromMin: 0, toMin: 20, startM: 10_000, endM: 0 },
    { fromMin: 20, toMin: Infinity, startM: 0, endM: 0 },
  ],
  // 형: 집 근처에 머물다 17:55부터 걸어서 귀가
  sibling: [
    { fromMin: 0, toMin: 25, startM: 600, endM: 600 },
    { fromMin: 25, toMin: 32.5, startM: 600, endM: 0 },
    { fromMin: 32.5, toMin: Infinity, startM: 0, endM: 0 },
  ],
};

function legAt(legs: Leg[], t: number): Leg {
  return legs.find((l) => t >= l.fromMin && t < l.toMin) ?? legs[legs.length - 1]!;
}

function distanceAt(legs: Leg[], t: number): number {
  const leg = legAt(legs, t);
  if (leg.startM === leg.endM || !Number.isFinite(leg.toMin)) return leg.startM;
  const ratio = (t - leg.fromMin) / (leg.toMin - leg.fromMin);
  return leg.startM + (leg.endM - leg.startM) * ratio;
}

function etaAt(legs: Leg[], t: number): number {
  const leg = legAt(legs, t);
  const moving = leg.endM < leg.startM && Number.isFinite(leg.toMin);
  if (moving) {
    // 집에 도착하는 구간까지 남은 시간
    const arrival = legs.find((l) => l.fromMin >= t && l.startM <= HOME_RADIUS_M && l.endM <= HOME_RADIUS_M);
    return arrival ? arrival.fromMin - t : leg.toMin - t;
  }
  // 머무는 중이면 지금 걸어서 출발했을 때의 예상 시간
  return distanceAt(legs, t) / WALK_M_PER_MIN;
}

function stateFor(distanceM: number): PresenceState {
  if (distanceM <= HOME_RADIUS_M) return 'home';
  if (distanceM <= NEAR_HOME_RADIUS_M) return 'near_home';
  return 'in_transit';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 서울 기준 오늘 날짜 (YYYY-MM-DD) */
export function seoulToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);
}

export interface SimulatorOptions {
  date?: string;
  startMinute?: number;
}

export class Simulator {
  private readonly date: string;
  private readonly startMinute: number;
  private elapsed = 0;

  constructor(options: SimulatorOptions = {}) {
    this.date = options.date ?? seoulToday();
    this.startMinute = options.startMinute ?? DEFAULT_START_MINUTE;
  }

  advance(minutes: number): void {
    if (!Number.isFinite(minutes) || minutes < 0) throw new RangeError('minutes must be >= 0');
    this.elapsed += minutes;
  }

  reset(): void {
    this.elapsed = 0;
  }

  /** 시뮬 날짜 기준 HH:MM → ISO8601 (+09:00) */
  isoAt(minuteOfDay: number): string {
    const m = Math.floor(minuteOfDay);
    return `${this.date}T${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}:00+09:00`;
  }

  now(): string {
    return this.isoAt(this.startMinute + this.elapsed);
  }

  nowLabel(): string {
    const m = Math.floor(this.startMinute + this.elapsed);
    return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  }

  presence(personId: PersonId): Presence {
    const legs = ITINERARIES[personId];
    const state = stateFor(distanceAt(legs, this.elapsed));
    return {
      person_id: personId,
      state,
      eta_minutes: state === 'home' ? null : Math.max(1, Math.ceil(etaAt(legs, this.elapsed))),
      updated_at: this.now(),
    };
  }

  allPresence(): Presence[] {
    return PERSON_IDS.map((id) => this.presence(id));
  }
}
