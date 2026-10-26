// 품질 게이트: 응답 · 로그 · UI · 샘플 · 리포트 전부에서 위치 단서(lat/lng, 도로명, 학교 고유명, 지명 등) 0건
import { readdirSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PERSON_IDS } from '../src/shared/contracts';
import { findPlaceWords } from '../src/server/privacy/filter';
import { DemoPage } from '../src/web/DemoPage';
import { leaks, makeApp, req } from './helpers';

const noop = () => {};

function scan(text: string): string[] {
  return [...leaks(text), ...findPlaceWords(text).map((w) => `지명: ${w}`)];
}

describe('품질 게이트', () => {
  it('API 응답 · 이벤트 로그 · UI 렌더', async () => {
    const app = makeApp();
    const outputs: string[] = [];
    const hit = async (method: string, path: string, body?: unknown) => {
      const res = await req(app, method, path, body);
      outputs.push(res.text);
      return res;
    };
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
  });

  it('samples/ · leak-report.md · docs 화면 문구', () => {
    const files = [
      ...readdirSync('samples').map((f) => `samples/${f}`),
      'leak-report.md',
    ];
    for (const f of files) expect([f, scan(readFileSync(f, 'utf8'))]).toEqual([f, []]);
  });
});
