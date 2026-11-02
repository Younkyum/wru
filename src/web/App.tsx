import { useCallback, useEffect, useState } from 'react';
import type { DemoState } from '../shared/contracts';
import type { LeakReport } from '../shared/leak-report';
import { api } from './client';
import { DemoPage, type DemoView, type VideoOverlay } from './DemoPage';
import { DEMO_STEPS, type StepAction } from './demoSteps';
import type { BoundaryMatrix } from '../shared/boundary';
import type { MuseTurnView } from '../shared/muse-turn';

const HERO_TASK_ID = 't_pickup_milk_001';
/** 협상 메시지 간격. 영상 녹화(?reveal=manual)는 스크립트가 문장마다 직접 펼친다 */
const MANUAL_REVEAL = new URLSearchParams(window.location.search).get('reveal') === 'manual';
const REVEAL_MS = 700;

/** 요소 위 한 점을 커서 좌표로 (.cam 안의 좌표). 페이지 zoom과 카메라 확대를 rect 비율로 한 번에 되돌린다 */
function cursorAt(el: HTMLElement, fx: number, fy: number): { x: number; y: number } {
  const cam = document.querySelector<HTMLElement>('.cam');
  const c = cam?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);
  const k = cam ? c.width / cam.offsetWidth : 1;
  const r = el.getBoundingClientRect();
  const x = r.left + Math.min(r.width * fx, r.width - 12, 260);
  const y = r.top + Math.min(r.height * fy, r.height - 6);
  return { x: (x - c.left) / k, y: (y - c.top) / k };
}

/** 설명 중인 요소를 가리킬 때: 글자를 덮지 않게 요소 왼쪽 바깥에서 가리킨다 */
function pointerBeside(el: HTMLElement): { x: number; y: number } {
  const p = cursorAt(el, 0, 0);
  const cam = document.querySelector<HTMLElement>('.cam');
  const k = cam ? cam.getBoundingClientRect().width / cam.offsetWidth : 1;
  const h = el.getBoundingClientRect().height / k;
  const w = el.getBoundingClientRect().width / k;
  // 왼쪽에 자리가 없으면(맨 왼쪽 폰) 요소 아래쪽 가운데를 가리킨다
  if (p.x < 60) return { x: p.x + w / 2, y: p.y + h * 0.8 };
  return { x: p.x - 38, y: p.y + Math.min(h / 2, 40) };
}

export function App() {
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [report, setReport] = useState<LeakReport | null>(null);
  const [demoStep, setDemoStep] = useState<number | null>(null);
  const [reveal, setReveal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [boundary, setBoundary] = useState<BoundaryMatrix | null>(null);
  const [museTurn, setMuseTurn] = useState<MuseTurnView | null>(null);
  // 영상에서는 요청을 먼저 보여 주고, 내레이션에 맞춰 응답을 펼친다
  const [museShown, setMuseShown] = useState(!new URLSearchParams(window.location.search).has('video'));
  const videoMode = new URLSearchParams(window.location.search).has('video');
  const [video, setVideo] = useState<VideoOverlay>({ caption: null, scene: null, hl: null, chapter: null, cursor: null });
  // 영상 모드: 1440×900 녹화에서 1280×800 레이아웃으로 보이게 키운다
  useEffect(() => {
    if (videoMode) document.documentElement.style.setProperty('zoom', '1.4');
  }, [videoMode]);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    try {
      await action();
      const next = await api.state();
      setState(next);
      setError(null);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  useEffect(() => {
    if (window.location.pathname === '/') window.history.replaceState(null, '', '/demo');
    void run(async () => setBoundary(await api.boundary()));
  }, [run]);

  // 재생 중이면 실제 1초마다 시뮬 1분
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => void run(() => api.advance(1)), 1000);
    return () => clearInterval(timer);
  }, [playing, run]);

  // 협상 컷: 메시지를 하나씩 보여 준다
  const total = state?.negotiations.at(-1)?.messages.length ?? 0;
  useEffect(() => {
    if (MANUAL_REVEAL || reveal === null || reveal >= total) return;
    const timer = setTimeout(() => setReveal(reveal + 1), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [reveal, total]);

  // 데모 컷이 바뀌면 화면 맨 위로 (한 화면에 다 들어온다)
  useEffect(() => {
    if (demoStep === null) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [demoStep]);

  const actions: Record<StepAction, () => Promise<unknown>> = {
    reset: async () => {
      setPlaying(false);
      setReport(null);
      setMuseTurn(null);
      await api.reset();
      setBoundary(await api.boundary());
    },
    boundary: async () => setBoundary(await api.boundary()),
    task: api.submitHeroTask,
    negotiate: () => api.negotiate(HERO_TASK_ID),
    muse: async () => setMuseTurn(await api.museTurn()),
    leak: async () => setReport(await api.leakReport()),
    none: async () => {},
  };

  const goTo = async (step: number) => {
    setBusy(true);
    const ok = await run(actions[DEMO_STEPS[step]!.action]);
    // API가 실패하면 컷을 넘기지 않는다 (에러는 화면 위에 표시)
    if (ok) {
      setReveal(DEMO_STEPS[step]!.action === 'negotiate' ? 0 : null);
      setDemoStep(step);
    }
    setBusy(false);
  };

  // 영상 녹화 스크립트(scripts/video)가 컷을 넘길 때 쓴다
  useEffect(() => {
    const w = window as unknown as { __wru?: Record<string, unknown> };
    w.__wru = {
      ...w.__wru,
      start: () => goTo(0),
      next: () => (demoStep === null ? goTo(0) : goTo(demoStep + 1)),
      step: demoStep,
      busy: busy || (!MANUAL_REVEAL && reveal !== null && reveal < total),
      museShow: () => setMuseShown(true),
      revealTo: (n: number) => setReveal(n),
      highlight: (key: string | null, hover = true) => {
        setVideo((v) => ({ ...v, hl: key }));
        // 강조 대상이 패널 밖에 있으면 실제 스크롤처럼 보이게 끌어온다
        setTimeout(() => {
          const el = document.querySelector<HTMLElement>('.hl-on');
          // 누수 카드는 카드 머리가 패널 위에 오도록 맞춘다 (카드가 반쯤 잘리지 않게)
          const card = el?.closest<HTMLElement>('.leak-card');
          (card ?? el)?.scrollIntoView({ block: card ? 'start' : 'center', behavior: 'smooth' });
          // 설명하는 곳에 커서를 올려 둔다 (발표자가 가리키듯)
          if (el && hover) setTimeout(() => setVideo((v) => ({ ...v, cursor: { ...pointerBeside(el), down: false } })), 550);
        }, 60);
      },
      chapter: (name: string | null) => setVideo((v) => ({ ...v, chapter: name })),
      camera: (target: 'panel' | null) => setVideo((v) => ({ ...v, camera: target })),
      reset: () => run(async () => {
        setReport(null);
        setMuseTurn(null);
        setReveal(null);
        await api.reset();
        // 토큰 경계는 영상 안에서 버튼을 눌러 직접 보낸다
        setBoundary(null);
      }),
      /** 녹화용: 커서를 버튼으로 옮기고 눌렀다 뗀 뒤 실제로 클릭한다 */
      clickTarget: async (key: string) => {
        const el = document.querySelector<HTMLElement>(`[data-demo="${key}"]`);
        if (!el) throw new Error(`no demo target: ${key}`);
        setVideo((v) => ({ ...v, cursor: { ...cursorAt(el, 0.6, 0.55), down: false } }));
        await new Promise((res) => setTimeout(res, 600));
        setVideo((v) => ({ ...v, cursor: v.cursor && { ...v.cursor, down: true } }));
        await new Promise((res) => setTimeout(res, 160));
        el.click();
        setVideo((v) => ({ ...v, cursor: v.cursor && { ...v.cursor, down: false } }));
        // 누른 뒤에는 결과를 가리지 않게 살짝 비켜난다
        await new Promise((res) => setTimeout(res, 250));
        setVideo((v) => ({ ...v, cursor: v.cursor && { x: v.cursor.x + 36, y: v.cursor.y + 48, down: false } }));
      },
      approve: async () => {
        const id = state?.negotiations.at(-1)?.negotiation_id;
        if (id) await run(() => api.approve(id));
      },
      caption: (text: string | null) => setVideo((v) => ({ ...v, caption: text })),
      scene: (scene: VideoOverlay['scene']) => setVideo((v) => ({ ...v, scene })),
    };
  });

  if (!state) return <div className="loading">{error ? `Cannot reach the server: ${error}` : 'Loading…'}</div>;

  const step = demoStep === null ? null : DEMO_STEPS[demoStep]!;
  const demo: DemoView | null =
    step && demoStep !== null
      ? {
          step: demoStep,
          total: DEMO_STEPS.length,
          title: step.title,
          caption: step.caption({ state, report }),
          focus: step.focus,
          reveal,
          conditions: step.conditions ?? ['off', 'filter_only', 'on'],
          busy: busy || (!MANUAL_REVEAL && reveal !== null && reveal < total),
          onNext: () => void goTo(demoStep + 1),
          onExit: () => {
            setDemoStep(null);
            setReveal(null);
          },
        }
      : null;

  return (
    <DemoPage
      state={state}
      playing={playing}
      error={error}
      demo={demo}
      video={videoMode ? video : null}
      onStartDemo={() => void goTo(0)}
      onAdvance={(m) => void run(() => api.advance(m))}
      report={report}
      boundary={boundary}
      museTurn={museTurn}
      onShowMuse={() => void run(async () => setMuseTurn(await api.museTurn()))}
      reveal={demoStep === null ? reveal : undefined}
      museShown={museShown}
      onShowBoundary={() => void run(async () => setBoundary(await api.boundary()))}
      onShowReport={() => void run(async () => setReport(await api.leakReport()))}
      onReset={() => {
        setPlaying(false);
        setReport(null);
        void run(api.reset);
      }}
      onTogglePlay={() => setPlaying((p) => !p)}
      onSubmitHeroTask={() => void run(api.submitHeroTask)}
      onNegotiate={(taskId) =>
        void run(async () => {
          await api.negotiate(taskId);
          // 영상 녹화는 메시지를 문장마다 펼친다
          if (MANUAL_REVEAL) setReveal(0);
        })
      }
      onApprove={(id) => void run(() => api.approve(id))}
    />
  );
}
