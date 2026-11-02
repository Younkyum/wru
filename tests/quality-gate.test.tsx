// 품질 게이트: 응답 · 로그 · UI · 샘플 · 리포트 전부에서 위치 단서(lat/lng, 도로명, 학교 고유명, 지명 등) 0건
import { readdirSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PERSON_IDS } from '../src/shared/contracts';
import { findPlaceWords, normalize } from '../src/server/privacy/filter';
import type { MuseClient } from '../src/server/muse/client';
import { decideMock } from '../src/server/muse/mock';
import { DemoPage } from '../src/web/DemoPage';
import { DEMO_STEPS } from '../src/web/demoSteps';
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

  it('데모 모드 7컷 렌더 (캡션 · 토큰 경계표 · 영상 자막 포함)', async () => {
    const app = makeApp();
    await req(app, 'POST', '/api/tasks/hero');
    await req(app, 'POST', '/api/tasks/t_pickup_milk_001/negotiate');
    await req(app, 'POST', '/api/negotiations/n_001/approve');
    const state = (await req(app, 'GET', '/api/state')).json;
    const report = (await req(app, 'GET', '/api/leak-report')).json;
    expect(DEMO_STEPS).toHaveLength(7);
    const boundary = (await req(app, 'GET', '/api/demo/boundary')).json;
    const museTurn = (await req(app, 'GET', '/api/demo/muse-turn')).json;
    DEMO_STEPS.forEach((step, i) => {
      const html = renderToStaticMarkup(
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
          report={report}
          onShowReport={noop}
          boundary={boundary}
          museTurn={museTurn}
          video={{ caption: step.title, scene: i === 0 ? 'intro' : i === DEMO_STEPS.length - 1 ? 'outro' : null, hl: i % 2 ? 'bound' : 'dad', chapter: step.title, cursor: { x: 10, y: 10, down: i % 2 === 0 } }}
          demo={{
            step: i,
            total: DEMO_STEPS.length,
            title: step.title,
            caption: step.caption({ state, report }),
            focus: step.focus,
            reveal: null,
            conditions: ['off', 'filter_only', 'on'],
            busy: false,
            onNext: noop,
            onExit: noop,
          }}
        />,
      );
      expect(html).toContain(step.title);
      if (step.focus === 'boundary') expect(html).toContain('403 denied');
      if (step.focus === 'muse') expect(html).toContain('response_format');
      expect(scan(html)).toEqual([]);
    });
    expect(DEMO_STEPS.find((d) => d.focus === 'roles')!.caption({ state, report })).toContain('Dad = Pick up Mina, Brother = Buy milk');
  });

  // README는 검사 규칙(lat/lng 등)을 설명하느라 그 단어를 쓰므로 뺀다
  it('samples/ · leak-report.md · docs 문서', () => {
    const files = [
      ...readdirSync('samples').map((f) => `samples/${f}`),
      'leak-report.md',
      ...readdirSync('docs').filter((f) => f.endsWith('.md') && f !== 'PLAN.md').map((f) => `docs/${f}`),
    ];
    for (const f of files) expect([f, scan(readFileSync(f, 'utf8'))]).toEqual([f, []]);
  });
});

describe('제출 문서 수치', () => {
  it('README · SUBMISSION · COPY · VIDEO_SCRIPT의 누수 수치가 리포트와 같다', () => {
    const r = JSON.parse(readFileSync('samples/leak-report.json', 'utf8'));
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const expected = [pct(r.gates.on.home_rate), pct(r.gates.on.school_rate), pct(r.gates.off.home_rate), pct(r.gates.off.school_rate), pct(r.chance)];
    for (const f of ['README.md', 'docs/SUBMISSION.md', 'docs/COPY.md', 'docs/VIDEO_SCRIPT.md']) {
      const text = readFileSync(f, 'utf8');
      for (const v of expected) expect([f, text.includes(v)]).toEqual([f, true]);
    }
  });
});

describe('영상 대본', () => {
  it('docs/VIDEO_SCRIPT.md의 내레이션은 scripts/video/narration.ts와 같고, 위치 단서가 없다', async () => {
    const { SEGMENTS, captionText } = await import('../scripts/video/narration');
    const doc = readFileSync('docs/VIDEO_SCRIPT.md', 'utf8');
    for (const seg of SEGMENTS) {
      for (const { text } of seg.lines) {
        expect([seg.id, doc.includes(text)]).toEqual([seg.id, true]);
        expect(scan(captionText(text))).toEqual([]);
      }
    }
    // 커서가 누를 버튼은 화면에 실제로 있는 data-demo 값이어야 한다
    const page = readFileSync('src/web/DemoPage.tsx', 'utf8');
    const clicks = SEGMENTS.flatMap((s) => s.lines.flatMap((l) => (l.click ? [l.click] : [])));
    expect(clicks.length).toBeGreaterThan(4);
    for (const key of clicks) expect([key, page.includes(`data-demo="${key}"`)]).toEqual([key, true]);
  });
});
