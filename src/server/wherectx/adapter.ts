// WhereCtx 어댑터 인터페이스.
// 지금은 시뮬레이터 구현(SimWhereCtx)만 있다. 실제 WhereCtx MCP도 같은 인터페이스 뒤에 붙인다.
// 어떤 구현이든 좌표·상세 위치를 돌려주지 않는다. 요청하면 refuse.

import type { Eta, PersonId, Presence, Refusal } from '../../shared/contracts.js';

export interface WhereCtxAdapter {
  get_presence(person_id: PersonId): Presence;
  get_eta(person_id: PersonId): Eta;
  /** 좌표·주소 등 상세 위치 요청. 항상 거절한다. */
  request_location_detail(person_id: PersonId, requested: string): Refusal;
}

export const REFUSAL_MESSAGE = '위치 상세는 공유하지 않아요. 상태와 ETA만 알려 드릴 수 있어요.';

export function refuseLocationDetail(person_id: PersonId): Refusal {
  return {
    refused: true,
    person_id,
    requested: 'location_detail',
    reason_code: 'location_detail_refused',
    message: REFUSAL_MESSAGE,
  };
}
