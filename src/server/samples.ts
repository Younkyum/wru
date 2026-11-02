// 히어로 시나리오 협상 샘플 (mock Muse, 17:30 기준). 결정론적이라 테스트로 고정 비교한다.

import { createApp } from './app.js';
import { MockMuse } from './muse/mock.js';

export const SAMPLE_DATE = '2026-10-26';

export async function heroSample() {
  const app = createApp({ sim: { date: SAMPLE_DATE }, muse: new MockMuse() });
  await app.request('/api/tasks/hero', { method: 'POST' });
  const res = await app.request('/api/tasks/t_pickup_milk_001/negotiate', { method: 'POST' });
  const record = await res.json();
  const state = (await (await app.request('/api/state')).json()) as { presence: unknown; tasks: unknown[] };
  return { scenario: '17:30 · Pick up Mina + buy milk by 18:00', presence: state.presence, task: state.tasks[0], negotiation: record };
}
