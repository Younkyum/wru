// 에이전트 토큰: 가족 구성원마다 하나. 토큰 주인의 presence/ETA만 읽을 수 있다.
// 토큰 원문은 메모리(에이전트 객체)와 env에만 있고, 서버는 해시만 비교한다.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PERSON_IDS, type PersonId } from '../../shared/contracts.js';

export const TOKEN_PREFIX = 'wru_ag_';

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code: 'missing_token' | 'invalid_token' | 'not_your_presence',
  ) {
    super(code);
  }
}

function digest(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export function newAgentToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
}

/** 화면 · 로그용 지문: 원문 글자는 하나도 내보내지 않고 해시 앞 6자리만 */
export function maskToken(token: string): string {
  return `${TOKEN_PREFIX}…${digest(token).toString('hex').slice(0, 6)}`;
}

export class AgentTokens {
  private readonly hashes = new Map<PersonId, Buffer>();

  /** 구성원별 토큰을 등록한다. env 값이 없으면 새로 만든다. 반환값(원문)은 그 구성원의 에이전트에게만 준다 */
  static issue(env: Record<string, string | undefined> = {}): { tokens: AgentTokens; issued: Record<PersonId, string> } {
    const tokens = new AgentTokens();
    const issued = {} as Record<PersonId, string>;
    for (const id of PERSON_IDS) {
      const name = `WRU_AGENT_TOKEN_${id.toUpperCase()}`;
      const fromEnv = env[name];
      if (fromEnv && (!fromEnv.startsWith(TOKEN_PREFIX) || fromEnv.length < 32)) {
        throw new Error(`${name} must start with ${TOKEN_PREFIX} and be at least 32 characters`);
      }
      const token = fromEnv || newAgentToken();
      const d = digest(token);
      if ([...tokens.hashes.values()].some((h) => h.equals(d))) throw new Error(`${name} is the same as another member's token`);
      tokens.hashes.set(id, d);
      issued[id] = token;
    }
    return { tokens, issued };
  }

  /** 토큰 → 주인. 모르는 토큰이면 null */
  owner(token: string): PersonId | null {
    const d = digest(token);
    for (const [id, h] of this.hashes) if (timingSafeEqual(d, h)) return id;
    return null;
  }

  /** 토큰이 requested 구성원의 것인지 확인. 아니면 401 / 403 */
  authorize(token: string | null | undefined, requested: PersonId): PersonId {
    if (!token) throw new AuthError(401, 'missing_token');
    const owner = this.owner(token);
    if (!owner) throw new AuthError(401, 'invalid_token');
    if (owner !== requested) throw new AuthError(403, 'not_your_presence');
    return owner;
  }
}

/** Authorization: Bearer … 에서 토큰만 */
export function bearer(header: string | undefined | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return m ? m[1]! : null;
}
