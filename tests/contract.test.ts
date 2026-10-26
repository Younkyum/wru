import { describe, expect, it } from 'vitest';
import { PERSON_IDS, PRESENCE_STATES } from '../src/shared/contracts';
import { HERO_TASK } from '../src/server/inbox';
import { Simulator } from '../src/server/sim/simulator';
import { SimWhereCtx } from '../src/server/wherectx/sim-adapter';
import { SIM_DATE, makeApp, req } from './helpers';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/;

function expectPresenceContract(p: any) {
  expect(Object.keys(p).sort()).toEqual(['eta_minutes', 'person_id', 'state', 'updated_at']);
  expect(PERSON_IDS).toContain(p.person_id);
  expect(PRESENCE_STATES).toContain(p.state);
  expect(p.updated_at).toMatch(ISO);
  if (p.state === 'home') expect(p.eta_minutes).toBeNull();
  else expect(Number.isInteger(p.eta_minutes) && p.eta_minutes > 0).toBe(true);
}

describe('Presence 계약', () => {
  it('어댑터는 계약 필드만 돌려준다', () => {
    const adapter = new SimWhereCtx(new Simulator({ date: SIM_DATE }));
    for (const id of PERSON_IDS) {
      expectPresenceContract(adapter.get_presence(id));
      expect(Object.keys(adapter.get_eta(id)).sort()).toEqual(['eta_minutes', 'person_id', 'updated_at']);
    }
  });

  it('17:30 히어로 시작 상태: 엄마=home, 아빠=in_transit(~20분), 형=near_home', () => {
    const adapter = new SimWhereCtx(new Simulator({ date: SIM_DATE }));
    expect(adapter.get_presence('mom')).toMatchObject({ state: 'home', eta_minutes: null });
    expect(adapter.get_presence('dad')).toMatchObject({ state: 'in_transit', eta_minutes: 20 });
    expect(adapter.get_presence('sibling').state).toBe('near_home');
    expect(adapter.get_presence('mom').updated_at).toBe(`${SIM_DATE}T17:30:00+09:00`);
  });

  it('시계를 돌리면 상태가 바뀐다', () => {
    const sim = new Simulator({ date: SIM_DATE });
    const adapter = new SimWhereCtx(sim);
    sim.advance(10);
    expect(adapter.get_presence('dad')).toMatchObject({ state: 'in_transit', eta_minutes: 10 });
    sim.advance(10);
    expect(adapter.get_presence('dad')).toMatchObject({ state: 'home', eta_minutes: null });
    sim.advance(20);
    expect(adapter.get_presence('sibling').state).toBe('home');
    sim.reset();
    expect(adapter.get_presence('dad').state).toBe('in_transit');
  });

  it('좌표 요청은 refuse', () => {
    const adapter = new SimWhereCtx(new Simulator({ date: SIM_DATE }));
    expect(adapter.request_location_detail('dad', 'raw_coords')).toMatchObject({
      refused: true,
      person_id: 'dad',
      reason_code: 'location_detail_refused',
    });
    // home 반경 안(집 · 집 근처)은 home_zone_refused
    expect(adapter.request_location_detail('mom', 'raw_coords').reason_code).toBe('home_zone_refused');
    expect(adapter.request_location_detail('sibling', 'address').reason_code).toBe('home_zone_refused');
  });
});

describe('API', () => {
  it('GET /api/presence/:id, /api/eta/:id', async () => {
    const app = makeApp();
    for (const id of PERSON_IDS) {
      const p = await req(app, 'GET', `/api/presence/${id}`);
      expect(p.status).toBe(200);
      expectPresenceContract(p.json);
      const e = await req(app, 'GET', `/api/eta/${id}`);
      expect(e.json.eta_minutes).toBe(p.json.eta_minutes);
    }
    expect((await req(app, 'GET', '/api/presence/grandma')).status).toBe(404);
  });

  it.each([
    '/api/presence/dad?include=raw_coords',
    '/api/presence/dad?fields=state,lat,lng',
    '/api/presence/dad?lat=1',
    '/api/eta/dad?include=coords',
    '/api/presence/dad/raw_coords',
    '/api/presence/dad/address',
  ])('좌표 요청 거절: %s', async (path) => {
    const app = makeApp();
    const res = await req(app, 'GET', path);
    expect(res.status).toBe(403);
    expect(res.json).toMatchObject({ refused: true, reason_code: 'location_detail_refused' });
    const state = await req(app, 'GET', '/api/state');
    expect(state.json.log.at(-1).kind).toBe('refusal');
  });

  it('히어로 태스크 투입 → Task 계약', async () => {
    const app = makeApp();
    const res = await req(app, 'POST', '/api/tasks/hero');
    expect(res.status).toBe(201);
    expect(res.json).toEqual({
      task_id: 't_pickup_milk_001',
      deadline: `${SIM_DATE}T18:00:00+09:00`,
      subtasks: HERO_TASK.subtasks,
      constraints: { max_subtasks_per_person: 1 },
      received_at: `${SIM_DATE}T17:30:00+09:00`,
    });
    const list = await req(app, 'GET', '/api/tasks');
    expect(list.json).toHaveLength(1);
    expect((await req(app, 'GET', '/api/tasks/t_pickup_milk_001')).json.task_id).toBe('t_pickup_milk_001');
    const state = await req(app, 'GET', '/api/state');
    expect(state.json.log.at(-1)).toMatchObject({ kind: 'task_received' });
  });

  it('임의 태스크 투입과 검증', async () => {
    const app = makeApp();
    const ok = await req(app, 'POST', '/api/tasks', {
      deadline: '19:30',
      subtasks: [{ id: 'trash', label: '분리수거' }],
    });
    expect(ok.status).toBe(201);
    expect(ok.json.task_id).toBe('t_001');
    expect(ok.json.constraints).toEqual({ max_subtasks_per_person: null });

    expect((await req(app, 'POST', '/api/tasks', { deadline: '내일', subtasks: [{ id: 'a', label: 'x' }] })).status).toBe(400);
    expect((await req(app, 'POST', '/api/tasks', { deadline: '18:00', subtasks: [] })).status).toBe(400);
    const withCoords = await req(app, 'POST', '/api/tasks', {
      deadline: '18:00',
      subtasks: [{ id: 'pickup', label: '픽업', lat: 1, lng: 2 }],
    });
    expect(withCoords.status).toBe(400);
    expect((await req(app, 'GET', '/api/tasks')).json).toHaveLength(1);
  });

  it('시계 advance/reset', async () => {
    const app = makeApp();
    const adv = await req(app, 'POST', '/api/sim/advance', { minutes: 5 });
    expect(adv.json.clock.label).toBe('17:35');
    expect((await req(app, 'POST', '/api/sim/advance', { minutes: -1 })).status).toBe(400);
    await req(app, 'POST', '/api/tasks/hero');
    const reset = await req(app, 'POST', '/api/sim/reset');
    expect(reset.json.clock.label).toBe('17:30');
    expect(reset.json.tasks).toEqual([]);
  });
});
