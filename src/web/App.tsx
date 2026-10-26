import { useCallback, useEffect, useState } from 'react';
import type { DemoState } from '../shared/contracts';
import { api } from './client';
import { DemoPage } from './DemoPage';

export function App() {
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    try {
      await action();
      setState(await api.state());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

  if (!state) return <div className="loading">{error ? `서버에 연결할 수 없어요: ${error}` : '불러오는 중…'}</div>;

  return (
    <DemoPage
      state={state}
      playing={playing}
      error={error}
      onAdvance={(m) => void run(() => api.advance(m))}
      onReset={() => {
        setPlaying(false);
        void run(api.reset);
      }}
      onTogglePlay={() => setPlaying((p) => !p)}
      onSubmitHeroTask={() => void run(api.submitHeroTask)}
      onNegotiate={(taskId) => void run(() => api.negotiate(taskId))}
      onApprove={(id) => void run(() => api.approve(id))}
    />
  );
}
