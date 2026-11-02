// 가족 설정 (family.config.json). 없으면 세 명 모두 시뮬레이터.
// 토큰 값은 파일에 두지 않고 env 변수 "이름"만 적는다. 오류 메시지에도 토큰 값은 넣지 않는다.

import { existsSync, readFileSync } from 'node:fs';
import { PERSON_IDS, type PersonId } from '../shared/contracts.js';

export type MemberConfig =
  | { adapter: 'sim' }
  | {
      adapter: 'wherectx';
      /** 그 사람이 호스팅하는 WhereCtx 주소 */
      wherectx_url: string;
      /** WhereCtx agent 토큰이 들어 있는 env 변수 이름 */
      token_env: string;
      home_place?: string;
      eta_mode?: 'car' | 'transit' | 'walk' | 'bike';
    };

export type FamilyConfig = Record<PersonId, MemberConfig>;

export const DEFAULT_FAMILY: FamilyConfig = { mom: { adapter: 'sim' }, dad: { adapter: 'sim' }, sibling: { adapter: 'sim' } };

const ENV_NAME = /^[A-Z][A-Z0-9_]{2,63}$/;
const PLACE = /^[\p{L}\p{N} _-]{1,64}$/u;
const MODES = ['car', 'transit', 'walk', 'bike'];

function checkUrl(raw: unknown, who: string): string {
  if (typeof raw !== 'string') throw new Error(`${who}: wherectx_url이 필요해요`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${who}: wherectx_url 형식이 올바르지 않아요`);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error(`${who}: wherectx_url은 https여야 해요 (localhost만 http 허용)`);
  }
  if (url.username || url.password || url.search || url.hash) throw new Error(`${who}: wherectx_url에 인증 정보 · 쿼리를 넣지 마세요`);
  return url.origin + url.pathname.replace(/\/+$/, '');
}

export function parseFamilyConfig(raw: unknown, env: Record<string, string | undefined>): FamilyConfig {
  const members = (raw as { members?: unknown } | null)?.members;
  if (!members || typeof members !== 'object') throw new Error('family config: members 객체가 필요해요');
  const out = { ...DEFAULT_FAMILY };
  for (const [id, value] of Object.entries(members as Record<string, unknown>)) {
    if (!(PERSON_IDS as readonly string[]).includes(id)) throw new Error(`family config: 모르는 구성원 ${id} (mom, dad, sibling 중 하나)`);
    const m = value as Record<string, unknown>;
    if (m?.adapter === 'sim') {
      out[id as PersonId] = { adapter: 'sim' };
      continue;
    }
    if (m?.adapter !== 'wherectx') throw new Error(`${id}: adapter는 sim 또는 wherectx예요`);
    if (typeof m.token_env !== 'string' || !ENV_NAME.test(m.token_env)) throw new Error(`${id}: token_env는 env 변수 이름이어야 해요 (예: WRU_WHERECTX_TOKEN_MOM)`);
    if (!env[m.token_env]) throw new Error(`${id}: env ${m.token_env}가 비어 있어요`);
    if (m.home_place !== undefined && (typeof m.home_place !== 'string' || !PLACE.test(m.home_place))) throw new Error(`${id}: home_place 형식이 올바르지 않아요`);
    if (m.eta_mode !== undefined && !MODES.includes(m.eta_mode as string)) throw new Error(`${id}: eta_mode는 car, transit, walk, bike 중 하나예요`);
    out[id as PersonId] = {
      adapter: 'wherectx',
      wherectx_url: checkUrl(m.wherectx_url, id),
      token_env: m.token_env,
      ...(m.home_place ? { home_place: m.home_place as string } : {}),
      ...(m.eta_mode ? { eta_mode: m.eta_mode as 'car' } : {}),
    };
  }
  return out;
}

/** WRU_FAMILY_CONFIG (기본 family.config.json)를 읽는다. 파일이 없으면 기본(모두 시뮬레이터) */
export function loadFamilyConfig(env: Record<string, string | undefined> = process.env): FamilyConfig {
  const path = env.WRU_FAMILY_CONFIG ?? 'family.config.json';
  if (!existsSync(path)) {
    if (env.WRU_FAMILY_CONFIG) throw new Error(`family config 파일이 없어요: ${path}`);
    return DEFAULT_FAMILY;
  }
  return parseFamilyConfig(JSON.parse(readFileSync(path, 'utf8')), env);
}

export function isLive(config: FamilyConfig): boolean {
  return PERSON_IDS.some((id) => config[id].adapter === 'wherectx');
}
