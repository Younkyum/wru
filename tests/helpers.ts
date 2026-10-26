import { createApp } from '../src/server/app';

export const SIM_DATE = '2026-10-26';

export function makeApp() {
  return createApp({ sim: { date: SIM_DATE } });
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

// 위치 누수 패턴: 좌표 키 이름, 소수점 좌표(예: 37.5665, 126.978)
export const LEAK_PATTERNS: RegExp[] = [
  /\blat\b/i,
  /\blng\b/i,
  /\blatitude\b/i,
  /\blongitude\b/i,
  /coords?\b/i,
  /coordinates/i,
  /-?\d{1,3}\.\d{3,}/,
  /-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/,
];

export function leaks(text: string): string[] {
  return LEAK_PATTERNS.filter((re) => re.test(text)).map((re) => `${re} → ${text.match(re)?.[0]}`);
}
