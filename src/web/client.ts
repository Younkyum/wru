import type { DemoState, Task } from '../shared/contracts';
import type { NegotiationRecord } from '../shared/negotiation';
import type { LeakReport } from '../shared/leak-report';
import type { BoundaryMatrix } from '../shared/boundary';
import type { MuseTurnView } from '../shared/muse-turn';

/**
 * 서버에 WRU_ADMIN_TOKEN이 설정돼 있으면 /demo#key=<토큰>으로 한 번 열면 된다.
 * 토큰은 이 탭의 sessionStorage에만 두고 주소창에서는 지운다.
 */
function adminToken(): string | null {
  try {
    const m = /(?:^|&)key=([^&]+)/.exec(window.location.hash.slice(1));
    if (m) {
      sessionStorage.setItem('wru_admin', decodeURIComponent(m[1]!));
      window.history.replaceState(null, '', window.location.pathname);
    }
    return sessionStorage.getItem('wru_admin');
  } catch {
    return null;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const key = adminToken();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}), ...init?.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export const api = {
  state: () => call<DemoState>('/state'),
  advance: (minutes: number) => call<DemoState>('/sim/advance', { method: 'POST', body: JSON.stringify({ minutes }) }),
  reset: () => call<DemoState>('/sim/reset', { method: 'POST' }),
  submitHeroTask: () => call<Task>('/tasks/hero', { method: 'POST' }),
  negotiate: (taskId: string) => call<NegotiationRecord>(`/tasks/${taskId}/negotiate`, { method: 'POST' }),
  leakReport: () => call<LeakReport>('/leak-report'),
  boundary: () => call<BoundaryMatrix>('/demo/boundary'),
  museTurn: () => call<MuseTurnView>('/demo/muse-turn?person=dad'),
  approve: (negotiationId: string) => call<NegotiationRecord>(`/negotiations/${negotiationId}/approve`, { method: 'POST' }),
};
