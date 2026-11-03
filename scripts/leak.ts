// 누수 테스트: npm run leak → leak-report.md, samples/leak-report.json
// MODEL_API_KEY가 있으면 협상 에이전트와 적대자 모두 Muse를 쓴다.
// 실제 Muse일 때 상한: MUSE_MAX_CALLS (기본 3000), MUSE_MAX_USD (기본 15), 동시 시나리오 LEAK_CONCURRENCY (기본 6).
import { writeFileSync } from 'node:fs';
import { estimateUsd } from '../src/server/muse/client.js';
import { createMuseClient } from '../src/server/muse/factory.js';
import { MetaMuse } from '../src/server/muse/meta.js';
import { renderLeakReport, runLeakExperiment } from '../src/server/privacy/experiment.js';
import { loadEnv } from './lib/env.js';

loadEnv();
const live = !!process.env.MODEL_API_KEY;
if (live) {
  process.env.MUSE_MAX_CALLS ??= '3000';
  process.env.MUSE_MAX_USD ??= '15';
}
const trials = Number(process.env.LEAK_TRIALS ?? 50);
const muse = createMuseClient();
if (muse instanceof MetaMuse) {
  console.log(`[leak] real Muse (${muse.model}) · ${trials} trials × 3 conditions · cap ${process.env.MUSE_MAX_CALLS} calls / $${process.env.MUSE_MAX_USD}`);
}
const report = await runLeakExperiment({ trials, muse, concurrency: Number(process.env.LEAK_CONCURRENCY ?? (live ? 6 : 1)) });
writeFileSync('samples/leak-report.json', `${JSON.stringify(report, null, 2)}\n`);
writeFileSync('leak-report.md', renderLeakReport(report));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
for (const [k, g] of Object.entries(report.gates)) {
  console.log(`${k.padEnd(12)} home ${pct(g.home_rate)} · school ${pct(g.school_rate)} · bound ${pct(g.bound_home_rate)}/${pct(g.bound_school_rate)} · ${g.distinct_logs} logs · rewritten/fallback ${g.filtered}/${g.messages} msgs (chance ${pct(report.chance)})`);
}
if (muse instanceof MetaMuse) {
  const u = muse.usage;
  console.log(`[leak] calls ${u.calls} · tokens in ${u.prompt_tokens} / out ${u.completion_tokens} · est. $${estimateUsd(u).toFixed(2)}${muse.lastError ? ` · last fallback: ${muse.lastError}` : ''}`);
}
