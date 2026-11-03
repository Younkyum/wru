// 키가 들어온 뒤 한 번에: npm run muse:real
// 1) muse:smoke  2) 실제 Muse로 누수 테스트 (적대자도 Muse)  3) 이전 수치와 비교 + 고쳐야 할 문구 목록  4) 테스트
// 영상 재렌더(npm run video)는 문구를 고친 다음에 따로 한다. docs/REAL_MUSE.md 참고.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { LeakReport } from '../src/shared/leak-report.js';
import { loadEnv } from './lib/env.js';

loadEnv();

function step(title: string, args: string[], env: Record<string, string> = {}): number {
  console.log(`\n=== ${title}: npm ${args.join(' ')}`);
  return spawnSync('npm', args, { stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;
}

const smoke = step('1/4 smoke', ['run', 'muse:smoke']);
if (smoke !== 0) {
  console.log(smoke === 2 ? '\n키가 없어 멈춥니다.' : '\n스모크가 실패해서 누수 테스트를 돌리지 않습니다 (비용을 쓰지 않음).');
  process.exit(smoke);
}

const before = JSON.parse(execFileSync('git', ['show', 'HEAD:samples/leak-report.json'], { encoding: 'utf8' })) as LeakReport;
if (step('2/4 leak (real Muse)', ['run', 'leak']) !== 0) process.exit(1);
const after = JSON.parse(readFileSync('samples/leak-report.json', 'utf8')) as LeakReport;

console.log('\n=== 3/4 수치 비교 (mock → 실제 Muse)');
const pct = (v: number) => `${Math.round(v * 100)}%`;
console.log(`negotiating agents: ${before.muse} → ${after.muse} · attacker: ${before.adversary} → ${after.adversary}`);
for (const k of Object.keys(after.gates) as (keyof LeakReport['gates'])[]) {
  const [b, a] = [before.gates[k], after.gates[k]];
  console.log(
    `${k.padEnd(12)} home ${pct(b.home_rate)} → ${pct(a.home_rate)} · school ${pct(b.school_rate)} → ${pct(a.school_rate)} · ceiling ${pct(b.bound_home_rate)} → ${pct(a.bound_home_rate)} · logs ${b.distinct_logs} → ${a.distinct_logs}`,
  );
}
console.log(`
고칠 곳 (수치가 바뀌었거나 mock 고지를 내려야 하는 곳):
  - scripts/video/narration.ts  muse 구간 "a mock ... stands in for Muse Spark", leak 구간의 98 / 22 / 6 / 4 percent, outro
  - src/web/DemoPage.tsx        Muse 패널 mock 문구, 아웃트로 카드
  - README.md 한계 절 · docs/SUBMISSION.md · docs/COPY.md · docs/VIDEO_SCRIPT.md
  그다음: npm test → npm run video`);

process.exit(step('4/4 tests (문서 수치가 리포트와 다르면 여기서 실패)', ['test']));
