import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp } from './app.js';
import { isLive, loadFamilyConfig } from './family-config.js';

const port = Number(process.env.WRU_API_PORT ?? 8787);
const family = loadFamilyConfig(process.env);
if (isLive(family) && !process.env.WRU_ADMIN_TOKEN) {
  console.error('[wru] 실제 WhereCtx를 붙일 때는 WRU_ADMIN_TOKEN이 필요해요 (가족 대시보드 API 보호). .env.example 참고');
  process.exit(1);
}
const server = new Hono();
server.route('/', createApp({ family, env: process.env }));

// 프로덕션(npm start)에서는 빌드된 UI도 같이 서빙한다
if (process.env.NODE_ENV === 'production') {
  server.use('/*', serveStatic({ root: './dist/web' }));
  server.get('*', serveStatic({ path: './dist/web/index.html' }));
}

serve({ fetch: server.fetch, port }, (info) => {
  const members = Object.entries(family)
    .map(([id, m]) => `${id}=${m.adapter === 'sim' ? 'sim' : new URL(m.wherectx_url).host}`)
    .join(', ');
  console.log(`[wru] http://localhost:${info.port}  (가족: ${members}${process.env.WRU_ADMIN_TOKEN ? ', 관리자 토큰 사용' : ''})`);
});
