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

export interface AppOptions {
  sim?: SimulatorOptions;
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

  const snapshot = (): DemoState => ({
    clock: { now: sim.now(), label: sim.nowLabel() },
    presence: sim.allPresence().map((p) => wherectx.get_presence(p.person_id)),
    tasks: inbox.list(),
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

  return app;
}
