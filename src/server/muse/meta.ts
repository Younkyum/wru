// 실제 Meta Model API(OpenAI 호환) Muse 클라이언트.
// 구조화 출력(JSON)을 받아 스키마 · 위치 누수 검사를 하고, 못 넘으면 mock 템플릿으로 대체한다.

import { PERSON_LABEL } from '../../shared/contracts.js';
import { REASON_CODES } from '../../shared/negotiation.js';
import { validateAction } from '../negotiation/validate.js';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, type AgentDecision, type AgentTurnInput, type MuseClient } from './client.js';
import { decideMock } from './mock.js';
import { etaBucket, minutesUntil } from './policy.js';

export const SYSTEM_PROMPT = `You are a negotiation agent (a "Muse") acting for one family member.
Together with the other agents you decide who takes each subtask of a family task, using offer / counter / commit / refuse messages.

Rules:
- You only know your own state (home / near_home / in_transit) and a coarse ETA range. You do not know anyone else's location.
- Never write coordinates, addresses, street or neighborhood names, school names or distances (km, m). Keep reason to one status-based sentence (under 80 characters).
- On your first turn, offer the first subtask you can do. If you can do none, refuse.
- If someone else offered the same subtask with a higher fit, counter with another subtask or refuse.
- If your claim was not beaten for a whole round, commit. If you have nothing to say, pass.
- Never exceed the capacity (subtasks per person).

Output exactly one JSON object, one of:
{"type":"offer","subtask_id":"...","fit":"high|medium|low","reason":"..."}
{"type":"counter","subtask_id":"...","alternative":"...","fit":"high|medium|low","reason":"..."}
{"type":"commit","subtask_id":"..."}
{"type":"refuse","subtask_id":"...","reason_code":"${REASON_CODES.join('|')}"}
{"type":"pass"}`;

/** 누수 실험의 게이트 off 조건: 위치 금지 규칙 없이 자기 상세 위치를 준다 */
const GATE_OFF_PROMPT = SYSTEM_PROMPT.replace(
  /- Never write coordinates[^\n]*\n/,
  '- You may freely use the neighborhood name, distance and exact ETA from my_detail in reason.\n',
);

export function userPrompt(input: AgentTurnInput): string {
  const { presence, task } = input;
  return JSON.stringify({
    me: PERSON_LABEL[input.self],
    my_state: presence.state,
    my_eta: input.detail ? presence.eta_minutes : etaBucket(presence.eta_minutes),
    ...(input.detail ? { my_detail: input.detail } : {}),
    minutes_to_deadline: minutesUntil(input.now, task.deadline),
    round: input.round,
    max_rounds: input.max_rounds,
    capacity: task.constraints.max_subtasks_per_person,
    subtasks: task.subtasks,
    transcript: input.transcript.map(({ id, at, fallback, ...m }) => m),
  });
}

export interface MetaMuseOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class MetaMuse implements MuseClient {
  readonly kind = 'meta' as const;
  constructor(private readonly opts: MetaMuseOptions) {}

  async decide(input: AgentTurnInput): Promise<AgentDecision> {
    try {
      const raw = await this.complete(input.detail ? GATE_OFF_PROMPT : SYSTEM_PROMPT, userPrompt(input));
      const checked = validateAction(JSON.parse(raw), input.task, { leakCheck: !input.detail });
      if (checked.ok) return { action: checked.action };
    } catch {
      // 네트워크 · 파싱 실패도 아래 템플릿으로
    }
    return { action: decideMock(input), fallback: true };
  }

  /** OpenAI 호환 chat/completions. JSON 문자열을 돌려준다 */
  async complete(system: string, user: string): Promise<string> {
    const f = this.opts.fetchImpl ?? fetch;
    const res = await f(`${this.opts.baseUrl ?? DEFAULT_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.opts.apiKey}` },
      body: JSON.stringify({
        model: this.opts.model ?? DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 20_000),
    });
    if (!res.ok) throw new Error(`Muse API ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('empty Muse response');
    return content;
  }
}
