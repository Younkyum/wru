import type { Eta, PersonId, Presence, Refusal } from '../../shared/contracts.js';
import type { Simulator } from '../sim/simulator.js';
import { refuseLocationDetail, type WhereCtxAdapter } from './adapter.js';

export class SimWhereCtx implements WhereCtxAdapter {
  constructor(private readonly sim: Simulator) {}

  get_presence(person_id: PersonId): Presence {
    // 계약 필드만 골라 담는다 (구현이 필드를 늘려도 바깥으로 새지 않게)
    const { state, eta_minutes, updated_at } = this.sim.presence(person_id);
    return { person_id, state, eta_minutes, updated_at };
  }

  get_eta(person_id: PersonId): Eta {
    const { eta_minutes, updated_at } = this.sim.presence(person_id);
    return { person_id, eta_minutes, updated_at };
  }

  request_location_detail(person_id: PersonId, _requested: string): Refusal {
    return refuseLocationDetail(person_id, this.sim.presence(person_id).state);
  }
}
