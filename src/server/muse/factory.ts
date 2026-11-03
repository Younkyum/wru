import type { MuseClient, MuseEnv } from './client.js';
import { MetaMuse } from './meta.js';
import { MockMuse } from './mock.js';

const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** 키가 있으면 실제 Muse, 없으면 mock */
export function createMuseClient(env: MuseEnv = process.env): MuseClient {
  if (env.MODEL_API_KEY) {
    return new MetaMuse({
      apiKey: env.MODEL_API_KEY,
      baseUrl: env.MODEL_API_BASE_URL,
      model: env.MUSE_MODEL,
      maxCalls: num(env.MUSE_MAX_CALLS),
      maxUsd: num(env.MUSE_MAX_USD),
      reasoningEffort: env.MUSE_REASONING_EFFORT || undefined,
    });
  }
  return new MockMuse();
}
