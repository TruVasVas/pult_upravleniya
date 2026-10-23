import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url)),prefix=(process.env.DEMO_BASE_PATH||'').replace(/\/$/,''),port=Number(process.env.PORT||4173);
http.createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end()}
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);return res.end()}
 if(prefix&&!pathname.startsWith(prefix+'/')){res.writeHead(404);return res.end()}
 const relative=pathname.slice(prefix.length),path=resolve(root,'.'+(relative==='/'?'/index.html':relative));
 if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(404);return res.end()}
 try{const data=await readFile(path);res.writeHead(200,{'Content-Type':extname(path)==='.html'?'text/html; charset=utf-8':extname(path)==='.json'?'application/json; charset=utf-8':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data)}catch{res.writeHead(404);res.end()}
}).listen(port,process.env.HOST||'127.0.0.1',()=>console.log('Static demo preview ready on port '+port+prefix+'/'));
