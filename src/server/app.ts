import { Hono, type Context } from 'hono';
import {
  PERSON_LABEL,
  localHHMM,
  isForbiddenLocationKey,
  isPersonId,
  type DemoState,
  type PersonId,
} from '../shared/contracts.js';
import { EventLog } from './log.js';
import { HERO_TASK, TaskInbox, type SubmitResult } from './inbox.js';
import { Simulator, type SimulatorOptions } from './sim/simulator.js';
import type { WhereCtxAdapter } from './wherectx/adapter.js';
import { SimWhereCtx } from './wherectx/sim-adapter.js';
import { HttpWhereCtx, kstIso } from './wherectx/http-adapter.js';
import { FamilyWhereCtx } from './wherectx/family.js';
import { DEFAULT_FAMILY, isLive, type FamilyConfig } from './family-config.js';
import { AuthError, bearer, maskToken } from './auth/agent-tokens.js';
import { makeFamilyAgents } from './auth/gateway.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { MuseClient } from './muse/client.js';
import { createMuseClient } from './muse/factory.js';
import { runNegotiation } from './negotiation/engine.js';
import { publicMessages, type NegotiationRecord } from '../shared/negotiation.js';
import type { LeakReport } from '../shared/leak-report.js';
import { runLeakExperiment } from './privacy/experiment.js';
import { userPrompt } from './muse/meta.js';
import { filterMessage } from './privacy/filter.js';
import type { MessageBody } from '../shared/negotiation.js';
import { DEFAULT_MODEL } from './muse/client.js';
import type { MuseTurnView } from '../shared/muse-turn.js';
import { readFile } from 'node:fs/promises';
import { PERSON_IDS } from '../shared/contracts.js';

export interface AppOptions {
  sim?: SimulatorOptions;
  /** 없으면 환경변수로 고른다 (MODEL_API_KEY 있으면 실제 Muse) */
  muse?: MuseClient;
  /** 누수 리포트 JSON 경로. 파일이 없으면 mock으로 즉석 계산한다 */
  leakReportPath?: string;
  /** 구성원별 어댑터 (기본: 모두 시뮬레이터). index.ts가 family.config.json에서 읽어 넘긴다 */
  family?: FamilyConfig;
  /** 토큰 env (WRU_AGENT_TOKEN_*, family의 token_env, WRU_ADMIN_TOKEN) */
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

/** 시뮬레이터 시계 또는 실제 시계(실제 WhereCtx가 하나라도 붙으면) */
interface Clock {
  now(): string;
  label(): string;
  isoAt(minuteOfDay: number): string;
}

function liveClock(): Clock {
  return {
    now: () => kstIso(Date.now()),
    label: () => kstIso(Date.now()).slice(11, 16),
    isoAt: (m) => `${kstIso(Date.now()).slice(0, 10)}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00+09:00`,
  };
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** 쿼리에 좌표·상세 위치를 달라는 흔적이 있는지 (?include=raw_coords, ?lat= 등) */
function asksForLocationDetail(query: Record<string, string>): boolean {
  return Object.entries(query).some(
    ([key, value]) => isForbiddenLocationKey(key) || value.split(',').some((v) => isForbiddenLocationKey(v.trim())),
  );
}

export function createApp(options: AppOptions = {}) {
  const env = options.env ?? {};
  const family = options.family ?? DEFAULT_FAMILY;
  const live = isLive(family);
  const sim = new Simulator(options.sim);
  const simAdapter = new SimWhereCtx(sim);
  const wherectx: WhereCtxAdapter = new FamilyWhereCtx(
    Object.fromEntries(
      PERSON_IDS.map((id) => {
        const m = family[id];
        if (m.adapter === 'sim') return [id, simAdapter];
        return [
          id,
          new HttpWhereCtx({
            person_id: id,
            baseUrl: m.wherectx_url,
            token: env[m.token_env] ?? '',
            homePlace: m.home_place,
            etaMode: m.eta_mode,
            fetchImpl: options.fetchImpl,
          }),
        ];
      }),
    ) as Record<PersonId, WhereCtxAdapter>,
  );
  const clock: Clock = live ? liveClock() : { now: () => sim.now(), label: () => sim.nowLabel(), isoAt: (m) => sim.isoAt(m) };
  const now = () => clock.now();
  const log = new EventLog(now);
  const inbox = new TaskInbox((m) => clock.isoAt(m), now);
  const muse = options.muse ?? createMuseClient();
  let negotiations: NegotiationRecord[] = [];

  // 구성원마다 에이전트 하나와 에이전트 토큰 하나. 에이전트는 자기 토큰으로만 게이트웨이를 부를 수 있다.
  const { agents, issued, gateway, tokens: agentTokens } = makeFamilyAgents(wherectx, muse, { env });
  const tokenMasks = Object.fromEntries(PERSON_IDS.map((id) => [id, maskToken(issued[id])])) as Record<PersonId, string>;

  // 경계표를 만드는 내부 요청은 이벤트 로그에 남기지 않는다 (밖에서는 알 수 없는 값)
  const probeNonce = randomBytes(16).toString('hex');

  const allPresence = () => Promise.all(PERSON_IDS.map((id) => wherectx.get_presence(id)));

  const snapshot = async (): Promise<DemoState> => ({
    clock: { now: clock.now(), label: clock.label() },
    muse: muse.kind,
    live,
    presence: await allPresence(),
    tasks: inbox.list(),
    negotiations,
    log: log.list(),
  });

  const logSubmit = (result: SubmitResult) => {
    if (!result.ok) return;
    const labels = result.task.subtasks.map((s) => s.label).join(' + ');
    log.add('task_received', `Task received: ${labels} (due ${localHHMM(result.task.deadline)})`);
  };

  const app = new Hono().basePath('/api');

  // ── 에이전트 API: Authorization: Bearer <에이전트 토큰>. 토큰 주인의 것만 준다 (없음·틀림 401, 남의 것 403) ──
  const agentRead = (kind: 'presence' | 'eta') => async (c: Context) => {
    const id = c.req.param('id') ?? '';
    if (!isPersonId(id)) return c.json({ error: 'unknown person_id' }, 404);
    const token = bearer(c.req.header('authorization'));
    try {
      if (asksForLocationDetail(c.req.query())) {
        agentTokens.authorize(token, id);
        return refuse(id);
      }
      return c.json(kind === 'presence' ? await gateway.presence(token ?? '', id) : await gateway.eta(token ?? '', id));
    } catch (e) {
      if (!(e instanceof AuthError)) throw e;
      if (e.status === 403 && c.req.header('x-wru-probe') !== probeNonce) log.add('refusal', `Refused: another member's token asked for ${PERSON_LABEL[id]}'s presence`);
      return c.json({ error: e.code }, e.status);
    }
  };

  app.get('/agent/me', (c) => {
    const owner = agentTokens.owner(bearer(c.req.header('authorization')) ?? '');
    return owner ? c.json({ person_id: owner }) : c.json({ error: 'invalid_token' }, 401);
  });
  app.get('/agent/presence/:id', agentRead('presence'));
  app.get('/agent/eta/:id', agentRead('eta'));

  // ── 이 아래는 가족 대시보드(관리자) API. WRU_ADMIN_TOKEN이 있으면 Bearer로 그 값을 요구한다 ──
  // 실제 WhereCtx가 붙어 있으면(live) 관리자 토큰 없이는 열지 않는다 (fail closed). 시뮬레이터만이면 공개 데모로 연다.
  app.use('*', async (c, next) => {
    const admin = env.WRU_ADMIN_TOKEN;
    if (c.req.path.startsWith('/api/agent/')) return next();
    if (!admin) return live ? c.json({ error: 'admin_token_required' }, 401) : next();
    const token = bearer(c.req.header('authorization'));
    if (!token || !sameSecret(token, admin)) return c.json({ error: 'admin_token_required' }, 401);
    return next();
  });

  app.get('/state', async (c) => c.json(await snapshot()));

  app.get('/presence', async (c) => c.json(await allPresence()));

  app.get('/presence/:id', async (c) => {
    const id = c.req.param('id');
    if (!isPersonId(id)) return c.json({ error: 'unknown person_id' }, 404);
    if (asksForLocationDetail(c.req.query())) return refuse(id);
    return c.json(await wherectx.get_presence(id));
  });

  app.get('/eta/:id', async (c) => {
    const id = c.req.param('id');
    if (!isPersonId(id)) return c.json({ error: 'unknown person_id' }, 404);
    if (asksForLocationDetail(c.req.query())) return refuse(id);
    return c.json(await wherectx.get_eta(id));
  });

  // 좌표를 직접 달라는 경로도 같은 템플릿으로 거절
  app.get('/presence/:id/:detail', async (c) => {
    const id = c.req.param('id');
    if (!isPersonId(id)) return c.json({ error: 'unknown person_id' }, 404);
    return refuse(id);
  });

  async function refuse(id: PersonId) {
    log.add('refusal', `Refused a location-detail request for ${PERSON_LABEL[id]} (status and ETA only)`);
    return new Response(JSON.stringify(await wherectx.request_location_detail(id, 'location_detail')), {
      status: 403,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  // 시연용: 에이전트 토큰 경계를 실제 HTTP 요청으로 확인한 결과표 (토큰 원문은 내보내지 않는다)
  app.get('/demo/boundary', async (c) => {
    const holders = [...PERSON_IDS, 'none', 'forged'] as const;
    const rows = await Promise.all(
      holders.map(async (holder) => {
        const token = holder === 'none' ? null : holder === 'forged' ? 'wru_ag_forged-token-for-demo-000000' : issued[holder];
        const cells = await Promise.all(
          PERSON_IDS.map(async (target) => {
            const headers: Record<string, string> = { 'x-wru-probe': probeNonce };
            if (token) headers.authorization = `Bearer ${token}`;
            const res = await app.request(`/api/agent/presence/${target}`, { headers });
            return { target, status: res.status };
          }),
        );
        return { holder, token: holder === 'none' ? null : holder === 'forged' ? 'forged token' : tokenMasks[holder], cells };
      }),
    );
    return c.json({ rows });
  });

  app.post('/sim/advance', async (c) => {
    if (live) return c.json({ error: 'The clock cannot be advanced while a real WhereCtx is connected.' }, 409);
    const body = (await c.req.json().catch(() => ({}))) as { minutes?: unknown };
    const minutes = body.minutes === undefined ? 5 : Number(body.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 120) {
      return c.json({ error: 'minutes must be > 0 and <= 120.' }, 400);
    }
    sim.advance(minutes);
    log.add('clock', `Sim clock +${minutes} min → ${sim.nowLabel()}`);
    return c.json(await snapshot());
  });

  app.post('/sim/reset', async (c) => {
    sim.reset();
    inbox.clear();
    negotiations = [];
    log.clear();
    log.add('reset', `Demo reset → ${clock.label()}`);
    return c.json(await snapshot());
  });

  app.get('/tasks', (c) => c.json(inbox.list()));

  app.get('/tasks/:id', (c) => {
    const task = inbox.get(c.req.param('id'));
    return task ? c.json(task) : c.json({ error: 'task not found' }, 404);
  });

  app.post('/tasks', async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = inbox.submit(body);
    if (!result.ok) return c.json({ error: result.error }, 400);
    logSubmit(result);
    return c.json(result.task, 201);
  });

  // 히어로 시나리오 태스크: "6시에 민아 픽업 + 우유"
  app.post('/tasks/hero', (c) => {
    const result = inbox.submit(HERO_TASK);
    if (!result.ok) return c.json({ error: result.error }, 500);
    logSubmit(result);
    return c.json(result.task, 201);
  });

  // 누수 테스트 리포트: npm run leak이 만든 파일을 우선 쓰고, 없으면 mock으로 계산(결정론)
  let leakReport: Promise<LeakReport> | null = null;
  app.get('/leak-report', async (c) => {
    leakReport ??= readFile(options.leakReportPath ?? 'samples/leak-report.json', 'utf8')
      .then((text) => JSON.parse(text) as LeakReport)
      .catch(() => runLeakExperiment());
    return c.json(await leakReport);
  });

  // 시연용: 최근 협상에서 아빠 에이전트의 첫 차례를 Meta Model API 요청 본문으로 다시 만든다 (실제 meta.ts 코드 경로)
  app.get('/demo/muse-turn', async (c) => {
    const record = negotiations.at(-1);
    const task = record && inbox.get(record.task_id);
    const person = (c.req.query('person') ?? 'dad') as PersonId;
    if (!record || !task || !isPersonId(person)) return c.json({ error: 'no negotiation' }, 404);
    const index = record.messages.findIndex((m) => m.from === person);
    if (index < 0) return c.json({ error: 'no message' }, 404);
    const message = record.messages[index]!;
    const presence = await wherectx.get_presence(person);
    const user = JSON.parse(
      userPrompt({
        self: person,
        presence,
        now: message.at,
        task,
        round: message.round,
        max_rounds: record.max_rounds,
        transcript: record.messages.slice(0, index),
      }),
    ) as Record<string, unknown>;
    const { id: _id, at: _at, round: _round, fallback: _f, filtered: _fl, ...action } = message;
    const view: MuseTurnView = {
      person_id: person,
      round: message.round,
      model: env.MUSE_MODEL ?? DEFAULT_MODEL,
      response_format: { type: 'json_object' },
      user,
      action,
      muse: muse.kind,
      checks: ['JSON schema (type · subtask_id · fit)', 'coordinate / address / place-name check', 'reason rewritten to a status template', 'commits are judged by the engine'],
      rewrite: (() => {
        // 위치를 섞은 문장 예시 (동네 이름은 가림). 실제 필터 코드로 바꾼 결과를 보여 준다
        const from = 'Passing through [neighbourhood] now, [N] km from home, exactly 17 min left';
        const filtered = filterMessage({ ...(action as MessageBody), ...(action.type === 'offer' ? { reason: from } : {}) } as MessageBody, presence, task);
        return { from, to: 'reason' in filtered.body ? filtered.body.reason : '' };
      })(),
    };
    return c.json(view);
  });

  app.get('/negotiations', (c) => c.json(negotiations));

  app.get('/negotiations/:id', (c) => {
    const record = negotiations.find((n) => n.negotiation_id === c.req.param('id'));
    return record ? c.json(record) : c.json({ error: 'negotiation not found' }, 404);
  });

  app.post('/tasks/:id/negotiate', async (c) => {
    const task = inbox.get(c.req.param('id'));
    if (!task) return c.json({ error: 'task not found' }, 404);
    const result = await runNegotiation({ task, agents, now: clock.now() });
    const record: NegotiationRecord = {
      negotiation_id: `n_${String(negotiations.length + 1).padStart(3, '0')}`,
      task_id: task.task_id,
      muse: muse.kind,
      ...result,
      messages: publicMessages(result.messages),
      status: 'awaiting_approval',
      approved_at: null,
    };
    negotiations = [...negotiations, record];
    const label = (id: string) => task.subtasks.find((s) => s.id === id)?.label ?? id;
    const roles = record.assignment.assignments.map((a) => `${PERSON_LABEL[a.person]}=${label(a.subtask)}`).join(', ');
    log.add(
      'negotiation',
      `Negotiation: ${record.rounds} rounds · ${record.messages.length} messages → ${roles || 'nothing assigned'}` +
        (record.assignment.unassigned.length ? ` (unassigned: ${record.assignment.unassigned.map(label).join(', ')})` : ''),
    );
    return c.json(record, 201);
  });

  // 커밋 후 사람 승인 1회. 승인되면 사람별 통지가 나간다.
  app.post('/negotiations/:id/approve', (c) => {
    const record = negotiations.find((n) => n.negotiation_id === c.req.param('id'));
    if (!record) return c.json({ error: 'negotiation not found' }, 404);
    if (record.status === 'approved') return c.json(record);
    const approved: NegotiationRecord = { ...record, status: 'approved', approved_at: clock.now() };
    negotiations = negotiations.map((n) => (n === record ? approved : n));
    log.add('approval', `Roles approved → ${Object.keys(approved.assignment.notify).length} personal notifications sent`);
    return c.json(approved);
  });

  return app;
}
