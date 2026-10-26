import { createApp, type AppOptions } from '../src/server/app';
import { MockMuse } from '../src/server/muse/mock';
import { findLeaks } from '../src/shared/leak';

export const SIM_DATE = '2026-10-26';

export function makeApp(options: AppOptions = {}) {
  return createApp({ sim: { date: SIM_DATE }, muse: new MockMuse(), ...options });
}

export type App = ReturnType<typeof makeApp>;

export async function req(app: App, method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, text: await res.clone().text(), json: (await res.json()) as any };
}

/** 위치 누수 패턴 검사 (src/shared/leak.ts) */
export const leaks = findLeaks;
