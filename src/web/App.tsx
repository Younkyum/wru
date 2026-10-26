import { useCallback, useEffect, useState } from 'react';
import type { DemoState } from '../shared/contracts';
import type { LeakReport } from '../shared/leak-report';
import { api } from './client';
import { DemoPage, type DemoView } from './DemoPage';
import { DEMO_STEPS } from './demoSteps';

const HERO_TASK_ID = 't_pickup_milk_001';
const NEGOTIATION_STEP = 2;
const REVEAL_MS = 700;

export function App() {
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [report, setReport] = useState<LeakReport | null>(null);
  const [demoStep, setDemoStep] = useState<number | null>(null);
  const [reveal, setReveal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

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
    void run(async () => {});
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

  /** 데모 컷마다 하는 일 (0: 리셋, 1: 태스크 투입, 2: 협상, 3: 승인, 4: 누수 리포트) */
  const goTo = async (step: number) => {
    setBusy(true);
    const actions: (() => Promise<unknown>)[] = [
      async () => {
        setPlaying(false);
        setReport(null);
        await api.reset();
      },
      api.submitHeroTask,
      () => api.negotiate(HERO_TASK_ID),
      async () => {
        const id = state?.negotiations.at(-1)?.negotiation_id;
        if (id) await api.approve(id);
      },
      async () => setReport(await api.leakReport()),
      async () => {},
    ];
    const ok = await run(actions[step]!);
    // API가 실패하면 컷을 넘기지 않는다 (에러는 화면 위에 표시)
    if (ok) {
      setReveal(step === NEGOTIATION_STEP ? 0 : null);
      setDemoStep(step);
    }
    setBusy(false);
  };

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
          conditions: demoStep === 4 ? ['on'] : ['off', 'filter_only', 'on'],
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
      onStartDemo={() => void goTo(0)}
      onAdvance={(m) => void run(() => api.advance(m))}
      report={report}
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
