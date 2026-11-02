// 구성원 한 명의 WhereCtx 서버(https://github.com/Younkyum/WhereCtx, 1인용)에 붙는 어댑터.
// 그 사람의 WhereCtx agent 토큰으로 GET /v1/presence(coarse status)와 GET /v1/geo/eta(집까지, 5분 단위 근사)만 읽는다.
// 응답에서 status · freshness · stale · updatedAgoSec · durationMin만 꺼내고 나머지(area, 좌표 등)는 읽지 않고 버린다.

import type { Eta, PersonId, Presence, PresenceState, Refusal } from '../../shared/contracts.js';
import { refuseLocationDetail, type WhereCtxAdapter } from './adapter.js';

export interface HttpWhereCtxOptions {
  person_id: PersonId;
  /** 그 사람의 WhereCtx 주소, 예: https://location.example.com */
  baseUrl: string;
  /** 그 사람 WhereCtx에서 발급한 agent 토큰 (env에서 읽어 넘긴다) */
  token: string;
  /** ETA 목적지로 쓸 등록 장소 이름 (기본 home) */
  homePlace?: string;
  etaMode?: 'car' | 'transit' | 'walk' | 'bike';
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** presence 캐시 (기본 15초) */
  cacheMs?: number;
  now?: () => number;
}

/** ISO8601, 서울 기준(+09:00) */
export function kstIso(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000);
  return `${d.toISOString().slice(0, 19)}+09:00`;
}

/** WhereCtx status → WRU 상태. home/near_home 외의 status(away, work, custom …)는 모두 "집 밖"(in_transit)으로 본다 */
export function mapStatus(raw: { status?: unknown; freshness?: unknown; stale?: unknown }): PresenceState {
  if (raw.stale === true || raw.freshness === 'offline' || raw.freshness === 'unknown') return 'unknown';
  if (raw.status === 'home') return 'home';
  if (raw.status === 'near_home') return 'near_home';
  return typeof raw.status === 'string' && raw.status.length > 0 ? 'in_transit' : 'unknown';
}

export class HttpWhereCtx implements WhereCtxAdapter {
  private cache: { at: number; value: Presence } | null = null;

  constructor(private readonly opts: HttpWhereCtxOptions) {}

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  private async getJson(path: string): Promise<{ status: number; body: Record<string, unknown> | null }> {
    const f = this.opts.fetchImpl ?? fetch;
    try {
      const res = await f(`${this.opts.baseUrl.replace(/\/+$/, '')}${path}`, {
        headers: { authorization: `Bearer ${this.opts.token}`, accept: 'application/json' },
        // 리다이렉트로 토큰이 다른 경로 · 호스트에 실려 가지 않게
        redirect: 'error',
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 8_000),
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      return { status: res.status, body };
    } catch {
      return { status: 0, body: null };
    }
  }

  private async etaToHome(): Promise<number | null> {
    const q = new URLSearchParams({ to: this.opts.homePlace ?? 'home', mode: this.opts.etaMode ?? 'car' });
    const { status, body } = await this.getJson(`/v1/geo/eta?${q}`);
    const minutes = status === 200 ? (body?.eta as { durationMin?: unknown } | undefined)?.durationMin : undefined;
    return typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : null;
  }

  async get_presence(person_id: PersonId): Promise<Presence> {
    if (person_id !== this.opts.person_id) throw new Error('HttpWhereCtx serves one family member only');
    const cached = this.cache;
    if (cached && this.now() - cached.at < (this.opts.cacheMs ?? 15_000)) return cached.value;

    const { status, body } = await this.getJson('/v1/presence');
    const now = this.now();
    let value: Presence;
    if (status !== 200 || !body) {
      // 403 hidden · 404 기록 없음 · 네트워크 오류는 모두 unknown
      value = { person_id, state: 'unknown', eta_minutes: null, updated_at: kstIso(now) };
    } else {
      const state = mapStatus(body);
      const ago = typeof body.updatedAgoSec === 'number' && body.updatedAgoSec >= 0 ? body.updatedAgoSec : 0;
      const eta = state === 'in_transit' || state === 'near_home' ? await this.etaToHome() : null;
      value = { person_id, state, eta_minutes: eta, updated_at: kstIso(now - ago * 1000) };
    }
    this.cache = { at: now, value };
    return value;
  }

  async get_eta(person_id: PersonId): Promise<Eta> {
    const { eta_minutes, updated_at } = await this.get_presence(person_id);
    return { person_id, eta_minutes, updated_at };
  }

  async request_location_detail(person_id: PersonId): Promise<Refusal> {
    return refuseLocationDetail(person_id, (await this.get_presence(person_id)).state);
  }
}
