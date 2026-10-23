import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readdir, readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
execFileSync(process.execPath,['scripts/build-demo.mjs'],{stdio:'inherit'});
assert.deepEqual((await readdir(new URL('../dist/',import.meta.url))).sort(),['.brandos-demo','.nojekyll','LICENSE-Inter.txt','api','index.html'].sort());
assert.deepEqual((await readdir(new URL('../dist/api/',import.meta.url))).sort(),['economics.json','inventory.json','rnp.json']);
const base='http://127.0.0.1:3700/pult_upravleniya/',server=spawn(process.execPath,['scripts/preview-demo.mjs'],{env:{...process.env,PORT:'3700',HOST:'127.0.0.1',DEMO_BASE_PATH:'/pult_upravleniya'},stdio:'ignore'});let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 assert.equal((await fetch(base+'.env')).status,404);assert.equal((await fetch(base+'server.mjs')).status,404);assert.equal((await fetch(base+'data/rnp-ledger.json')).status,404);
 const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');assert.ok(html.includes('name="brandos-static-demo"'));assert.ok(html.includes('name="robots"'));
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],api=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/'))api.push({url:r.url(),status:r.status()})});
 const routes=['home','decisions','analytics','finance','pnl','dds','rnp','unit','sales','marketplaces','ads','stock','supplies','taxes','documents','integrations','tasks'];
 for(const route of routes){await page.goto(base+'#'+route);assert.ok(await page.locator('main h1').textContent());if(['unit','rnp'].includes(route)){await page.waitForFunction(()=>!economicsLoading);assert.equal(await page.evaluate(()=>economicsData.mode),'disconnected');assert.equal(await page.evaluate(()=>economicsError),'')}assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,route)}
 await page.goto(base+'#stock');await page.getByRole('button',{name:'Обновить остатки',exact:true}).click();await page.waitForFunction(()=>!inventoryLoading);assert.equal(await page.evaluate(()=>inventorySnapshot.mode),'demo');
 await page.goto(base+'#rnp');await page.locator('[data-economics-view=facts]').click();await page.waitForFunction(()=>!rnpLoading);assert.equal(await page.evaluate(()=>rnpFacts.mode),'disconnected');
 for(const resource of ['inventory','economics','rnp'])assert.ok(api.some(r=>new URL(r.url).pathname.endsWith('/'+resource+'.json')),resource+' demo response');assert.ok(api.every(r=>new URL(r.url).pathname.startsWith('/pult_upravleniya/api/')&&r.status===200));assert.deepEqual(errors,[]);
 await page.setViewportSize({width:375,height:900});await page.goto(base+'#home');await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
 await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../test-results/static-demo-375.png',import.meta.url).pathname,fullPage:true});
 console.log('PASS public static artifact: demo-only files, no source/data files, 17 routes without Node APIs, subdirectory hosting, local demo JSON requests, stock/RNP/economics, mobile layout and no runtime errors');
}finally{await browser?.close();server.kill('SIGTERM')}
