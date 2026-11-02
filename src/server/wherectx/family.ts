// 가족 구성원마다 다른 어댑터를 붙인다 (예: 엄마는 자기 WhereCtx, 나머지는 시뮬레이터).

import type { Eta, PersonId, Presence, Refusal } from '../../shared/contracts.js';
import type { WhereCtxAdapter } from './adapter.js';

export class FamilyWhereCtx implements WhereCtxAdapter {
  constructor(private readonly members: Record<PersonId, WhereCtxAdapter>) {}

  get_presence(person_id: PersonId): Promise<Presence> {
    return this.members[person_id].get_presence(person_id);
  }

  get_eta(person_id: PersonId): Promise<Eta> {
    return this.members[person_id].get_eta(person_id);
  }

  request_location_detail(person_id: PersonId, requested: string): Promise<Refusal> {
    return this.members[person_id].request_location_detail(person_id, requested);
  }
}
