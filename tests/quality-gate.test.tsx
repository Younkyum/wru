// 품질 게이트: 응답 · 로그 · UI · 샘플 · 리포트 전부에서 위치 단서(lat/lng, 도로명, 학교 고유명, 지명 등) 0건
import { readdirSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PERSON_IDS } from '../src/shared/contracts';
import { findPlaceWords, normalize } from '../src/server/privacy/filter';
import type { MuseClient } from '../src/server/muse/client';
import { decideMock } from '../src/server/muse/mock';
import { DemoPage } from '../src/web/DemoPage';
import { leaks, makeApp, req } from './helpers';

const noop = () => {};

function scan(text: string): string[] {
  return [...leaks(text), ...findPlaceWords(text).map((w) => `지명: ${w}`)];
}

describe('품질 게이트', () => {
  // 위치를 말하려는 에이전트 + 위치가 든 라벨까지 넣어 봐도 바깥으로는 0건이어야 한다
  const leakyMuse: MuseClient = {
    kind: 'meta',
    decide: async (input) => {
      const a = decideMock(input);
      const reason = ['지금 망원동 지나는 중, 집까지 3.2km', '합정역에서 내려요', '테헤란로 152 근처', '대치초 앞', '망 원 동 근처'][input.round % 5]!;
      return { action: a.type === 'offer' || a.type === 'counter' ? { ...a, reason } : a };
    },
  };

  it('API 응답 · 이벤트 로그 · UI 렌더', async () => {
    const app = makeApp({ muse: leakyMuse });
    const outputs: string[] = [];
    const hit = async (method: string, path: string, body?: unknown) => {
      const res = await req(app, method, path, body);
      outputs.push(res.text);
      return res;
    };
    for (const label of ['민아 픽업 (망원동 쪽)', '대치초등학교 픽업', '합정역 픽업']) {
      const dirty = await req(app, 'POST', '/api/tasks', { deadline: '18:00', subtasks: [{ id: 'pickup', label }] });
      expect(dirty.status).toBe(400);
      outputs.push(dirty.text);
    }
    await hit('POST', '/api/tasks/hero');
    await hit('POST', '/api/tasks/t_pickup_milk_001/negotiate');
    await hit('POST', '/api/negotiations/n_001/approve');
    for (const id of PERSON_IDS) {
      await hit('GET', `/api/presence/${id}?include=raw_coords`);
      await hit('GET', `/api/presence/${id}/address`);
    }
    for (const minutes of [10, 10, 5]) {
      await hit('POST', '/api/sim/advance', { minutes });
      await hit('POST', '/api/tasks/t_pickup_milk_001/negotiate');
    }
    const report = await hit('GET', '/api/leak-report');
    const state = await hit('GET', '/api/state');
    outputs.push(
      renderToStaticMarkup(
        <DemoPage
          state={state.json}
          playing={false}
          error={null}
          onAdvance={noop}
          onReset={noop}
          onTogglePlay={noop}
          onSubmitHeroTask={noop}
          onNegotiate={noop}
          onApprove={noop}
          report={report.json}
          onShowReport={noop}
        />,
      ),
    );
    expect(state.json.log.length).toBeGreaterThan(5);
    expect(outputs.flatMap(scan)).toEqual([]);
    const all = normalize(outputs.join('\n'));
    for (const token of ['망원', '합정', '테헤란', '대치', '3.2']) expect(all).not.toContain(token);
  });

  it('samples/ · leak-report.md · docs 화면 문구', () => {
    const files = [
      ...readdirSync('samples').map((f) => `samples/${f}`),
      'leak-report.md',
    ];
    for (const f of files) expect([f, scan(readFileSync(f, 'utf8'))]).toEqual([f, []]);
  });
});
