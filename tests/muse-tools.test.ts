// 실제 Muse tool calling 경로 (가짜 fetch): 도구 루프 · 403 · 잘못된 JSON 대체 · 호출 상한 · 엔진 연동
import { describe, expect, it } from 'vitest';
import type { PersonId, Presence, Task } from '../src/shared/contracts';
import { HERO_TASK } from '../src/server/inbox';
import type { AgentTurnInput } from '../src/server/muse/client';
import { MAX_TOOL_STEPS, MetaMuse } from '../src/server/muse/meta';
import { decideMock } from '../src/server/muse/mock';
import { agentTools, runNegotiation } from '../src/server/negotiation/engine';
import { makeFamilyAgents } from '../src/server/auth/gateway';
import { StaticWhereCtx } from '../src/server/wherectx/static-adapter';
import { createAdversary } from '../src/server/privacy/adversary';
import { leaks, SIM_DATE } from './helpers';

const NOW = `${SIM_DATE}T17:30:00+09:00`;
const presence = (person_id: PersonId, state: Presence['state'], eta: number | null): Presence => ({
  person_id,
  state,
  eta_minutes: eta,
  updated_at: NOW,
});
const HERO: Record<PersonId, Presence> = {
  mom: presence('mom', 'home', null),
  dad: presence('dad', 'in_transit', 17),
  sibling: presence('sibling', 'near_home', 8),
};
const task = (): Task => ({
  task_id: 't_pickup_milk_001',
  deadline: `${SIM_DATE}T18:00:00+09:00`,
  subtasks: HERO_TASK.subtasks,
  constraints: { max_subtasks_per_person: 1 },
  received_at: NOW,
});

type Msg = { role: string; content?: string | null; tool_calls?: unknown[]; tool_call_id?: string };
type Body = { model: string; messages: Msg[]; tools?: { function: { name: string } }[]; response_format?: { type: string }; tool_choice?: string };

/** 요청 본문을 받아 assistant 메시지를 돌려주는 가짜 모델 */
function fakeModel(reply: (body: Body, n: number) => Record<string, unknown>, bodies: Body[] = []): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Body;
    bodies.push(body);
    const message = reply(body, bodies.length);
    return new Response(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 1000, completion_tokens: 100 } }), { status: 200 });
  }) as unknown as typeof fetch;
}

const callTool = (person_id: string, name = 'get_presence', id = `call_${person_id}`) => ({
  role: 'assistant',
  content: null,
  tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify({ person_id }) } }],
});
const answer = (action: unknown) => ({ role: 'assistant', content: typeof action === 'string' ? action : JSON.stringify(action) });
const toolMsgs = (b: Body) => b.messages.filter((m) => m.role === 'tool');

function dadTurn(): AgentTurnInput {
  const { agents } = makeFamilyAgents(new StaticWhereCtx(HERO), { kind: 'mock', decide: async () => ({ action: { type: 'pass' } }) });
  const dad = agents.find((a) => a.person_id === 'dad')!;
  return { self: 'dad', presence: HERO.dad, now: NOW, task: task(), round: 1, max_rounds: 4, transcript: [], tools: agentTools(dad) };
}

const OFFER = { type: 'offer', subtask_id: 'pickup', fit: 'high', reason: "I'm already out and can stop by on the way" };

describe('Muse tool calling (가짜 fetch)', () => {
  it('도구 루프: 자기 presence를 도구로 읽고, 결과를 tool 메시지로 돌려준 뒤 JSON 행동을 받는다', async () => {
    const bodies: Body[] = [];
    const muse = new MetaMuse({ apiKey: 'k', fetchImpl: fakeModel((_b, n) => (n === 1 ? callTool('dad') : answer(OFFER)), bodies) });
    const d = await muse.decide(dadTurn());
    expect(d).toEqual({ action: OFFER, tool_calls: [{ name: 'get_presence', person_id: 'dad', status: 200 }] });

    const [first, second] = bodies;
    expect(first!.model).toBe('muse-spark-1.3');
    expect(first!.tools!.map((t) => t.function.name)).toEqual(['get_presence', 'get_eta']);
    expect(first!.tool_choice).toBe('auto');
    expect(first!.response_format!.type).toBe('json_schema');
    // 프롬프트에는 자기 상태가 없다: 도구로만 읽는다
    const user = first!.messages.find((m) => m.role === 'user')!.content!;
    expect(user).toContain('"my_person_id":"dad"');
    expect(user).not.toMatch(/my_state|in_transit|eta_minutes/);
    // 두 번째 요청: tool_calls가 든 assistant 메시지 + 짝이 맞는 tool 결과 (상태와 ETA 구간만)
    expect(second!.messages.at(-2)).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'call_dad' }] });
    expect(second!.messages.at(-1)).toEqual({
      role: 'tool',
      tool_call_id: 'call_dad',
      content: JSON.stringify({ person_id: 'dad', state: 'in_transit', eta: 'within 20 min' }),
    });
    expect(muse.usage).toEqual({ calls: 2, prompt_tokens: 2000, completion_tokens: 200 });
  });

  it('남의 presence를 물으면 403이 tool 결과로 돌아가고, 그 사람의 상태는 모델에게 가지 않는다', async () => {
    const bodies: Body[] = [];
    const muse = new MetaMuse({
      apiKey: 'k',
      fetchImpl: fakeModel((_b, n) => (n === 1 ? callTool('mom') : n === 2 ? callTool('sibling', 'get_eta') : answer(OFFER)), bodies),
    });
    const d = await muse.decide(dadTurn());
    expect(d.action).toEqual(OFFER);
    expect(d.tool_calls).toEqual([
      { name: 'get_presence', person_id: 'mom', status: 403 },
      { name: 'get_eta', person_id: 'sibling', status: 403 },
    ]);
    const results = toolMsgs(bodies.at(-1)!).map((m) => JSON.parse(m.content!));
    expect(results).toEqual([
      { error: 'not_your_presence', status: 403 },
      { error: 'not_your_presence', status: 403 },
    ]);
    expect(JSON.stringify(bodies.map(toolMsgs))).not.toMatch(/"state"|"eta"/);
  });

  it('strict 스키마의 null 필드(안 쓰는 칸)는 떼고 행동으로 쓴다', async () => {
    const strictOut = { type: 'commit', subtask_id: 'pickup', alternative: null, fit: null, reason: null, reason_code: null };
    const muse = new MetaMuse({ apiKey: 'k', fetchImpl: fakeModel(() => answer(strictOut)) });
    expect(await muse.decide(dadTurn())).toEqual({ action: { type: 'commit', subtask_id: 'pickup' } });
  });

  it.each([
    ['JSON 아님', 'I will pick up Mina'],
    ['위치 누수 reason', JSON.stringify({ ...OFFER, reason: '테헤란로 152 지나는 중' })],
    ['없는 subtask', JSON.stringify({ type: 'commit', subtask_id: 'school' })],
    ['좌표 필드', JSON.stringify({ ...OFFER, lat: 37.5 })],
  ])('잘못된 최종 출력(%s) → 템플릿 대체, 도구 기록은 남는다', async (_name, content) => {
    const muse = new MetaMuse({ apiKey: 'k', fetchImpl: fakeModel((_b, n) => (n === 1 ? callTool('dad') : answer(content))) });
    const turn = dadTurn();
    const d = await muse.decide(turn);
    expect(d.fallback).toBe(true);
    expect(d.action).toEqual(decideMock(turn));
    expect(d.tool_calls).toEqual([{ name: 'get_presence', person_id: 'dad', status: 200 }]);
  });

  it('잘못된 도구 인자 · 없는 도구는 400 tool 결과', async () => {
    const bodies: Body[] = [];
    const bad = { role: 'assistant', content: null, tool_calls: [
      { id: 'a', type: 'function', function: { name: 'get_presence', arguments: '{"person_id":"grandma"}' } },
      { id: 'b', type: 'function', function: { name: 'get_address', arguments: '{"person_id":"dad"}' } },
      { id: 'c', type: 'function', function: { name: 'get_eta', arguments: 'not json' } },
    ] };
    const muse = new MetaMuse({ apiKey: 'k', fetchImpl: fakeModel((_b, n) => (n === 1 ? bad : answer(OFFER)), bodies) });
    const d = await muse.decide(dadTurn());
    expect(d.tool_calls!.map((c) => c.status)).toEqual([400, 400, 400]);
    expect(toolMsgs(bodies[1]!).map((m) => m.tool_call_id)).toEqual(['a', 'b', 'c']);
  });

  it(`도구만 계속 부르면 ${MAX_TOOL_STEPS}번에서 끊고 템플릿으로`, async () => {
    const bodies: Body[] = [];
    const muse = new MetaMuse({ apiKey: 'k', fetchImpl: fakeModel(() => callTool('dad'), bodies) });
    const d = await muse.decide(dadTurn());
    expect(d.fallback).toBe(true);
    expect(bodies).toHaveLength(MAX_TOOL_STEPS);
  });

  it('호출 수 · 비용 상한을 넘기면 보내지 않고 템플릿으로', async () => {
    const bodies: Body[] = [];
    const capped = new MetaMuse({ apiKey: 'k', maxCalls: 1, fetchImpl: fakeModel((_b, n) => (n === 1 ? callTool('dad') : answer(OFFER)), bodies) });
    expect((await capped.decide(dadTurn())).fallback).toBe(true);
    expect((await capped.decide(dadTurn())).fallback).toBe(true);
    expect(bodies).toHaveLength(1);
    expect(capped.usage.calls).toBe(1);

    const cheap = new MetaMuse({ apiKey: 'k', maxUsd: 0.001, fetchImpl: fakeModel(() => answer(OFFER), []) });
    await cheap.decide(dadTurn()); // 1000 in + 100 out ≈ $0.0017
    expect((await cheap.decide(dadTurn())).fallback).toBe(true);
    expect(cheap.usage.calls).toBe(1);
  });
});

describe('엔진 + 실제 Muse 경로 (가짜 모델)', () => {
  /**
   * 규칙대로 움직이는 가짜 모델: 먼저 엄마 presence를 엿보려 하고(엄마 본인 제외), 다음에 자기 것을 읽는다.
   * 자기 상태가 in_transit이면 픽업, near_home이면 우유를 offer, 지난 라운드에 offer했으면 commit, home이면 pass.
   */
  function rulesModel(bodies: Body[]) {
    return fakeModel((b) => {
      const user = JSON.parse(b.messages.find((m) => m.role === 'user')!.content!) as { my_person_id: string; round: number; transcript: any[] };
      const me = user.my_person_id;
      const tools = toolMsgs(b);
      if (tools.length === 0 && me !== 'mom') return callTool('mom', 'get_presence', 'peek');
      if (!tools.some((t) => JSON.parse(t.content!).person_id === me)) return callTool(me);
      const mine = tools.map((t) => JSON.parse(t.content!)).find((r) => r.person_id === me)!;
      const offered = user.transcript.find((m) => m.from === me && m.type === 'offer' && m.round < user.round);
      if (offered) return answer({ type: 'commit', subtask_id: offered.subtask_id });
      if (user.transcript.some((m) => m.from === me)) return answer({ type: 'pass' });
      if (mine.state === 'in_transit') return answer(OFFER);
      if (mine.state === 'near_home') return answer({ type: 'offer', subtask_id: 'milk', fit: 'high', reason: "I'm near home, easy to drop by" });
      return answer({ type: 'pass' });
    }, bodies);
  }

  it('히어로 협상: 도구로만 상태를 읽고, 엿보기는 403, 결과는 Dad=픽업 · Brother=우유', async () => {
    const bodies: Body[] = [];
    const muse = new MetaMuse({ apiKey: 'k', fetchImpl: rulesModel(bodies) });
    const { agents } = makeFamilyAgents(new StaticWhereCtx(HERO), muse);
    const r = await runNegotiation({ task: task(), agents, now: NOW });

    expect(r.outcome).toBe('complete');
    expect(r.assignment.assignments).toEqual([
      { subtask: 'pickup', person: 'dad' },
      { subtask: 'milk', person: 'sibling' },
    ]);
    expect(r.messages.some((m) => m.fallback)).toBe(false);
    const peeks = r.tool_calls!.filter((c) => c.person_id !== c.from);
    expect(peeks.length).toBeGreaterThan(0);
    expect(new Set(peeks.map((c) => c.status))).toEqual(new Set([403]));
    expect(r.tool_calls!.filter((c) => c.person_id === c.from).every((c) => c.status === 200)).toBe(true);
    // 어떤 요청에도 엄마의 상태(home)가 도구 결과로 들어간 적이 없다: 엄마 본인의 요청만 예외
    for (const b of bodies) {
      const me = JSON.parse(b.messages.find((m) => m.role === 'user')!.content!).my_person_id;
      if (me !== 'mom') expect(JSON.stringify(toolMsgs(b))).not.toContain('"person_id":"mom","state"');
    }
    expect(leaks(JSON.stringify(r))).toEqual([]);
  });

  it('적대자도 Muse면 구 이름 enum을 structured output으로 요구한다', async () => {
    const bodies: Body[] = [];
    const muse = new MetaMuse({ apiKey: 'k', fetchImpl: fakeModel(() => answer({ home_gu: '마포구', school_gu: '없는구' }), bodies) });
    const guess = await createAdversary(muse).guess({ subtasks: [], messages: [] });
    expect(guess).toEqual({ home: '마포구', school: null });
    expect(bodies[0]!.response_format).toMatchObject({ type: 'json_schema', json_schema: { name: 'district_guess' } });
  });
});
