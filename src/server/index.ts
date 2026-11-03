import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { createApp } from './app.js';
import { isLive, loadFamilyConfig } from './family-config.js';

const port = Number(process.env.WRU_API_PORT ?? 8787);
const family = loadFamilyConfig(process.env);
if (isLive(family) && !process.env.WRU_ADMIN_TOKEN) {
  console.error('[wru] WRU_ADMIN_TOKEN is required when a real WhereCtx is connected (it protects the family dashboard API). See .env.example');
  process.exit(1);
}
const server = new Hono();
// 영상 녹화용: 실제 Muse 히어로 협상 기록을 재생한다 (samples/negotiation-hero-muse.json)
const replayPath = process.env.WRU_NEGOTIATION_REPLAY;
const replay = replayPath ? (JSON.parse(readFileSync(replayPath, 'utf8')) as { model: string; negotiation: never }) : null;
server.route('/', createApp({ family, env: process.env, ...(replay ? { replay: { model: replay.model, result: replay.negotiation } } : {}) }));

// 프로덕션(npm start)에서는 빌드된 UI도 같이 서빙한다
if (process.env.NODE_ENV === 'production') {
  server.use('/*', serveStatic({ root: './dist/web' }));
  server.get('*', serveStatic({ path: './dist/web/index.html' }));
}

serve({ fetch: server.fetch, port }, (info) => {
  const members = Object.entries(family)
    .map(([id, m]) => `${id}=${m.adapter === 'sim' ? 'sim' : new URL(m.wherectx_url).host}`)
    .join(', ');
  console.log(`[wru] http://localhost:${info.port}  (family: ${members}${process.env.WRU_ADMIN_TOKEN ? ', admin token on' : ''})`);
});
