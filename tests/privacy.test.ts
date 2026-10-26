import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PERSON_IDS, type PersonId, type Presence, type Task } from '../src/shared/contracts';
import { HERO_TASK } from '../src/server/inbox';
import type { MuseClient } from '../src/server/muse/client';
import { MetaMuse } from '../src/server/muse/meta';
import { MockMuse, decideMock } from '../src/server/muse/mock';
import { offerReason } from '../src/server/muse/policy';
import { runNegotiation, type Agent } from '../src/server/negotiation/engine';
import { guessMock, MuseAdversary, PRIOR } from '../src/server/privacy/adversary';
import { renderLeakReport, runLeakExperiment } from '../src/server/privacy/experiment';
import { filterMessage, findPlaceWords, labelHints, locationHints, normalize, sanitizeLabel } from '../src/server/privacy/filter';
import { DISTRICTS, PLACE_WORDS } from '../src/server/privacy/gazetteer';
import { makeScenario } from '../src/server/privacy/scenarios';
import { SIM_DATE } from './helpers';

const NOW = `${SIM_DATE}T17:30:00+09:00`;
const task: Task = {
  task_id: 't',
  deadline: `${SIM_DATE}T18:00:00+09:00`,
  subtasks: HERO_TASK.subtasks,
  constraints: { max_subtasks_per_person: 1 },
  received_at: NOW,
};
const dad: Presence = { person_id: 'dad', state: 'in_transit', eta_minutes: 20, updated_at: NOW };
const PRESENCE: Record<PersonId, Presence> = {
  mom: { person_id: 'mom', state: 'home', eta_minutes: null, updated_at: NOW },
  dad,
  sibling: { person_id: 'sibling', state: 'near_home', eta_minutes: 8, updated_at: NOW },
};

describe('메시지 필터', () => {
  it.each([
    '지금 망원동 지나는 중이에요',
    '강남구에서 출발해요',
    '집까지 3.2km 남았어요',
    '정확히 17분 남았어요',
    '테헤란로 152 근처',
    '대치초 앞에서 기다릴게요',
    '잠실역 지나는 중',
  ])('위치 단서가 있으면 템플릿으로: %s', (reason) => {
    const { body, filtered } = filterMessage({ type: 'offer', subtask_id: 'pickup', fit: 'high', reason }, dad, task);
    expect(filtered).toBe(true);
    expect(body).toMatchObject({ reason: offerReason(dad, task.subtasks[0]!) });
    expect(locationHints((body as { reason: string }).reason)).toEqual([]);
  });

  it('상태 템플릿은 그대로 통과 (ETA 구간은 허용)', () => {
    for (const p of Object.values(PRESENCE)) {
      for (const s of task.subtasks) {
        const reason = offerReason(p, s);
        expect(locationHints(reason)).toEqual([]);
        expect(filterMessage({ type: 'offer', subtask_id: s.id, fit: 'low', reason }, p, task).filtered).toBe(false);
      }
    }
  });

  it('깨끗해 보이는 LLM 문장도 템플릿으로 다시 쓴다 (자유 문장은 내보내지 않음)', () => {
    const { body, filtered } = filterMessage({ type: 'offer', subtask_id: 'pickup', fit: 'high', reason: '제가 갈게요!' }, dad, task);
    expect(filtered).toBe(true);
    expect(body).toMatchObject({ reason: offerReason(dad, task.subtasks[0]!) });
  });

  it('commit · refuse는 건드리지 않는다', () => {
    expect(filterMessage({ type: 'commit', subtask_id: 'pickup' }, dad, task).filtered).toBe(false);
  });

  it.each([
    '민아 픽업 (망원동 쪽)',
    '망 원 동 픽업',
    '망\u200b원동 픽업',
    '연남동 픽업',
    '합정역에서 픽업',
    '대치초 앞 픽업',
    '올림픽대로 쪽 픽업',
    '민아 픽업 (망원 쪽)',
    '민아 픽업 (대치)',
    '민아 픽업 (Mangwon)',
    '민아 픽업 (MAPO-GU)',
    '망원시장 앞',
    '서울숲 픽업',
    '홍대입구 픽업',
    '2호선 픽업',
    '이마트 앞 픽업',
  ])('인박스 라벨 검사가 막는다: %s', (label) => {
    expect(labelHints(label).length).toBeGreaterThan(0);
  });

  it('알려진 오탐: "동"으로 끝나는 일상어 라벨은 거절된다 (감수)', () => {
    expect(labelHints('봉사활동 데려가기').length).toBeGreaterThan(0);
  });

  it('counter 이유에는 라벨이 들어가지 않는다', () => {
    const labelled = { ...task, subtasks: [{ id: 'pickup', label: '라벨A', kind: 'pickup' as const }, { id: 'milk', label: '라벨B', kind: 'errand' as const }] };
    const { body } = filterMessage({ type: 'counter', subtask_id: 'pickup', alternative: 'milk', fit: 'high', reason: 'x' }, dad, labelled);
    expect((body as { reason: string }).reason).not.toMatch(/라벨/);
  });

  it('평범한 라벨은 통과', () => {
    for (const label of ['민아 픽업', '우유 사기', '분리수거', '이름 없는 일']) expect(labelHints(label)).toEqual([]);
  });

  it('라벨의 위치 설명을 지운다', () => {
    expect(sanitizeLabel('민아 픽업 (대치동 쪽)')).toBe('민아 픽업');
    expect(sanitizeLabel('민아 픽업 (늦지 않게)')).toBe('민아 픽업 (늦지 않게)');
    expect(sanitizeLabel('잠실동 픽업')).toBe('이름 없는 일');
  });

  it('지명 사전은 일상어와 겹치지 않는다 (이동 · 동작 · 길에)', () => {
    expect(findPlaceWords('이동 중이라 가는 길에 들를 수 있어요. 잘 동작해요')).toEqual([]);
    expect(PLACE_WORDS.length).toBeGreaterThanOrEqual(60);
  });
});

describe('게이트 on 협상', () => {
  // 어떻게든 위치를 아는 LLM이 동네 이름을 말하려 하는 경우
  const leakyLLM: MuseClient = {
    kind: 'meta',
    decide: async (input) => {
      const a = decideMock(input);
      if (a.type === 'offer') return { action: { ...a, reason: `지금 ${DISTRICTS[3]!.dongs[0]} 근처예요` } };
      if (a.type === 'counter') return { action: { ...a, reason: `${DISTRICTS[5]!.name} 쪽이라 ${a.reason}` } };
      return { action: a };
    },
  };
  const agents = (muse: MuseClient): Agent[] =>
    PERSON_IDS.map((id) => ({ person_id: id, muse, wherectx: { person_id: id, presence: () => PRESENCE[id], detail: () => ({ area: '망원동', distance_km: 3, style: 'area' as const }) } }));

  it('LLM이 지명을 써도 로그에는 남지 않고, 결과는 그대로', async () => {
    const r = await runNegotiation({ task, agents: agents(leakyLLM), now: NOW });
    for (const m of r.messages) if ('reason' in m) expect(locationHints(m.reason)).toEqual([]);
    expect(r.messages.filter((m) => m.filtered).length).toBeGreaterThan(0);
    expect(Object.fromEntries(r.assignment.assignments.map((a) => [a.subtask, a.person]))).toEqual({ pickup: 'dad', milk: 'sibling' });
  });

  // 리뷰에서 나온 우회 표현들. 게이트 on이면 어떤 것도 로그에 남지 않아야 한다
  const BYPASS = [
    '망원 근처예요',
    '망 원 동',
    '망\u200b원동',
    'Mangwon-dong',
    'Gangnam station',
    '합정역에서 내려요',
    '홍대입구 2호선',
    '올림픽대로 타는 중',
    '이마트 앞',
    '연남동',
    '17:45 도착',
    '십오 분',
    '15min',
    '120분 이내',
    '３ｋｍ',
    '집까지 삼 킬로',
  ];
  const TOKENS = ['망원', 'Mangwon', 'Gangnam', '합정', '홍대', '2호선', '올림픽', '이마트', '연남', '17:45', '십오', '15min', '120', '3km', '삼킬로'];

  it.each(BYPASS)('우회 표현도 로그에 남지 않는다: %s', async (phrase) => {
    const bypass: MuseClient = {
      kind: 'meta',
      decide: async (input) => {
        const a = decideMock(input);
        return { action: a.type === 'offer' || a.type === 'counter' ? { ...a, reason: phrase } : a };
      },
    };
    const r = await runNegotiation({ task, agents: agents(bypass), now: NOW });
    const log = normalize(JSON.stringify(r.messages.map((m) => ('reason' in m ? m.reason : ''))));
    for (const token of TOKENS) expect(log).not.toContain(token);
    expect(r.assignment.assignments).toHaveLength(2);
  });

  it('게이트 on이면 엔진이 상세 위치를 에이전트에게 넘기지 않는다', async () => {
    const seen: unknown[] = [];
    const spy: MuseClient = { kind: 'mock', decide: async (input) => (seen.push(input.detail), { action: decideMock(input) }) };
    await runNegotiation({ task, agents: agents(spy), now: NOW });
    expect(seen.every((d) => d === undefined)).toBe(true);
    seen.length = 0;
    await runNegotiation({ task, agents: agents(spy), now: NOW, gate: 'off' });
    expect(seen.every((d) => d !== undefined)).toBe(true);
  });
});

describe('적대자', () => {
  it('mock 추론기는 로그 속 단서로 추론한다', () => {
    const [home, other] = [DISTRICTS[13]!, DISTRICTS[22]!];
    const log = {
      subtasks: [{ id: 'pickup', label: `민아 픽업 (${other.dongs[0]} 쪽)` }],
      messages: [
        { id: 1, round: 1, at: NOW, from: 'sibling', type: 'offer', subtask_id: 'pickup', fit: 'medium', reason: `${home.dongs[1]} 근처라 금방 가요` },
      ] as never,
    };
    expect(guessMock(log)).toEqual({ home: home.name, school: other.name });
  });

  it('단서가 없으면 가장 가운데 구를 찍는다 (정답을 볼 방법이 없다)', () => {
    const log = { subtasks: [{ id: 'pickup', label: '민아 픽업' }], messages: [] };
    expect(guessMock(log)).toEqual({ home: PRIOR.name, school: PRIOR.name });
  });

  it('적대자는 공개 로그만 받는다 (정답 필드 없음)', async () => {
    const seen: unknown[] = [];
    const spy = { kind: 'mock' as const, guess: async (log: unknown) => (seen.push(log), { home: null, school: null }) };
    await runLeakExperiment({ trials: 3, muse: new MockMuse(), adversary: spy });
    expect(seen).toHaveLength(9);
    for (const log of seen as { subtasks: object[]; messages: object[] }[]) {
      expect(Object.keys(log).sort()).toEqual(['messages', 'subtasks']);
      for (const s of log.subtasks) expect(Object.keys(s).sort()).toEqual(['id', 'label']);
      const text = JSON.stringify(log);
      expect(text).not.toMatch(/"(home|school|seed|scenario|area|distance_km|style)"/);
    }
    // 적대자 모듈은 시나리오 모듈을 import하지 않는다
    expect(readFileSync('src/server/privacy/adversary.ts', 'utf8')).not.toMatch(/scenarios|experiment/);
  });

  it('mock 추론기는 우회 말투(어간 · 띄어 쓰기 · 제로폭 · 역)와 ETA로도 추론한다', () => {
    const home = DISTRICTS[13]!;
    const at = (reason: string) => ({ subtasks: [], messages: [{ id: 1, round: 1, at: NOW, from: 'sibling', type: 'offer', subtask_id: 'pickup', fit: 'high', reason }] as never });
    for (const name of [home.dongs[0], [...home.dongs[0]].join(' '), [...home.dongs[0]].join('\u200b'), `${home.dongs[0].slice(0, -1)}역`]) {
      expect(guessMock(at(`${name} 근처라 금방 가요`)).home).toBe(home.name);
    }
  });

  it('Muse 적대자: 후보에 없는 답은 무효', async () => {
    const reply = (content: string) =>
      (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }))) as unknown as typeof fetch;
    const ok = new MuseAdversary(new MetaMuse({ apiKey: 'k', fetchImpl: reply('{"home_gu":"마포구","school_gu":"강남구"}') }));
    expect(await ok.guess({ subtasks: [], messages: [] })).toEqual({ home: '마포구', school: '강남구' });
    const bad = new MuseAdversary(new MetaMuse({ apiKey: 'k', fetchImpl: reply('{"home_gu":"판교","school_gu":1}') }));
    expect(await bad.guess({ subtasks: [], messages: [] })).toEqual({ home: null, school: null });
  });
});

describe('누수 실험', () => {
  it('시나리오는 시드마다 다르고 결정론적', () => {
    expect(makeScenario(7)).toEqual(makeScenario(7));
    const homes = new Set(Array.from({ length: 50 }, (_, i) => makeScenario(i + 1).home.name));
    expect(homes.size).toBeGreaterThanOrEqual(15);
  });

  it('게이트 on 라벨은 인박스 검사를 통과하는 라벨이다 (운영과 같은 조건)', () => {
    for (let i = 1; i <= 50; i += 1) {
      const s = makeScenario(i);
      const original = s.labelHasSchoolArea ? `민아 픽업 (${s.schoolArea} 쪽)` : '민아 픽업';
      expect(labelHints(sanitizeLabel(original))).toEqual([]);
      if (s.labelHasSchoolArea) expect(labelHints(original).length).toBeGreaterThan(0);
    }
  });

  it('20회 이상 · 게이트 on은 우연 수준 근처, off는 크게 높다', async () => {
    const r = await runLeakExperiment({ trials: 50, muse: new MockMuse() });
    expect(r.trials).toBeGreaterThanOrEqual(20);
    expect(r.chance).toBeCloseTo(1 / 25);
    for (const k of ['on', 'filter_only'] as const) {
      expect(r.gates[k].location_hints).toBe(0);
      expect(r.gates[k].home_rate).toBeLessThanOrEqual(r.chance * 3);
      expect(r.gates[k].school_rate).toBeLessThanOrEqual(r.chance * 3);
    }
    expect(r.gates.filter_only.filtered).toBeGreaterThan(0);
    expect(r.gates.off.home_rate).toBeGreaterThanOrEqual(0.5);
    expect(r.gates.off.school_rate).toBeGreaterThanOrEqual(0.5);
  });

  it('커밋된 리포트(samples/leak-report.json, leak-report.md)는 지금 실행 결과와 같다', async () => {
    const committed = JSON.parse(readFileSync('samples/leak-report.json', 'utf8'));
    const fresh = await runLeakExperiment({ trials: committed.trials, muse: new MockMuse() });
    expect(committed).toEqual(fresh);
    expect(readFileSync('leak-report.md', 'utf8')).toBe(renderLeakReport(fresh));
  });
});
