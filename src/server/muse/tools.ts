// Muse tool calling: 에이전트가 자기 토큰으로 WRU 어댑터의 get_presence / get_eta를 직접 부른다.
// 도구 결과에는 상태와 ETA 구간만 넣는다. 다른 사람을 물으면 게이트웨이의 403이 그대로 도구 결과가 된다.

import { PERSON_IDS, isPersonId } from '../../shared/contracts.js';
import { FITS, REASON_CODES } from '../../shared/negotiation.js';
import { AuthError } from '../auth/agent-tokens.js';
import type { AgentTools, ToolCallRecord } from './client.js';
import { etaBucket } from './policy.js';

const personParam = {
  type: 'object',
  properties: { person_id: { type: 'string', enum: [...PERSON_IDS], description: 'Whose status to read. Only your own is allowed.' } },
  required: ['person_id'],
  additionalProperties: false,
} as const;

/** Chat Completions `tools` (https://dev.meta.ai/docs/tool-calling) */
export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'get_presence',
      description: "Read a family member's coarse status (home / near_home / in_transit / unknown) and ETA range. Your token can only read your own.",
      parameters: personParam,
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_eta',
      description: "Read a family member's coarse ETA range to home. Your token can only read your own.",
      parameters: personParam,
    },
  },
] as const;

const orNull = <T extends object>(schema: T) => ({ anyOf: [schema, { type: 'null' }] });

/**
 * offer / counter / commit / refuse / pass 한 개. strict 스키마라 모든 필드가 필수이고, 안 쓰는 필드는 null이다
 * (https://dev.meta.ai/docs/structured-output). 길이 · 소속 · 위치 검사는 validateAction이 다시 한다.
 * 비-strict로 두면 실제 모델이 {"type":"offer"}만 내고 끝나는 경우가 있었다.
 */
export const ACTION_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'agent_action',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['offer', 'counter', 'commit', 'refuse', 'pass'] },
        subtask_id: orNull({ type: 'string' }),
        alternative: orNull({ type: 'string' }),
        fit: orNull({ type: 'string', enum: [...FITS] }),
        reason: orNull({ type: 'string' }),
        reason_code: orNull({ type: 'string', enum: [...REASON_CODES] }),
      },
      required: ['type', 'subtask_id', 'alternative', 'fit', 'reason', 'reason_code'],
      additionalProperties: false,
    },
  },
} as const;

export interface ToolCall {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
}

/** 도구 하나 실행 → tool 메시지 content(JSON 문자열)와 감사 기록 */
export async function runTool(tools: AgentTools, call: ToolCall): Promise<{ content: string; record: ToolCallRecord }> {
  const name = call.function.name;
  let person: unknown;
  try {
    person = (JSON.parse(call.function.arguments || '{}') as { person_id?: unknown }).person_id;
  } catch {
    person = undefined;
  }
  const person_id = typeof person === 'string' && isPersonId(person) ? person : null;
  const fail = (status: ToolCallRecord['status'], error: string) => ({
    content: JSON.stringify({ error, status }),
    record: { name, person_id, status },
  });
  if (name !== 'get_presence' && name !== 'get_eta') return fail(400, 'unknown_tool');
  if (!person_id) return fail(400, 'bad_arguments');
  try {
    const body =
      name === 'get_presence'
        ? await tools.get_presence(person_id).then((p) => ({ person_id, state: p.state, eta: etaBucket(p.eta_minutes) }))
        : await tools.get_eta(person_id).then((e) => ({ person_id, eta: etaBucket(e.eta_minutes) }));
    return { content: JSON.stringify(body), record: { name, person_id, status: 200 } };
  } catch (err) {
    if (err instanceof AuthError) return fail(err.status, err.code);
    return fail(502, 'presence_unavailable');
  }
}
