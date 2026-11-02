// WhereCtx 어댑터 인터페이스.
// 구현: 시뮬레이터(SimWhereCtx), 구성원 각자의 WhereCtx 서버(HttpWhereCtx), 구성원별로 묶는 FamilyWhereCtx.
// 어떤 구현이든 좌표·상세 위치를 돌려주지 않는다. 요청하면 refuse.

import type { Eta, PersonId, Presence, PresenceState, Refusal } from '../../shared/contracts.js';

export interface WhereCtxAdapter {
  get_presence(person_id: PersonId): Promise<Presence>;
  get_eta(person_id: PersonId): Promise<Eta>;
  /** 좌표·주소 등 상세 위치 요청. 항상 거절한다 (home 반경 안이면 home_zone_refused). */
  request_location_detail(person_id: PersonId, requested: string): Promise<Refusal>;
}

export const REFUSAL_MESSAGE = "Location details are not shared. Only status and ETA are available.";
export const HOME_ZONE_MESSAGE = "Inside the home zone, location details are not shared. Only status is available.";

export function refuseLocationDetail(person_id: PersonId, state?: PresenceState): Refusal {
  const homeZone = state === 'home' || state === 'near_home';
  return {
    refused: true,
    person_id,
    requested: 'location_detail',
    reason_code: homeZone ? 'home_zone_refused' : 'location_detail_refused',
    message: homeZone ? HOME_ZONE_MESSAGE : REFUSAL_MESSAGE,
  };
}
