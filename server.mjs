import http from 'node:http';
import { rnpSnapshot } from './lib/rnp-store.mjs';
import { validateInventorySnapshot } from './lib/inventory.mjs';
import { readFile } from 'node:fs/promises';
const page = new URL('./index.html', import.meta.url);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
  if (path === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(req.method === 'HEAD' ? '' : JSON.stringify({ status: 'ok', mode: 'demo' })); }
  if (path === '/api/rnp') {
    try {
      const snapshot=await rnpSnapshot(process.env.RNP_LEDGER_PATH);
      res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(snapshot));
    } catch {
      res.writeHead(503, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({error:'Журнал отчётов РНП недоступен или не прошёл проверку. Последний снимок сохранён в интерфейсе.'}));
    }
  }
  if (path === '/api/inventory') {
    try {
      const source = process.env.INVENTORY_SNAPSHOT_PATH || new URL('./fixtures/inventory-demo.json', import.meta.url);
      const snapshot = validateInventorySnapshot(JSON.parse(await readFile(source, 'utf8')));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(snapshot));
    } catch {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({error:'Снимок остатков недоступен или не прошёл проверку. Проверьте настройку источника на сервере.'}));
    }
  }
  if (path !== '/' && path !== '/index.html') { res.writeHead(404); return res.end('Not found'); }
  try {
    const html = await readFile(page);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(req.method === 'HEAD' ? undefined : html);
  } catch { res.writeHead(500); res.end('Unable to load BrandOS'); }
}).listen(port, host, () => console.log(`BrandOS demo listening on ${host}:${port}`));
