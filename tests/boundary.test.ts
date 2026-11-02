import { describe, expect, it } from 'vitest';
import { PERSON_IDS, type PersonId, type Presence, type Task } from '../src/shared/contracts';
import { AgentTokens, AuthError, maskToken } from '../src/server/auth/agent-tokens';
import { makeFamilyAgents } from '../src/server/auth/gateway';
import { parseFamilyConfig, loadFamilyConfig, DEFAULT_FAMILY } from '../src/server/family-config';
import { HERO_TASK } from '../src/server/inbox';
import { MockMuse } from '../src/server/muse/mock';
import { runNegotiation } from '../src/server/negotiation/engine';
import { HttpWhereCtx, mapStatus } from '../src/server/wherectx/http-adapter';
import { StaticWhereCtx } from '../src/server/wherectx/static-adapter';
import { leaks, makeApp, req, SIM_DATE } from './helpers';

const NOW = `${SIM_DATE}T17:30:00+09:00`;
const TOKENS = {
  WRU_AGENT_TOKEN_MOM: 'wru_ag_mom-test-token-0000000000000000',
  WRU_AGENT_TOKEN_DAD: 'wru_ag_dad-test-token-0000000000000000',
  WRU_AGENT_TOKEN_SIBLING: 'wru_ag_sib-test-token-0000000000000000',
};
const TOKEN_OF: Record<PersonId, string> = {
  mom: TOKENS.WRU_AGENT_TOKEN_MOM,
  dad: TOKENS.WRU_AGENT_TOKEN_DAD,
  sibling: TOKENS.WRU_AGENT_TOKEN_SIBLING,
};

async function get(app: ReturnType<typeof makeApp>, path: string, token?: string) {
  const res = await app.request(path, token ? { headers: { authorization: `Bearer ${token}` } } : {});
  return { status: res.status, text: await res.text() };
}

describe('에이전트 토큰', () => {
  it('자기 것만 통과, 남의 것 403, 없음 · 틀림 401', () => {
    const { tokens, issued } = AgentTokens.issue();
    expect(tokens.authorize(issued.dad, 'dad')).toBe('dad');
    const code = (fn: () => unknown) => {
      try {
        fn();
        return 200;
      } catch (e) {
        return (e as AuthError).status;
      }
    };
    expect(code(() => tokens.authorize(issued.dad, 'mom'))).toBe(403);
    expect(code(() => tokens.authorize(null, 'mom'))).toBe(401);
    expect(code(() => tokens.authorize('wru_ag_nope', 'mom'))).toBe(401);
  });

  it('발급할 때마다 다른 토큰, env 값이 있으면 그 값', () => {
    const a = AgentTokens.issue().issued;
    const b = AgentTokens.issue().issued;
    expect(new Set([...Object.values(a), ...Object.values(b)]).size).toBe(6);
    expect(AgentTokens.issue(TOKENS).issued).toEqual(TOKEN_OF);
    expect(maskToken(TOKEN_OF.mom)).toBe('wru_ag_mom-…');
  });
});

describe('에이전트 API (토큰 경계)', () => {
  it('3×3: 자기 것 200, 남의 것 403, 토큰 없음 · 위조 401', async () => {
    const app = makeApp({ env: TOKENS });
    for (const holder of PERSON_IDS) {
      for (const target of PERSON_IDS) {
        const r = await get(app, `/api/agent/presence/${target}`, TOKEN_OF[holder]);
        expect([holder, target, r.status]).toEqual([holder, target, holder === target ? 200 : 403]);
      }
    }
    expect((await get(app, '/api/agent/presence/mom')).status).toBe(401);
    expect((await get(app, '/api/agent/presence/mom', 'wru_ag_forged-000000000000000000')).status).toBe(401);
    expect((await get(app, '/api/agent/eta/dad', TOKEN_OF.dad)).status).toBe(200);
    expect((await get(app, '/api/agent/eta/dad', TOKEN_OF.mom)).status).toBe(403);
    expect(JSON.parse((await get(app, '/api/agent/me', TOKEN_OF.sibling)).text)).toEqual({ person_id: 'sibling' });
  });

  it('자기 토큰이어도 좌표 요청은 거절, 남의 토큰이면 403이 먼저', async () => {
    const app = makeApp({ env: TOKENS });
    expect((await get(app, '/api/agent/presence/dad?include=raw_coords', TOKEN_OF.dad)).status).toBe(403);
    const other = await get(app, '/api/agent/presence/dad?include=raw_coords', TOKEN_OF.mom);
    expect(JSON.parse(other.text)).toEqual({ error: 'not_your_presence' });
  });

  it('시연용 경계표는 실제 요청 결과이고 토큰 원문을 내보내지 않는다', async () => {
    const app = makeApp({ env: TOKENS });
    const r = await get(app, '/api/demo/boundary');
    const body = JSON.parse(r.text) as { rows: { holder: string; cells: { target: string; status: number }[] }[] };
    for (const row of body.rows) {
      for (const cell of row.cells) {
        const expected = row.holder === 'none' || row.holder === 'forged' ? 401 : row.holder === cell.target ? 200 : 403;
        expect([row.holder, cell.target, cell.status]).toEqual([row.holder, cell.target, expected]);
      }
    }
    for (const t of Object.values(TOKENS)) expect(r.text).not.toContain(t);
    expect(leaks(r.text)).toEqual([]);
  });

  it('남의 토큰 요청은 이벤트 로그에 남는다 (토큰 값 없이)', async () => {
    const app = makeApp({ env: TOKENS });
    await get(app, '/api/agent/presence/mom', TOKEN_OF.dad);
    const state = await req(app, 'GET', '/api/state');
    expect(state.json.log.at(-1)).toMatchObject({ kind: 'refusal' });
    for (const t of Object.values(TOKENS)) expect(state.text).not.toContain(t);
  });

  it('WRU_ADMIN_TOKEN이 있으면 대시보드 API는 관리자 토큰이 필요, 에이전트 API는 그대로', async () => {
    const app = makeApp({ env: { ...TOKENS, WRU_ADMIN_TOKEN: 'admin-secret-value-123456' } });
    expect((await get(app, '/api/state')).status).toBe(401);
    expect((await get(app, '/api/state', 'wrong')).status).toBe(401);
    expect((await get(app, '/api/state', 'admin-secret-value-123456')).status).toBe(200);
    expect((await get(app, '/api/agent/presence/mom', TOKEN_OF.mom)).status).toBe(200);
    // 관리자 토큰으로 에이전트 API를 부를 수는 없다
    expect((await get(app, '/api/agent/presence/mom', 'admin-secret-value-123456')).status).toBe(401);
  });
});

describe('협상 엔진은 토큰으로만 presence를 읽는다', () => {
  const people: Record<PersonId, Presence> = {
    mom: { person_id: 'mom', state: 'home', eta_minutes: null, updated_at: NOW },
    dad: { person_id: 'dad', state: 'in_transit', eta_minutes: 20, updated_at: NOW },
    sibling: { person_id: 'sibling', state: 'near_home', eta_minutes: 8, updated_at: NOW },
  };
  const task: Task = {
    task_id: 't',
    deadline: `${SIM_DATE}T18:00:00+09:00`,
    subtasks: HERO_TASK.subtasks,
    constraints: { max_subtasks_per_person: 1 },
    received_at: NOW,
  };

  it('에이전트가 남의 토큰을 들고 있으면 협상이 403으로 멈춘다', async () => {
    const { agents } = makeFamilyAgents(new StaticWhereCtx(people), new MockMuse());
    const swapped = agents.map((a) => (a.person_id === 'dad' ? { ...a, token: agents[0]!.token } : a));
    await expect(runNegotiation({ task, agents: swapped, now: NOW })).rejects.toMatchObject({ status: 403 });
  });

  it('제 토큰이면 평소대로 아빠=픽업, 형=우유', async () => {
    const { agents } = makeFamilyAgents(new StaticWhereCtx(people), new MockMuse());
    const r = await runNegotiation({ task, agents, now: NOW });
    expect(r.assignment.assignments).toEqual([
      { subtask: 'pickup', person: 'dad' },
      { subtask: 'milk', person: 'sibling' },
    ]);
  });
});

// ── 실제 WhereCtx 어댑터 (가짜 fetch) ──

interface Reply {
  status: number;
  body?: unknown;
}

function fakeWhereCtx(routes: Record<string, Reply | (() => never)>, calls: { url: string; auth: string | null }[] = []): typeof fetch {
  return (async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const headers = new Headers(init?.headers);
    calls.push({ url: url.pathname + url.search, auth: headers.get('authorization') });
    const route = routes[url.pathname];
    if (!route) return new Response('{}', { status: 404 });
    if (typeof route === 'function') route();
    return new Response(JSON.stringify((route as Reply).body ?? {}), { status: (route as Reply).status });
  }) as unknown as typeof fetch;
}

// WhereCtx /v1/presence 응답처럼 좌표 · 동네까지 섞어 넣는다. 어댑터 출력에는 하나도 남으면 안 된다.
const NOISY = {
  label: 'near home',
  motion: 'walking',
  updatedAgoSec: 120,
  stale: false,
  freshness: 'live',
  privacy: 'precise',
  area: '성남시 분당구 삼평동',
  lat: 37.40123,
  lon: 127.10876,
  nearHome: { name: 'home', lat: 37.4011, lon: 127.1081, radiusM: 150 },
};

const FIXED_NOW = Date.parse('2026-11-02T08:30:00Z'); // 17:30 KST

function http(routes: Record<string, Reply | (() => never)>, calls?: { url: string; auth: string | null }[]) {
  return new HttpWhereCtx({
    person_id: 'mom',
    baseUrl: 'https://wherectx.test/',
    token: 'wctx-agent-token-mom',
    fetchImpl: fakeWhereCtx(routes, calls),
    now: () => FIXED_NOW,
  });
}

describe('HttpWhereCtx', () => {
  it('집 밖: in_transit + 집까지 ETA, 좌표 · 동네는 버린다', async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const a = http(
      {
        '/v1/presence': { status: 200, body: { ...NOISY, status: 'away' } },
        '/v1/geo/eta': { status: 200, body: { eta: { durationMin: 25, distanceKm: 11, summary: ['테헤란로'], precision: 'approximate' } } },
      },
      calls,
    );
    const p = await a.get_presence('mom');
    expect(p).toEqual({ person_id: 'mom', state: 'in_transit', eta_minutes: 25, updated_at: '2026-11-02T17:28:00+09:00' });
    expect(Object.keys(p).sort()).toEqual(['eta_minutes', 'person_id', 'state', 'updated_at']);
    expect(leaks(JSON.stringify(p))).toEqual([]);
    expect(JSON.stringify(p)).not.toMatch(/삼평|분당|테헤란|37\.|127\./);
    expect(calls.map((c) => c.url)).toEqual(['/v1/presence', '/v1/geo/eta?to=home&mode=car']);
    expect(calls.every((c) => c.auth === 'Bearer wctx-agent-token-mom')).toBe(true);
  });

  it('home → home(ETA null, ETA 요청 안 함)', async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const p = await http({ '/v1/presence': { status: 200, body: { ...NOISY, status: 'home' } } }, calls).get_presence('mom');
    expect(p).toMatchObject({ state: 'home', eta_minutes: null });
    expect(calls).toHaveLength(1);
  });

  it('near_home인데 ETA가 403(집 근처 경로 거절)이면 ETA null', async () => {
    const p = await http({
      '/v1/presence': { status: 200, body: { ...NOISY, status: 'near_home' } },
      '/v1/geo/eta': { status: 403, body: { error: 'at or near home' } },
    }).get_presence('mom');
    expect(p).toMatchObject({ state: 'near_home', eta_minutes: null });
  });

  it.each([
    ['hidden 403', { '/v1/presence': { status: 403, body: { privacy: 'hidden' } } }],
    ['기록 없음 404', {}],
    ['offline', { '/v1/presence': { status: 200, body: { ...NOISY, status: 'away', freshness: 'offline', stale: true } } }],
    ['네트워크 오류', { '/v1/presence': () => { throw new Error('ECONNREFUSED'); } }],
  ])('%s → unknown', async (_name, routes) => {
    const p = await http(routes as Record<string, Reply>).get_presence('mom');
    expect(p).toMatchObject({ state: 'unknown', eta_minutes: null });
  });

  it('status 매핑', () => {
    expect(mapStatus({ status: 'home', freshness: 'stationary' })).toBe('home');
    expect(mapStatus({ status: 'near_home', freshness: 'live' })).toBe('near_home');
    expect(mapStatus({ status: 'work', freshness: 'stationary' })).toBe('in_transit');
    expect(mapStatus({ status: 'away', freshness: 'unknown' })).toBe('unknown');
    expect(mapStatus({})).toBe('unknown');
  });

  it('15초 캐시, 다른 구성원 요청은 거부, 좌표 요청은 거절', async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const a = http({ '/v1/presence': { status: 200, body: { ...NOISY, status: 'home' } } }, calls);
    await a.get_presence('mom');
    await a.get_presence('mom');
    expect(calls).toHaveLength(1);
    await expect(a.get_presence('dad')).rejects.toThrow();
    expect((await a.request_location_detail('mom')).reason_code).toBe('home_zone_refused');
  });
});

describe('가족 설정', () => {
  const env = { WRU_WHERECTX_TOKEN_MOM: 'super-secret-wherectx-token' };
  const ok = { members: { mom: { adapter: 'wherectx', wherectx_url: 'https://location.example.com/', token_env: 'WRU_WHERECTX_TOKEN_MOM' } } };

  it('정상 설정: 엄마만 WhereCtx, 나머지는 시뮬레이터', () => {
    expect(parseFamilyConfig(ok, env)).toEqual({
      mom: { adapter: 'wherectx', wherectx_url: 'https://location.example.com', token_env: 'WRU_WHERECTX_TOKEN_MOM' },
      dad: { adapter: 'sim' },
      sibling: { adapter: 'sim' },
    });
  });

  it.each([
    ['모르는 구성원', { members: { grandma: { adapter: 'sim' } } }],
    ['http 원격', { members: { mom: { ...ok.members.mom, wherectx_url: 'http://location.example.com' } } }],
    ['URL에 토큰', { members: { mom: { ...ok.members.mom, wherectx_url: 'https://location.example.com/?token=abc' } } }],
    ['token_env에 값', { members: { mom: { ...ok.members.mom, token_env: 'super-secret-wherectx-token' } } }],
    ['env 비어 있음', { members: { mom: { ...ok.members.mom, token_env: 'WRU_WHERECTX_TOKEN_DAD' } } }],
  ])('잘못된 설정 거부: %s (오류에 토큰 값 없음)', (_name, raw) => {
    let message = '';
    try {
      parseFamilyConfig(raw, env);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('super-secret-wherectx-token');
  });

  it('localhost는 http 허용, 설정 파일이 없으면 모두 시뮬레이터', () => {
    expect(
      parseFamilyConfig({ members: { mom: { ...ok.members.mom, wherectx_url: 'http://localhost:8080' } } }, env).mom,
    ).toMatchObject({ wherectx_url: 'http://localhost:8080' });
    expect(loadFamilyConfig({ WRU_FAMILY_CONFIG: undefined })).toEqual(DEFAULT_FAMILY);
    expect(() => loadFamilyConfig({ WRU_FAMILY_CONFIG: 'nope.json' })).toThrow();
  });

  it('앱에 붙이면: 엄마는 실제 WhereCtx 상태, 실제 시계, 시계 돌리기는 409, 출력에 좌표 없음', async () => {
    const app = makeApp({
      family: parseFamilyConfig(ok, env),
      env: { ...env, ...TOKENS },
      fetchImpl: fakeWhereCtx({
        '/v1/presence': { status: 200, body: { ...NOISY, status: 'away' } },
        '/v1/geo/eta': { status: 200, body: { eta: { durationMin: 15 } } },
      }),
    });
    const state = await req(app, 'GET', '/api/state');
    expect(state.json.live).toBe(true);
    expect(state.json.presence[0]).toMatchObject({ person_id: 'mom', state: 'in_transit', eta_minutes: 15 });
    expect((await req(app, 'POST', '/api/sim/advance', { minutes: 5 })).status).toBe(409);
    expect((await get(app, '/api/agent/presence/mom', TOKEN_OF.mom)).status).toBe(200);
    expect((await get(app, '/api/agent/presence/mom', TOKEN_OF.dad)).status).toBe(403);
    expect(leaks(state.text)).toEqual([]);
    expect(state.text).not.toMatch(/삼평|분당|super-secret/);
  });
});
