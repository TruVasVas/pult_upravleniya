import http from 'node:http';
import { readFile } from 'node:fs/promises';
const page = new URL('./index.html', import.meta.url);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  if (path === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(req.method === 'HEAD' ? '' : JSON.stringify({ status: 'ok', mode: 'demo' })); }
  if (path !== '/' && path !== '/index.html') { res.writeHead(404); return res.end('Not found'); }
  try {
    const html = await readFile(page);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(req.method === 'HEAD' ? undefined : html);
  } catch { res.writeHead(500); res.end('Unable to load BrandOS'); }
}).listen(port, host, () => console.log(`BrandOS demo listening on ${host}:${port}`));
