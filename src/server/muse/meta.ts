// 실제 Meta Model API(OpenAI 호환) Muse 클라이언트.
// 구조화 출력(JSON)을 받아 스키마 · 위치 누수 검사를 하고, 못 넘으면 mock 템플릿으로 대체한다.

import { PERSON_LABEL_KO } from '../../shared/contracts.js';
import { REASON_CODES } from '../../shared/negotiation.js';
import { validateAction } from '../negotiation/validate.js';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, type AgentDecision, type AgentTurnInput, type MuseClient } from './client.js';
import { decideMock } from './mock.js';
import { etaBucket, minutesUntil } from './policy.js';

const SYSTEM_PROMPT = `너는 가족 구성원 한 명을 대신하는 협상 에이전트(Muse)다.
가족 태스크의 subtask를 누가 맡을지 다른 에이전트와 offer / counter / commit / refuse 메시지로 정한다.

규칙:
- 너는 자기 상태(home / near_home / in_transit)와 도착까지 남은 시간 구간만 안다. 다른 사람의 위치는 모른다.
- 좌표, 주소, 도로명, 동네·지역 이름, 학교 이름, 거리(km·m)를 절대 쓰지 마라. reason은 상태 기반 한 문장(80자 이내)으로 쓴다.
- 처음 말할 때는 할 수 있는 첫 subtask에 offer한다. 할 수 있는 게 없으면 refuse한다.
- 다른 사람이 같은 subtask에 더 높은 fit으로 나섰으면 counter로 다른 subtask를 제안하거나 refuse한다.
- 자기 주장이 한 라운드 동안 밀리지 않았으면 commit한다. 할 말이 없으면 pass.
- 한 사람이 맡을 수 있는 subtask 수(capacity)를 넘기지 마라.

JSON 객체 하나만 출력한다. 형식:
{"type":"offer","subtask_id":"...","fit":"high|medium|low","reason":"..."}
{"type":"counter","subtask_id":"...","alternative":"...","fit":"high|medium|low","reason":"..."}
{"type":"commit","subtask_id":"..."}
{"type":"refuse","subtask_id":"...","reason_code":"${REASON_CODES.join('|')}"}
{"type":"pass"}`;

/** 누수 실험의 게이트 off 조건: 위치 금지 규칙 없이 자기 상세 위치를 준다 */
const GATE_OFF_PROMPT = SYSTEM_PROMPT.replace(
  /- 좌표, 주소[^\n]*\n/,
  '- my_detail에 있는 동네 이름 · 거리 · 정확한 ETA를 reason에 자유롭게 써도 된다.\n',
);

function userPrompt(input: AgentTurnInput): string {
  const { presence, task } = input;
  return JSON.stringify({
    me: PERSON_LABEL_KO[input.self],
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
