import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixtureRoot = resolve(root, 'fixtures');
const port = Number(process.env.EZSAVE_FIXTURE_PORT ?? 4173);
const mimeTypes = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.webm': 'video/webm',
  '.webp': 'image/webp'
};

function requestedPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^[/\\]+/, '');
  const target = normalize(resolve(fixtureRoot, relativePath));
  return target.startsWith(`${fixtureRoot}${sep}`) || target === fixtureRoot ? target : null;
}

const server = createServer((request, response) => {
  const target = requestedPath(request.url ?? '/');
  if (!target || !existsSync(target) || statSync(target).isDirectory()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': mimeTypes[extname(target).toLowerCase()] ?? 'application/octet-stream'
  });
  createReadStream(target).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`EZSave fixtures: http://127.0.0.1:${port}`);
});
