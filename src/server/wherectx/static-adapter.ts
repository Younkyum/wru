// 고정된 presence를 돌려주는 어댑터. 누수 실험 시나리오와 테스트에서 쓴다.

import type { Eta, PersonId, Presence, Refusal } from '../../shared/contracts.js';
import { refuseLocationDetail, type WhereCtxAdapter } from './adapter.js';

export class StaticWhereCtx implements WhereCtxAdapter {
  constructor(private readonly people: Record<PersonId, Presence>) {}

  async get_presence(person_id: PersonId): Promise<Presence> {
    const { state, eta_minutes, updated_at } = this.people[person_id];
    return { person_id, state, eta_minutes, updated_at };
  }

  async get_eta(person_id: PersonId): Promise<Eta> {
    const { eta_minutes, updated_at } = this.people[person_id];
    return { person_id, eta_minutes, updated_at };
  }

  async request_location_detail(person_id: PersonId): Promise<Refusal> {
    return refuseLocationDetail(person_id, this.people[person_id].state);
  }
}
