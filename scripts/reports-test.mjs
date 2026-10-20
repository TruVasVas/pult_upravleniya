import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('..',import.meta.url)),port=process.env.REPORT_TEST_PORT||'3200',base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server.mjs'],{cwd:project,env:{...process.env,PORT:port,HOST:'127.0.0.1'},stdio:'ignore'});
let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch(base+'/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({...process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{},args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 const full=await page.evaluate(()=>({total:totals(),expected:data.channels.reduce((s,c)=>s+c.revenue,0),today}));assert.equal(full.total.revenue,full.expected);
 await page.locator('#periodSelect').selectOption('today');const current=await page.evaluate(()=>({range:reportRange,total:totals()}));assert.equal(current.range.from,full.today);assert.ok(current.total.revenue>0&&current.total.revenue<full.total.revenue);
 await page.locator('#periodSelect').selectOption('yesterday');const yesterday=await page.evaluate(()=>({range:reportRange,total:totals(),expected:day(-1)}));assert.equal(yesterday.range.from,yesterday.expected);assert.notEqual(yesterday.total.revenue,current.total.revenue);
 await page.locator('#periodSelect').selectOption('custom');await page.getByLabel('Начало периода',{exact:true}).fill(full.today);await page.getByLabel('Конец периода',{exact:true}).fill(yesterday.expected);await page.getByRole('button',{name:'Применить период',exact:true}).click();assert.equal(await page.locator('#f-to').getAttribute('aria-invalid'),'true');assert.ok(await page.locator('#editor').isVisible());
 await page.getByLabel('Начало периода',{exact:true}).fill(yesterday.expected);await page.getByLabel('Конец периода',{exact:true}).fill(full.today);await page.getByRole('button',{name:'Применить период',exact:true}).click();const custom=await page.evaluate(()=>totals().revenue);assert.equal(custom,current.total.revenue+yesterday.total.revenue);
 await page.reload();assert.equal(await page.locator('#periodSelect').inputValue(),'custom');assert.equal(await page.evaluate(()=>totals().revenue),custom);
 await page.goto(base+'/#pnl');assert.equal(await page.evaluate(()=>reportPnl().revenue),custom);const pnl=await page.evaluate(()=>reportPnl());assert.ok(Math.abs(pnl.profit-(pnl.revenue-pnl.commission-pnl.logistics-pnl.cost-pnl.advertising-pnl.fixed))<.001);
 await page.goto(base+'/#rnp');assert.equal(await page.evaluate(()=>dailyPerformance().reduce((s,r)=>s+r.revenue,0)),custom);assert.ok(Math.abs(await page.evaluate(()=>dailyPerformance().reduce((s,r)=>s+r.profit,0))-pnl.profit)<.001);
 let dl=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать РНП XLSX'}).click();const rnpXlsx=await readFile(await (await dl).path());assert.equal(rnpXlsx.readUInt32LE(0),0x04034b50);
 console.log('PASS calendar presets, invalid dates, inclusive custom range, persistence, matching overview / P&L / daily totals, RNP XLSX');
 await page.goto(base+'/#dds');await page.locator('#periodSelect').selectOption('month');let d=await page.evaluate(()=>ddsMetrics());assert.equal(d.income,643400);assert.equal(d.expense,238400);assert.equal(d.net,405000);assert.equal(d.closing,1632200);assert.equal(d.closing,d.opening+d.income-d.expense);
 await page.locator('#periodSelect').selectOption('yesterday');d=await page.evaluate(()=>ddsMetrics());assert.equal(d.income,214800);assert.equal(d.expense,28400);assert.equal(d.tx.length,2);
 dl=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать ДДС'}).click();const ddsCsv=await readFile(await (await dl).path(),'utf8');assert.ok(ddsCsv.includes('"-28400"'));assert.ok(!ddsCsv.includes("'-28400"));
 console.log('PASS cash flow: selected transactions, opening + income - expense = closing, numeric negative CSV values');
 await page.goto(base+'/#unit');assert.equal(await page.locator('.seller-table th').count(),19);assert.equal(await page.evaluate(()=>unitRows()[0].name),'Товар 1');
 console.log('PASS workbook unit-economics route; formulas and editing covered by seller-moon-test');
 await page.goto(base+'/#taxes');await page.getByRole('button',{name:'Сформировать декларацию',exact:true}).click();assert.equal(await page.locator('#f-inn').getAttribute('aria-invalid'),'true');
 await page.getByRole('button',{name:'Заполнить демо-пример',exact:true}).click();await page.getByRole('button',{name:'Сформировать декларацию',exact:true}).click();assert.ok((await page.locator('.declaration-preview').textContent()).includes('К доплате: 600'));assert.ok((await page.locator('.declaration-preview').textContent()).includes('НЕ ДЛЯ ПОДАЧИ'));
 dl=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать черновик TXT',exact:true}).click();const declaration=await dl;assert.ok(declaration.suggestedFilename().endsWith('.txt'));assert.ok((await readFile(await declaration.path(),'utf8')).includes('7701234560'));
 await page.keyboard.press('Escape');await page.goto(base+'/#documents');assert.equal(await page.getByRole('row').filter({hasText:'УСН-черновик-'}).count(),1);
 const minimum=await page.evaluate(()=>declarationValues({...data.taxForm,system:'profit',income:'1000',expenses:'2000',rate:'15',advance:'0'}).taxAmount);assert.equal(minimum,10);
 await page.goto(base+'/#taxes');await page.locator('#taxTemplateUpload').setInputFiles({name:'my-template.txt',mimeType:'text/plain',buffer:Buffer.from('Мой шаблон: {{company}} / {{inn}} / налог {{tax}}')});assert.equal(await page.locator('#taxTemplate').inputValue(),'Мой шаблон: {{company}} / {{inn}} / налог {{tax}}');await page.getByRole('button',{name:'Сформировать декларацию',exact:true}).click();assert.ok((await page.locator('.declaration-preview').textContent()).includes('Мой шаблон: ООО'));
 console.log('PASS tax draft: required fields, template substitution, 6% and minimum tax, original download, document storage, own TXT template');
 assert.deepEqual(errors,[]);console.log('PASS all report checks');
}finally{await browser?.close();server.kill('SIGTERM')}
