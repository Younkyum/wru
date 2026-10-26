// 에이전트(특히 실제 Muse) 출력 검증. 스키마 · 소속 · 위치 누수를 확인한다.

import { findForbiddenKey, type Task } from '../../shared/contracts.js';
import { findLeaks } from '../../shared/leak.js';
import { FITS, REASON_CODES, type AgentAction } from '../../shared/negotiation.js';

const MAX_REASON = 120;

export type Validation = { ok: true; action: AgentAction } | { ok: false; error: string };

function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function validateAction(raw: unknown, task: Task): Validation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not an object' };
  if (findForbiddenKey(raw)) return { ok: false, error: 'forbidden location key' };
  const r = raw as Record<string, unknown>;
  const has = (id: unknown) => isStr(id) && task.subtasks.some((s) => s.id === id);
  const reasonOk = (v: unknown) => isStr(v) && v.length <= MAX_REASON && findLeaks(v).length === 0;
  const fitOk = (v: unknown) => (FITS as readonly unknown[]).includes(v);

  switch (r.type) {
    case 'pass':
      return { ok: true, action: { type: 'pass' } };
    case 'offer':
      if (!has(r.subtask_id) || !fitOk(r.fit) || !reasonOk(r.reason)) return { ok: false, error: 'bad offer' };
      return { ok: true, action: { type: 'offer', subtask_id: r.subtask_id as string, fit: r.fit as never, reason: r.reason as string } };
    case 'counter':
      if (!has(r.subtask_id) || !has(r.alternative) || r.subtask_id === r.alternative || !fitOk(r.fit) || !reasonOk(r.reason)) {
        return { ok: false, error: 'bad counter' };
      }
      return {
        ok: true,
        action: {
          type: 'counter',
          subtask_id: r.subtask_id as string,
          alternative: r.alternative as string,
          fit: r.fit as never,
          reason: r.reason as string,
        },
      };
    case 'commit':
      if (!has(r.subtask_id)) return { ok: false, error: 'bad commit' };
      return { ok: true, action: { type: 'commit', subtask_id: r.subtask_id as string } };
    case 'refuse':
      if (!has(r.subtask_id) || !(REASON_CODES as readonly unknown[]).includes(r.reason_code)) {
        return { ok: false, error: 'bad refuse' };
      }
      return { ok: true, action: { type: 'refuse', subtask_id: r.subtask_id as string, reason_code: r.reason_code as never } };
    default:
      return { ok: false, error: 'unknown type' };
  }
}
