import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PERSON_IDS, type PersonId, type Presence, type Task } from '../src/shared/contracts';
import type { AgentAction } from '../src/shared/negotiation';
import { HERO_TASK } from '../src/server/inbox';
import type { AgentTurnInput, MuseClient } from '../src/server/muse/client';
import { createMuseClient } from '../src/server/muse/factory';
import { MetaMuse } from '../src/server/muse/meta';
import { MockMuse, decideMock } from '../src/server/muse/mock';
import { runNegotiation, type Agent } from '../src/server/negotiation/engine';
import { heroSample } from '../src/server/samples';
import { leaks, makeApp, req, SIM_DATE } from './helpers';

const NOW = `${SIM_DATE}T17:30:00+09:00`;

function heroTask(overrides: Partial<Task> = {}): Task {
  return {
    task_id: 't_pickup_milk_001',
    deadline: `${SIM_DATE}T18:00:00+09:00`,
    subtasks: HERO_TASK.subtasks,
    constraints: { max_subtasks_per_person: 1 },
    received_at: NOW,
    ...overrides,
  };
}

function presence(person_id: PersonId, state: Presence['state'], eta: number | null): Presence {
  return { person_id, state, eta_minutes: eta, updated_at: NOW };
}

const HERO_PRESENCE: Record<PersonId, Presence> = {
  mom: presence('mom', 'home', null),
  dad: presence('dad', 'in_transit', 20),
  sibling: presence('sibling', 'near_home', 8),
};

function agentsFrom(p: Record<PersonId, Presence>, muse: MuseClient = new MockMuse()): Agent[] {
  return PERSON_IDS.map((id) => ({ person_id: id, wherectx: { person_id: id, presence: () => p[id] }, muse }));
}

async function negotiateAt(minutes: number, deadline = '18:00') {
  const app = makeApp();
  if (minutes) await req(app, 'POST', '/api/sim/advance', { minutes });
  await req(app, 'POST', '/api/tasks', { ...HERO_TASK, deadline });
  return (await req(app, 'POST', '/api/tasks/t_pickup_milk_001/negotiate')).json;
}

function roles(record: any): Record<string, string> {
  return Object.fromEntries(record.assignment.assignments.map((a: any) => [a.subtask, a.person]));
}

describe('협상 엔진 (mock Muse)', () => {
  it('히어로: 아빠=픽업, 형=우유, offer → counter → commit', async () => {
    const r = await negotiateAt(0);
    expect(r.outcome).toBe('complete');
    expect(roles(r)).toEqual({ pickup: 'dad', milk: 'sibling' });
    const types = r.messages.map((m: any) => m.type);
    expect(types.indexOf('offer')).toBeLessThan(types.indexOf('counter'));
    expect(types.indexOf('counter')).toBeLessThan(types.indexOf('commit'));
    expect(r.messages.filter((m: any) => m.type === 'commit')).toHaveLength(2);
    expect(r.status).toBe('awaiting_approval');
  });

  it('결과는 상태에서 나온다: 시계를 바꾸면 합리적으로 달라진다', async () => {
    // 17:45 — 형은 픽업을 시간 안에 못 하고, 아빠는 곧 도착
    expect(roles(await negotiateAt(15))).toEqual({ pickup: 'dad', milk: 'mom' });
    // 17:52 — 아빠도 이미 집, 남은 8분으로는 아무도 못 맞춘다 → 미배정
    const late = await negotiateAt(22);
    expect(late.outcome).toBe('unassigned');
    expect(late.assignment.unassigned).toEqual(['pickup', 'milk']);
    expect(late.messages.every((m: any) => m.type === 'refuse')).toBe(true);
    // 17:55, 마감 18:30 — 집 근처인 형이 픽업
    expect(roles(await negotiateAt(25, '18:30'))).toEqual({ pickup: 'sibling', milk: 'mom' });
  });

  it('presence만 바꿔도 결과가 바뀐다 (하드코딩 아님)', async () => {
    const swapped = {
      mom: presence('mom', 'in_transit', 12),
      dad: presence('dad', 'home', null),
      sibling: presence('sibling', 'near_home', 8),
    };
    const r = await runNegotiation({ task: heroTask(), agents: agentsFrom(swapped), now: NOW });
    expect(Object.fromEntries(r.assignment.assignments.map((a) => [a.subtask, a.person]))).toEqual({
      pickup: 'mom',
      milk: 'sibling',
    });
  });

  it('결정론적: 같은 입력이면 같은 메시지', async () => {
    const a = await runNegotiation({ task: heroTask(), agents: agentsFrom(HERO_PRESENCE), now: NOW });
    const b = await runNegotiation({ task: heroTask(), agents: agentsFrom(HERO_PRESENCE), now: NOW });
    expect(a).toEqual(b);
  });

  it('에이전트는 자기 presence만 받는다', async () => {
    const seen: AgentTurnInput[] = [];
    const spy: MuseClient = {
      kind: 'mock',
      decide: async (input) => {
        seen.push(structuredClone(input));
        return { action: decideMock(input) };
      },
    };
    await runNegotiation({ task: heroTask(), agents: agentsFrom(HERO_PRESENCE, spy), now: NOW });
    expect(seen.length).toBeGreaterThan(3);
    for (const input of seen) {
      expect(input.presence.person_id).toBe(input.self);
      expect(Object.keys(input).sort()).toEqual(['max_rounds', 'now', 'presence', 'round', 'self', 'task', 'transcript']);
      // 협상 메시지에는 presence 필드가 없다
      for (const m of input.transcript) expect(m).not.toHaveProperty('state');
    }
  });

  it('용량 제약: 한 사람이 두 subtask를 동시에 맡지 않는다', async () => {
    const onlyOne = {
      mom: presence('mom', 'in_transit', 50),
      dad: presence('dad', 'in_transit', 50),
      sibling: presence('sibling', 'near_home', 8),
    };
    const limited = await runNegotiation({ task: heroTask(), agents: agentsFrom(onlyOne), now: NOW });
    expect(limited.assignment.assignments).toEqual([{ subtask: 'pickup', person: 'sibling' }]);
    expect(limited.outcome).toBe('partial');
    const unlimited = await runNegotiation({
      task: heroTask({ constraints: { max_subtasks_per_person: null } }),
      agents: agentsFrom(onlyOne),
      now: NOW,
    });
    expect(unlimited.assignment.assignments.map((a) => a.person)).toEqual(['sibling', 'sibling']);
  });

  it('마감을 못 맞추는 사람은 refuse', async () => {
    const r = await runNegotiation({
      task: heroTask(),
      agents: agentsFrom({ ...HERO_PRESENCE, dad: presence('dad', 'in_transit', 45) }),
      now: NOW,
    });
    expect(r.messages.find((m) => m.from === 'dad')).toMatchObject({ type: 'refuse', reason_code: 'busy_in_transit' });
  });

  it('최대 라운드를 넘기면 미배정으로 끝난다', async () => {
    const r = await runNegotiation({ task: heroTask(), agents: agentsFrom(HERO_PRESENCE), now: NOW, max_rounds: 1 });
    expect(r.rounds).toBe(1);
    expect(r.outcome).toBe('unassigned');
    expect(r.assignment.unassigned).toEqual(['pickup', 'milk']);
  });

  it('엔진은 규칙을 어긴 commit을 refuse로 바꾼다', async () => {
    const greedy: MuseClient = { kind: 'mock', decide: async () => ({ action: { type: 'commit', subtask_id: 'pickup' } }) };
    const r = await runNegotiation({ task: heroTask(), agents: agentsFrom(HERO_PRESENCE, greedy), now: NOW, max_rounds: 1 });
    expect(r.messages.map((m) => m.type)).toEqual(['refuse', 'refuse', 'refuse']);
    expect(r.assignment.assignments).toEqual([]);
  });

  it('통지는 사람마다 자기 역할만', async () => {
    const r = await negotiateAt(0);
    expect(r.assignment.notify.dad).toContain('민아 픽업');
    expect(r.assignment.notify.dad).not.toContain('우유');
    expect(r.assignment.notify.sibling).toContain('우유');
    expect(r.assignment.notify.sibling).not.toContain('픽업');
    expect(r.assignment.notify.mom).not.toMatch(/픽업|우유/);
  });

  it('승인 1회 후 approved', async () => {
    const app = makeApp();
    await req(app, 'POST', '/api/tasks/hero');
    const n = await req(app, 'POST', '/api/tasks/t_pickup_milk_001/negotiate');
    const ok = await req(app, 'POST', `/api/negotiations/${n.json.negotiation_id}/approve`);
    expect(ok.json).toMatchObject({ status: 'approved', approved_at: NOW });
    expect((await req(app, 'GET', '/api/state')).json.log.at(-1).kind).toBe('approval');
    expect((await req(app, 'POST', '/api/negotiations/n_999/approve')).status).toBe(404);
  });
});

describe('실제 Muse 경로 (가짜 fetch)', () => {
  function fakeFetch(content: string | (() => never), calls: any[] = []): typeof fetch {
    return (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (typeof content === 'function') content();
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }) as unknown as typeof fetch;
  }

  const input = (): AgentTurnInput => ({
    self: 'dad',
    presence: HERO_PRESENCE.dad,
    now: NOW,
    task: heroTask(),
    round: 1,
    max_rounds: 4,
    transcript: [],
  });

  it('구조화 출력을 검증해서 쓴다 + Bearer · 모델 id', async () => {
    const calls: any[] = [];
    const action: AgentAction = { type: 'offer', subtask_id: 'pickup', fit: 'high', reason: '이동 중이라 들를 수 있어요' };
    const muse = new MetaMuse({ apiKey: 'k_test', model: 'muse-x', fetchImpl: fakeFetch(JSON.stringify(action), calls) });
    expect(await muse.decide(input())).toEqual({ action });
    expect(calls[0].url).toBe('https://api.meta.ai/v1/chat/completions');
    expect(calls[0].init.headers.authorization).toBe('Bearer k_test');
    const body = JSON.parse(calls[0].init.body);
    expect(body.model).toBe('muse-x');
    expect(body.response_format).toEqual({ type: 'json_object' });
    // 프롬프트에도 다른 사람 presence나 정확한 ETA가 없다
    expect(body.messages[1].content).not.toContain('"eta_minutes"');
  });

  it.each([
    ['위치 누수 reason', JSON.stringify({ type: 'offer', subtask_id: 'pickup', fit: 'high', reason: '테헤란로 152 지나는 중' })],
    ['좌표 필드', JSON.stringify({ type: 'offer', subtask_id: 'pickup', fit: 'high', reason: 'ok', lat: 37.5 })],
    ['없는 subtask', JSON.stringify({ type: 'commit', subtask_id: 'school' })],
    ['JSON 아님', 'I will pick up Mina'],
  ])('%s → 템플릿으로 대체', async (_name, content) => {
    const muse = new MetaMuse({ apiKey: 'k', fetchImpl: fakeFetch(content) });
    const d = await muse.decide(input());
    expect(d.fallback).toBe(true);
    expect(d.action).toEqual(decideMock(input()));
  });

  it('네트워크 오류 → 템플릿으로 대체', async () => {
    const muse = new MetaMuse({ apiKey: 'k', fetchImpl: fakeFetch(() => { throw new Error('down'); }) });
    expect((await muse.decide(input())).fallback).toBe(true);
  });

  it('키가 없으면 mock, 있으면 실제 클라이언트', () => {
    expect(createMuseClient({}).kind).toBe('mock');
    expect(createMuseClient({ MODEL_API_KEY: 'k' }).kind).toBe('meta');
  });
});

describe('샘플 협상 로그', () => {
  it('samples/negotiation-hero.json은 지금 실행 결과와 같고 좌표가 없다', async () => {
    const text = readFileSync('samples/negotiation-hero.json', 'utf8');
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(await heroSample())));
    expect(leaks(text)).toEqual([]);
  });
});
