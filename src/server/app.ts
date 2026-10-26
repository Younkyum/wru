import { Hono } from 'hono';
import {
  PERSON_LABEL_KO,
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
import type { MuseClient } from './muse/client.js';
import { createMuseClient } from './muse/factory.js';
import { runNegotiation, type Agent } from './negotiation/engine.js';
import type { NegotiationRecord } from '../shared/negotiation.js';
import { PERSON_IDS } from '../shared/contracts.js';

export interface AppOptions {
  sim?: SimulatorOptions;
  /** 없으면 환경변수로 고른다 (MODEL_API_KEY 있으면 실제 Muse) */
  muse?: MuseClient;
}

/** 쿼리에 좌표·상세 위치를 달라는 흔적이 있는지 (?include=raw_coords, ?lat= 등) */
function asksForLocationDetail(query: Record<string, string>): boolean {
  return Object.entries(query).some(
    ([key, value]) => isForbiddenLocationKey(key) || value.split(',').some((v) => isForbiddenLocationKey(v.trim())),
  );
}

export function createApp(options: AppOptions = {}) {
  const sim = new Simulator(options.sim);
  const wherectx: WhereCtxAdapter = new SimWhereCtx(sim);
  const now = () => sim.now();
  const log = new EventLog(now);
  const inbox = new TaskInbox((m) => sim.isoAt(m), now);
  const muse = options.muse ?? createMuseClient();
  let negotiations: NegotiationRecord[] = [];

  // 사람마다 에이전트 하나. 각자 자기 presence만 읽을 수 있는 WhereCtx를 받는다.
  const agents: Agent[] = PERSON_IDS.map((person_id) => ({
    person_id,
    wherectx: { person_id, presence: () => wherectx.get_presence(person_id) },
    muse,
  }));

  const snapshot = (): DemoState => ({
    clock: { now: sim.now(), label: sim.nowLabel() },
    muse: muse.kind,
    presence: sim.allPresence().map((p) => wherectx.get_presence(p.person_id)),
    tasks: inbox.list(),
    negotiations,
    log: log.list(),
  });

  const logSubmit = (result: SubmitResult) => {
    if (!result.ok) return;
    const labels = result.task.subtasks.map((s) => s.label).join(' + ');
    log.add('task_received', `인박스에 태스크 도착: ${labels} (마감 ${result.task.deadline.slice(11, 16)})`);
  };

  const app = new Hono().basePath('/api');

  app.get('/state', (c) => c.json(snapshot()));

  app.get('/presence', (c) => c.json(sim.allPresence().map((p) => wherectx.get_presence(p.person_id))));

  app.get('/presence/:id', (c) => {
    const id = c.req.param('id');
    if (!isPersonId(id)) return c.json({ error: 'unknown person_id' }, 404);
    if (asksForLocationDetail(c.req.query())) return refuse(id);
    return c.json(wherectx.get_presence(id));
  });

  app.get('/eta/:id', (c) => {
    const id = c.req.param('id');
    if (!isPersonId(id)) return c.json({ error: 'unknown person_id' }, 404);
    if (asksForLocationDetail(c.req.query())) return refuse(id);
    return c.json(wherectx.get_eta(id));
  });

  // 좌표를 직접 달라는 경로도 같은 템플릿으로 거절
  app.get('/presence/:id/:detail', (c) => {
    const id = c.req.param('id');
    if (!isPersonId(id)) return c.json({ error: 'unknown person_id' }, 404);
    return refuse(id);
  });

  function refuse(id: PersonId) {
    log.add('refusal', `${PERSON_LABEL_KO[id]}의 위치 상세 요청을 거절했어요 (상태·ETA만 제공)`);
    return new Response(JSON.stringify(wherectx.request_location_detail(id, 'location_detail')), {
      status: 403,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  app.post('/sim/advance', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { minutes?: unknown };
    const minutes = body.minutes === undefined ? 5 : Number(body.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 120) {
      return c.json({ error: 'minutes는 0 초과 120 이하여야 해요.' }, 400);
    }
    sim.advance(minutes);
    log.add('clock', `시뮬 시계 +${minutes}분 → ${sim.nowLabel()}`);
    return c.json(snapshot());
  });

  app.post('/sim/reset', (c) => {
    sim.reset();
    inbox.clear();
    negotiations = [];
    log.clear();
    log.add('reset', `데모 리셋 → ${sim.nowLabel()}`);
    return c.json(snapshot());
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

  app.get('/negotiations', (c) => c.json(negotiations));

  app.get('/negotiations/:id', (c) => {
    const record = negotiations.find((n) => n.negotiation_id === c.req.param('id'));
    return record ? c.json(record) : c.json({ error: 'negotiation not found' }, 404);
  });

  app.post('/tasks/:id/negotiate', async (c) => {
    const task = inbox.get(c.req.param('id'));
    if (!task) return c.json({ error: 'task not found' }, 404);
    const result = await runNegotiation({ task, agents, now: sim.now() });
    const record: NegotiationRecord = {
      negotiation_id: `n_${String(negotiations.length + 1).padStart(3, '0')}`,
      task_id: task.task_id,
      muse: muse.kind,
      ...result,
      status: 'awaiting_approval',
      approved_at: null,
    };
    negotiations = [...negotiations, record];
    const label = (id: string) => task.subtasks.find((s) => s.id === id)?.label ?? id;
    const roles = record.assignment.assignments.map((a) => `${PERSON_LABEL_KO[a.person]}=${label(a.subtask)}`).join(', ');
    log.add(
      'negotiation',
      `협상 ${record.rounds}라운드 · 메시지 ${record.messages.length}개 → ${roles || '배정 없음'}` +
        (record.assignment.unassigned.length ? ` (미배정 ${record.assignment.unassigned.map(label).join(', ')})` : ''),
    );
    return c.json(record, 201);
  });

  // 커밋 후 사람 승인 1회. 승인되면 사람별 통지가 나간다.
  app.post('/negotiations/:id/approve', (c) => {
    const record = negotiations.find((n) => n.negotiation_id === c.req.param('id'));
    if (!record) return c.json({ error: 'negotiation not found' }, 404);
    if (record.status === 'approved') return c.json(record);
    const approved: NegotiationRecord = { ...record, status: 'approved', approved_at: sim.now() };
    negotiations = negotiations.map((n) => (n === record ? approved : n));
    log.add('approval', `역할 승인 → 사람별 통지 ${Object.keys(approved.assignment.notify).length}건 전송`);
    return c.json(approved);
  });

  return app;
}
