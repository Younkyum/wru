// 실제 Meta Model API Muse 클라이언트 (Chat Completions, https://dev.meta.ai/docs/protocols/chat-completions).
// 운영 경로: 모델이 tool calling으로 자기 presence를 읽고(남의 것은 403), structured output으로 행동 JSON 하나를 낸다.
// 받은 JSON은 스키마 · 위치 누수 검사를 하고, 못 넘으면 mock 템플릿으로 대체한다.

import { PERSON_LABEL } from '../../shared/contracts.js';
import { REASON_CODES } from '../../shared/negotiation.js';
import { validateAction } from '../negotiation/validate.js';
import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_CALLS,
  DEFAULT_MAX_USD,
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  estimateUsd,
  type AgentDecision,
  type AgentTurnInput,
  type MuseClient,
  type MuseUsage,
  type ToolCallRecord,
} from './client.js';
import { decideMock } from './mock.js';
import { etaBucket, minutesUntil } from './policy.js';
import { ACTION_FORMAT, TOOL_DEFS, runTool, type ToolCall } from './tools.js';

const RULES = `Fit guide (judge only from your own status):
- pickup: in_transit = high (you can stop by on the way), near_home = medium, home = low
- errand (a nearby store): near_home = high, in_transit = medium, home = low
- If you cannot finish before the deadline (ETA range vs minutes_to_deadline), refuse.

Rules:
- Never write coordinates, addresses, street or neighborhood names, school names or distances (km, m). Keep reason to one status-based sentence (under 80 characters).
- On your first turn, offer the subtask where your fit is highest. If you can do none, refuse.
- If someone else offered the same subtask with a higher fit, counter with another subtask or refuse.
- If your claim was not beaten for a whole round, commit. If you have nothing to say, pass.
- Never exceed the capacity (subtasks per person).

Output exactly one JSON object, one of:
{"type":"offer","subtask_id":"...","fit":"high|medium|low","reason":"..."}
{"type":"counter","subtask_id":"...","alternative":"...","fit":"high|medium|low","reason":"..."}
{"type":"commit","subtask_id":"..."}
{"type":"refuse","subtask_id":"...","reason_code":"${REASON_CODES.join('|')}"}
{"type":"pass"}`;

const INTRO = `You are a negotiation agent (a "Muse") acting for one family member.
Together with the other agents you decide who takes each subtask of a family task, using offer / counter / commit / refuse messages.`;

/** 프롬프트에 자기 상태를 넣어 주는 방식 (누수 실험의 게이트 off · filter_only 조건) */
export const SYSTEM_PROMPT = `${INTRO}

- You only know your own state (home / near_home / in_transit) and a coarse ETA range. You do not know anyone else's location.
${RULES}`;

/** 운영 경로: 상태는 도구로 직접 읽는다 */
export const TOOL_SYSTEM_PROMPT = `${INTRO}

- You do not get your state in this message. Call get_presence with your own person_id (my_person_id) to read it: home / near_home / in_transit and a coarse ETA range.
- Your token only reads your own status. Asking about anyone else returns 403; do not retry, decide from your own status and the transcript.
${RULES}`;

/** 누수 실험의 게이트 off 조건: 위치 금지 규칙 없이 자기 상세 위치를 준다 */
const GATE_OFF_PROMPT = SYSTEM_PROMPT.replace(
  /- Never write coordinates[^\n]*\n/,
  '- You may freely use the neighborhood name, distance and exact ETA from my_detail in reason.\n',
);

function sharedFields(input: AgentTurnInput) {
  const { task } = input;
  return {
    minutes_to_deadline: minutesUntil(input.now, task.deadline),
    round: input.round,
    max_rounds: input.max_rounds,
    capacity: task.constraints.max_subtasks_per_person,
    subtasks: task.subtasks,
    transcript: input.transcript.map(({ id, at, fallback, filtered, ...m }) => m),
  };
}

export function userPrompt(input: AgentTurnInput): string {
  const { presence } = input;
  return JSON.stringify({
    me: PERSON_LABEL[input.self],
    my_state: presence.state,
    my_eta: input.detail ? presence.eta_minutes : etaBucket(presence.eta_minutes),
    ...(input.detail ? { my_detail: input.detail } : {}),
    ...sharedFields(input),
  });
}

/** tool calling 경로의 user 메시지: 자기 상태가 없다 (도구로 읽는다) */
export function toolUserPrompt(input: AgentTurnInput): string {
  return JSON.stringify({ me: PERSON_LABEL[input.self], my_person_id: input.self, ...sharedFields(input) });
}

/** 한 차례에 모델과 주고받는 최대 왕복 (도구 호출 루프 상한) */
export const MAX_TOOL_STEPS = 3;

export class BudgetError extends Error {}

export interface MetaMuseOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** 이 클라이언트가 보낼 수 있는 최대 호출 수 */
  maxCalls?: number;
  /** 예상 비용 상한 (USD) */
  maxUsd?: number;
  /** Chat Completions reasoning_effort. Muse Spark는 none을 받지 않는다 (minimal · low · medium · high · xhigh) */
  reasoningEffort?: string;
}

type ChatMessage = Record<string, unknown>;
interface ChatResponse {
  choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class MetaMuse implements MuseClient {
  readonly kind = 'meta' as const;
  readonly usage: MuseUsage = { calls: 0, prompt_tokens: 0, completion_tokens: 0 };
  /** 마지막으로 템플릿 대체를 부른 오류 (예: "Muse API 402"). 키나 응답 원문은 담지 않는다 */
  lastError: string | null = null;
  constructor(private readonly opts: MetaMuseOptions) {}

  get model(): string {
    return this.opts.model ?? DEFAULT_MODEL;
  }

  async decide(input: AgentTurnInput): Promise<AgentDecision> {
    const tool_calls: ToolCallRecord[] = [];
    const withCalls = (d: AgentDecision): AgentDecision => (tool_calls.length ? { ...d, tool_calls } : d);
    try {
      const raw =
        input.tools && !input.detail
          ? await this.toolTurn(input, tool_calls)
          : await this.complete(input.detail ? GATE_OFF_PROMPT : SYSTEM_PROMPT, userPrompt(input));
      const checked = validateAction(JSON.parse(raw), input.task, { leakCheck: !input.detail });
      if (checked.ok) return withCalls({ action: checked.action });
      this.lastError = `invalid action: ${checked.error}`;
    } catch (err) {
      // 네트워크 · 파싱 · 비용 상한도 아래 템플릿으로
      this.lastError = err instanceof SyntaxError ? 'response was not JSON' : err instanceof Error ? err.message : 'unknown error';
    }
    return withCalls({ action: decideMock(input), fallback: true });
  }

  /** 도구 호출 루프. 모델이 도구를 그만 부르고 낸 최종 content(JSON 문자열)를 돌려준다 */
  private async toolTurn(input: AgentTurnInput, records: ToolCallRecord[]): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: TOOL_SYSTEM_PROMPT },
      { role: 'user', content: toolUserPrompt(input) },
    ];
    for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
      const msg = (await this.chat({ messages, tools: TOOL_DEFS, tool_choice: 'auto', response_format: ACTION_FORMAT })).choices?.[0]?.message;
      if (!msg) throw new Error('empty Muse response');
      if (!msg.tool_calls?.length) {
        if (!msg.content) throw new Error('empty Muse response');
        return msg.content;
      }
      // 문서: tool 결과 앞에 tool_calls가 든 assistant 메시지를 그대로 다시 보내야 한다
      messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        const { content, record } = await runTool(input.tools!, call);
        records.push(record);
        messages.push({ role: 'tool', tool_call_id: call.id, content });
      }
    }
    throw new Error(`tool loop cap (${MAX_TOOL_STEPS}) reached`);
  }

  /** 도구 없이 JSON 하나를 받는다 (게이트 off 조건 · 적대자) */
  async complete(system: string, user: string, responseFormat: unknown = ACTION_FORMAT): Promise<string> {
    const data = await this.chat({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: responseFormat,
    });
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('empty Muse response');
    return content;
  }

  /** POST /chat/completions. 호출 수 · 예상 비용 상한을 넘기면 보내지 않는다 */
  async chat(body: Record<string, unknown>): Promise<ChatResponse> {
    if (this.usage.calls >= (this.opts.maxCalls ?? DEFAULT_MAX_CALLS)) throw new BudgetError('Muse call cap reached');
    if (estimateUsd(this.usage) >= (this.opts.maxUsd ?? DEFAULT_MAX_USD)) throw new BudgetError('Muse cost cap reached');
    this.usage.calls += 1;
    const f = this.opts.fetchImpl ?? fetch;
    const res = await f(`${this.opts.baseUrl ?? DEFAULT_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.opts.apiKey}` },
      // temperature는 기본값: 문서상 Muse Spark는 기본값에 맞춰져 있고, 0이면 strict 아닌 스키마에서 출력이 무너졌다
      body: JSON.stringify({ model: this.model, reasoning_effort: this.opts.reasoningEffort ?? DEFAULT_REASONING_EFFORT, ...body }),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30_000),
    });
    if (!res.ok) throw new Error(`Muse API ${res.status}`);
    const data = (await res.json()) as ChatResponse;
    this.usage.prompt_tokens += data.usage?.prompt_tokens ?? 0;
    this.usage.completion_tokens += data.usage?.completion_tokens ?? 0;
    return data;
  }
}
