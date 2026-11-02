import { useCallback, useEffect, useState } from 'react';
import type { DemoState } from '../shared/contracts';
import type { LeakReport } from '../shared/leak-report';
import { api } from './client';
import { DemoPage, type DemoView, type VideoOverlay } from './DemoPage';
import { DEMO_STEPS, type StepAction } from './demoSteps';
import type { BoundaryMatrix } from '../shared/boundary';
import type { MuseTurnView } from '../shared/muse-turn';

const HERO_TASK_ID = 't_pickup_milk_001';
/** 협상 메시지 간격. 영상 녹화는 ?reveal=ms로 내레이션에 맞춘다 */
const REVEAL_MS = Number(new URLSearchParams(window.location.search).get('reveal')) || 700;

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
  const [video, setVideo] = useState<VideoOverlay>({ caption: null, scene: null });
  // 영상 모드: 1440×900 녹화에서 1280×800 레이아웃으로 보이게 키운다
  useEffect(() => {
    if (videoMode) document.documentElement.style.setProperty('zoom', '1.125');
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
    if (reveal === null || reveal >= total) return;
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
      busy: busy || (reveal !== null && reveal < total),
      museShow: () => setMuseShown(true),
      approve: async () => {
        const id = state?.negotiations.at(-1)?.negotiation_id;
        if (id) await run(() => api.approve(id));
      },
      caption: (text: string | null) => setVideo((v) => ({ ...v, caption: text })),
      scene: (scene: VideoOverlay['scene']) => setVideo((v) => ({ ...v, scene })),
    };
  });

  if (!state) return <div className="loading">{error ? `서버에 연결할 수 없어요: ${error}` : '불러오는 중…'}</div>;

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
          busy: busy || (reveal !== null && reveal < total),
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
      onNegotiate={(taskId) => void run(() => api.negotiate(taskId))}
      onApprove={(id) => void run(() => api.approve(id))}
    />
  );
}
