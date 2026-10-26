import type { DemoState, Task } from '../shared/contracts';
import type { NegotiationRecord } from '../shared/negotiation';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
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
  approve: (negotiationId: string) => call<NegotiationRecord>(`/negotiations/${negotiationId}/approve`, { method: 'POST' }),
};
