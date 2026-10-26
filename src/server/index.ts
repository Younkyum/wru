import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { createApp } from './app.js';

const port = Number(process.env.WRU_API_PORT ?? 8787);
const server = new Hono();
server.route('/', createApp());

// 프로덕션(npm start)에서는 빌드된 UI도 같이 서빙한다
if (process.env.NODE_ENV === 'production') {
  server.use('/*', serveStatic({ root: './dist/web' }));
  server.get('*', serveStatic({ path: './dist/web/index.html' }));
}

serve({ fetch: server.fetch, port }, (info) => {
  console.log(`[wru] API http://localhost:${info.port}/api`);
});
