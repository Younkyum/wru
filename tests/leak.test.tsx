import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PERSON_IDS } from '../src/shared/contracts';
import { DemoPage } from '../src/web/DemoPage';
import { leaks, makeApp, req } from './helpers';

const noop = () => {};

function render(state: any) {
  return renderToStaticMarkup(
    <DemoPage
      state={state}
      playing={false}
      error={null}
      onAdvance={noop}
      onReset={noop}
      onTogglePlay={noop}
      onSubmitHeroTask={noop}
      onNegotiate={noop}
      onApprove={noop}
      report={null}
      onShowReport={noop}
    />,
  );
}

describe('누수 가드', () => {
  it('누수 패턴 자체가 위치를 잡아낸다 (가드의 가드)', () => {
    expect(leaks('테헤란로 152')).not.toHaveLength(0);
    expect(leaks('서울대치초등학교 앞')).not.toHaveLength(0);
    expect(leaks('집까지 3.2km')).not.toHaveLength(0);
    expect(leaks('{"lat":37.5665,"lng":126.978}')).not.toHaveLength(0);
    expect(leaks('37.5665, 126.9780')).not.toHaveLength(0);
    expect(leaks('{"raw_coords":[1,2]}')).not.toHaveLength(0);
    expect(leaks('{"state":"home","updated_at":"2026-10-26T17:30:00+09:00"}')).toEqual([]);
  });

  it('시뮬 70분 동안 모든 API 응답과 UI 렌더에 좌표가 0건', async () => {
    const app = makeApp();
    const outputs: string[] = [];
    const collect = async (method: string, path: string, body?: unknown) => {
      const res = await req(app, method, path, body);
      outputs.push(res.text);
      return res;
    };

    await collect('POST', '/api/tasks/hero');
    await collect('POST', '/api/tasks/t_pickup_milk_001/negotiate');
    await collect('POST', '/api/negotiations/n_001/approve');
    await collect('POST', '/api/tasks', { deadline: '19:00', subtasks: [{ id: 'trash', label: '분리수거' }] });
    for (let minute = 0; minute <= 70; minute += 1) {
      for (const id of PERSON_IDS) {
        await collect('GET', `/api/presence/${id}`);
        await collect('GET', `/api/eta/${id}`);
        await collect('GET', `/api/presence/${id}?include=raw_coords`);
        await collect('GET', `/api/presence/${id}/coords`);
      }
      await collect('GET', '/api/presence');
      await collect('GET', '/api/tasks');
      const state = await collect('GET', '/api/state');
      outputs.push(render(state.json));
      if (minute % 10 === 5) await collect('POST', '/api/tasks/t_pickup_milk_001/negotiate');
      await collect('POST', '/api/sim/advance', { minutes: 1 });
    }
    await collect('POST', '/api/sim/reset');

    const hits = outputs.flatMap(leaks);
    expect(hits).toEqual([]);
    expect(outputs.length).toBeGreaterThan(1000);
  });

  it('UI 렌더에는 상태 배지와 ETA만 있다', async () => {
    const app = makeApp();
    const state = await req(app, 'GET', '/api/state');
    const html = render(state.json);
    expect(html).toContain('이동 중');
    expect(html).toContain('집 근처');
    expect(html).toContain('약 20분');
    expect(leaks(html)).toEqual([]);
  });
});
