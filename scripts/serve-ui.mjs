import { serve } from 'bun';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../ui');
const port = Number(process.env.PORT ?? 54321);
const media = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
serve({
  hostname: '127.0.0.1',
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const path = resolve(root, relative);
    if (path !== root && !path.startsWith(`${root}/`)) return new Response('Forbidden', { status: 403 });
    const file = Bun.file(path);
    if (!(await file.exists())) return new Response('Not found', { status: 404 });
    return new Response(file, { headers: { 'content-type': media[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' } });
  },
});
console.log(`secondary learning map UI: http://127.0.0.1:${port}`);
