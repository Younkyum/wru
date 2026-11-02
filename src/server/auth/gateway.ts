// 에이전트와 WhereCtx 사이의 관문. 모든 presence/ETA 읽기는 토큰 검사를 거친다.

import { PERSON_IDS, type Eta, type PersonId, type Presence } from '../../shared/contracts.js';
import type { LocationDetail, MuseClient } from '../muse/client.js';
import type { Agent } from '../negotiation/engine.js';
import type { WhereCtxAdapter } from '../wherectx/adapter.js';
import { AgentTokens } from './agent-tokens.js';

export interface PresenceGateway {
  /** token 주인이 person_id일 때만 presence를 준다 (아니면 AuthError 401/403) */
  presence(token: string, person_id: PersonId): Promise<Presence>;
  eta(token: string, person_id: PersonId): Promise<Eta>;
  /** 누수 실험의 게이트 off 조건에서만 쓰는 상세 위치 */
  detail?(token: string, person_id: PersonId): Promise<LocationDetail | null>;
}

export class TokenGateway implements PresenceGateway {
  constructor(
    private readonly tokens: AgentTokens,
    private readonly adapter: WhereCtxAdapter,
    /** 누수 실험(게이트 off)에서만 넘긴다. 운영 경로에는 없다 */
    private readonly detailSource?: (person_id: PersonId) => LocationDetail | null,
  ) {}

  async detail(token: string, person_id: PersonId): Promise<LocationDetail | null> {
    this.tokens.authorize(token, person_id);
    return this.detailSource?.(person_id) ?? null;
  }

  async presence(token: string, person_id: PersonId): Promise<Presence> {
    this.tokens.authorize(token, person_id);
    return this.adapter.get_presence(person_id);
  }

  async eta(token: string, person_id: PersonId): Promise<Eta> {
    this.tokens.authorize(token, person_id);
    return this.adapter.get_eta(person_id);
  }
}

export interface FamilyAgents {
  agents: Agent[];
  gateway: TokenGateway;
  tokens: AgentTokens;
  /** 구성원별 토큰 원문. 그 구성원의 에이전트에게만 넘기고 응답 · 로그에는 쓰지 않는다 */
  issued: Record<PersonId, string>;
}

/** 구성원마다 토큰을 발급하고, 각 에이전트에게 자기 토큰과 공용 게이트웨이를 준다 */
export function makeFamilyAgents(
  adapter: WhereCtxAdapter,
  muse: MuseClient,
  opts: { env?: Record<string, string | undefined>; detail?: (person_id: PersonId) => LocationDetail | null } = {},
): FamilyAgents {
  const { tokens, issued } = AgentTokens.issue(opts.env);
  const gateway = new TokenGateway(tokens, adapter, opts.detail);
  const agents = PERSON_IDS.map((person_id) => ({ person_id, token: issued[person_id], gateway, muse }));
  return { agents, gateway, tokens, issued };
}
