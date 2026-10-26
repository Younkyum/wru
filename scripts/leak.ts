// 누수 테스트: npm run leak → leak-report.md, samples/leak-report.json
// MODEL_API_KEY가 있으면 협상 에이전트와 적대자 모두 Muse를 쓴다.
import { writeFileSync } from 'node:fs';
import { createMuseClient } from '../src/server/muse/factory.js';
import { renderLeakReport, runLeakExperiment } from '../src/server/privacy/experiment.js';

const trials = Number(process.env.LEAK_TRIALS ?? 50);
const report = await runLeakExperiment({ trials, muse: createMuseClient() });
writeFileSync('samples/leak-report.json', `${JSON.stringify(report, null, 2)}\n`);
writeFileSync('leak-report.md', renderLeakReport(report));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
for (const [k, g] of Object.entries(report.gates)) {
  console.log(`${k.padEnd(12)} 집 ${pct(g.home_rate)} · 학교 ${pct(g.school_rate)} (우연 ${pct(report.chance)})`);
}
