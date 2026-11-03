// 실제 Muse 히어로 협상 기록: npm run muse:hero → samples/negotiation-hero-muse.json
// 영상(npm run video)은 이 기록을 재생한다. 실제 Muse는 협상 한 번에 수십 초가 걸리고 실행마다 문장이 달라서다.
// 템플릿 대체가 한 번이라도 있으면 저장하지 않는다 (MUSE_HERO_ALLOW_FALLBACK=1로 무시).
import { writeFileSync } from 'node:fs';
import { PERSON_LABEL } from '../src/shared/contracts.js';
import { createApp } from '../src/server/app.js';
import { DEFAULT_BASE_URL, estimateUsd, providerOf, type MuseClient } from '../src/server/muse/client.js';
import { createMuseClient } from '../src/server/muse/factory.js';
import { MetaMuse } from '../src/server/muse/meta.js';
import { SAMPLE_DATE } from '../src/server/samples.js';
import { loadEnv } from './lib/env.js';

loadEnv();
const real = createMuseClient();
if (!(real instanceof MetaMuse)) {
  console.log('[muse:hero] MODEL_API_KEY가 없습니다.');
  process.exit(2);
}
let fallbacks = 0;
const counted: MuseClient = {
  kind: 'meta',
  decide: async (input) => {
    const d = await real.decide(input);
    if (d.fallback) fallbacks += 1;
    return d;
  },
};
const app = createApp({ sim: { date: SAMPLE_DATE }, muse: counted });
await app.request('/api/tasks/hero', { method: 'POST' });
const negotiation = (await (await app.request('/api/tasks/t_pickup_milk_001/negotiate', { method: 'POST' })).json()) as {
  outcome: string;
  messages: { round: number; from: keyof typeof PERSON_LABEL; type: string; subtask_id?: string; reason?: string }[];
  assignment: { assignments: { person: keyof typeof PERSON_LABEL; subtask: string }[] };
  tool_calls?: { from: string; person_id: string | null; status: number }[];
};
const provider = providerOf(process.env.MODEL_API_BASE_URL || DEFAULT_BASE_URL);
for (const m of negotiation.messages) console.log(`  r${m.round} ${PERSON_LABEL[m.from]}: ${m.type} ${m.subtask_id ?? ''}${m.reason ? ` "${m.reason}"` : ''}`);
const roles = negotiation.assignment.assignments.map((a) => `${PERSON_LABEL[a.person]}=${a.subtask}`).join(', ');
console.log(`[muse:hero] ${provider} ${real.model} · ${negotiation.outcome} → ${roles} · fallbacks ${fallbacks} · tool calls ${negotiation.tool_calls?.length ?? 0} · ${real.usage.calls} calls · $${estimateUsd(real.usage).toFixed(4)}`);
if (fallbacks > 0 && !process.env.MUSE_HERO_ALLOW_FALLBACK) {
  console.log(`[muse:hero] 템플릿 대체가 있어 저장하지 않습니다 (${real.lastError})`);
  process.exit(1);
}
writeFileSync(
  'samples/negotiation-hero-muse.json',
  `${JSON.stringify({ recorded_at: new Date().toISOString().slice(0, 19) + "Z", provider, model: real.model, fallbacks, usage: real.usage, negotiation }, null, 2)}\n`,
);
console.log('samples/negotiation-hero-muse.json 저장');
