import type { MuseClient, MuseEnv } from './client.js';
import { MetaMuse } from './meta.js';
import { MockMuse } from './mock.js';

/** 키가 있으면 실제 Muse, 없으면 mock */
export function createMuseClient(env: MuseEnv = process.env): MuseClient {
  if (env.MODEL_API_KEY) {
    return new MetaMuse({ apiKey: env.MODEL_API_KEY, baseUrl: env.MODEL_API_BASE_URL, model: env.MUSE_MODEL });
  }
  return new MockMuse();
}
