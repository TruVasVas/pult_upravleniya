import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { validateEconomicsSnapshot } from '../lib/economics-schema.mjs';
const schemas=JSON.parse(await readFile(new URL('../fixtures/economics-columns.json',import.meta.url),'utf8'));
assert.equal(schemas[0].columns.length,20);
assert.deepEqual(schemas.slice(1).map(s=>s.columns.length),[13,23,20,20,21,16]);
for(const schema of schemas){assert.equal(schema.columns[0].key,'article');assert.equal(schema.columns[0].label,'Артикул продавца');assert.ok(schema.columns.every(c=>!('formula'in c)&&!('value'in c)&&c.key!=='barcode'&&Array.isArray(c.header)&&c.tone))}
assert.deepEqual(schemas.find(s=>s.id==='wb-fbw').columns.slice(0,3).map(c=>c.key),['article','group','name']);
assert.deepEqual(schemas.find(s=>s.id==='wb-fbw').columns.find(c=>c.key==='storageDays').header,['Расходы на маркетплейсе','Хранение, руб','Среднее кол-во дней']);
const unitTones=Object.fromEntries(schemas[0].columns.map(c=>[c.key,c.tone]));assert.equal(unitTones.lossRate,'purple');assert.equal(unitTones.buyout,unitTones.purchase);assert.equal(unitTones.price,'lightgray');assert.equal(unitTones.adRate,unitTones.price);

const directory=await mkdtemp(join(tmpdir(),'brandos-economics-')),path=join(directory,'source.json');
await writeFile(path,JSON.stringify({version:1,mode:'disconnected',rows:[]}));
const base='http://127.0.0.1:3500',server=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'3500',HOST:'127.0.0.1',ECONOMICS_SNAPSHOT_PATH:path},stdio:'ignore'});
let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch(base+'/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 assert.equal((await fetch(base+'/api/economics',{method:'POST'})).status,405);
 browser=await chromium.launch({...process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{},args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(localStorage.getItem('legacy-test-seeded'))return;localStorage.setItem('legacy-test-seeded','1');localStorage.setItem('brandos-demo-v1',JSON.stringify({version:1,sellerMoon:{version:1,returnTariff:50,rows:[{id:'old',name:'Товар 1',purchase:300,price:1550}]},rnp:{version:1,taxRate:7,overrides:{'Товары!E3':2400}}}));});
 await page.goto(base+'/#unit');await page.waitForFunction(()=>!economicsLoading);
 assert.equal(await page.evaluate(()=>economicsRows().length),0);assert.equal(await page.locator('.seller-table,.rnp-table,input[data-seller-field]').count(),0);assert.ok(!(await page.locator('main').innerText()).includes('Товар 1'));assert.equal(await page.evaluate(()=>typeof calculateSellerRow),'undefined');assert.equal(await page.evaluate(()=>typeof rnpTemplate),'undefined');
 const range=await page.evaluate(()=>reportRange);
 const value=(number,source='api')=>({value:number,source,reference:'report-verified-1',at:new Date().toISOString(),status:'weekly-confirmed',...(source==='calculated'?{method:'Согласованный расчёт источника из финансовых операций'}:{})});
 const row=(view='unit',marketplace='wb',article='A-1')=>({view,marketplace,accountId:'seller-1',externalId:marketplace+'-'+article,article,name:'Проверенный товар '+article,values:{price:value(1550),profit:value(-120,'calculated'),commission:value(0)},unavailable:['commissionRate']});
 const source={version:1,mode:'source',...range,updatedAt:new Date().toISOString(),rows:[row(),row('unit','ozon'),{...row('wb-fbw'),values:{price:value(1550),profit:value(-120,'calculated')},unavailable:['commissionRate']}]};
 const clean=validateEconomicsSnapshot({...source,secret:'DO-NOT-EXPOSE',rows:source.rows.map(r=>({...r,apiKey:'DO-NOT-EXPOSE'}))},schemas);assert.ok(!JSON.stringify(clean).includes('DO-NOT-EXPOSE'));
 assert.throws(()=>validateEconomicsSnapshot({...source,rows:[{...source.rows[0],values:{price:value(Infinity)}}]},schemas));
 assert.throws(()=>validateEconomicsSnapshot({...source,rows:[{...source.rows[0],values:{price:{...value(1500,'calculated'),method:''}}}]},schemas));
 await writeFile(path,JSON.stringify(source));await page.getByRole('button',{name:'Обновить',exact:true}).click();await page.waitForFunction(()=>!economicsLoading&&economicsRows().length===2);
 assert.equal(await page.evaluate(()=>economicsValue(economicsRows()[0],economicsSchema().columns.find(c=>c.key==='purchase')).value),null);
 await page.locator('.economics-product').first().click();assert.equal(await page.locator('.economics-details>div').count(),20);assert.equal(await page.locator('[data-economics-edit="price"]').count(),0);assert.equal(await page.locator('[data-economics-edit="commissionRate"]').count(),1);
 assert.ok((await page.locator('.economics-details').textContent()).includes('Подтверждено недельным отчётом'));
 await page.locator('[data-economics-edit="purchase"]').click();await page.getByLabel('Закупка, руб',{exact:true}).fill('350');await page.getByRole('button',{name:'Сохранить',exact:true}).click();
 assert.equal(await page.evaluate(()=>economicsValue(economicsRows()[0],economicsSchema().columns.find(c=>c.key==='purchase')).value),350);assert.equal(await page.evaluate(()=>economicsValue(economicsRows()[1],economicsSchema().columns.find(c=>c.key==='purchase')).value),null,'different marketplaces never share manual costs');
 // Legacy scenario is seeded once; the new data must survive navigation/reload.
 await page.reload();await page.waitForFunction(()=>!economicsLoading);assert.equal(await page.evaluate(()=>economicsValue(economicsRows()[0],economicsSchema().columns.find(c=>c.key==='purchase')).value),350);
 const commissionCol=await page.evaluate(()=>economicsSchema().columns.find(c=>c.key==='commission'));assert.equal(await page.evaluate(c=>economicsValue(economicsRows()[0],c).value,commissionCol),0,'explicit zero is retained');
 await page.getByRole('button',{name:/Нужны данные/}).click();let download=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать список для заказчика'}).click();const text=await readFile(await (await download).path(),'utf8');assert.ok(text.includes('Налог %'));assert.ok(text.includes('Комиссия ВБ %'));assert.ok(!text.includes('Цена без СПП'));
 await page.getByRole('button',{name:'Закрыть панель',exact:true}).click();source.rows[0].values.purchase=value(420);await writeFile(path,JSON.stringify(source));await page.getByRole('button',{name:'Обновить',exact:true}).click();await page.waitForFunction(()=>!economicsLoading);assert.equal(await page.evaluate(()=>economicsValue(economicsRows()[0],economicsSchema().columns.find(c=>c.key==='purchase')).value),420,'API takes precedence over archived manual value');
 download=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать Excel',exact:true}).click();const exported=await download;
 execFileSync('python',['-c',`import zipfile,sys,xml.etree.ElementTree as E
z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None
for n in z.namelist():E.fromstring(z.read(n))
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
s=E.fromstring(z.read('xl/worksheets/sheet1.xml'));assert len(s.find('s:sheetData',ns)[0])==20;assert s.find('.//s:c[@r="A2"]/s:is/s:t',ns).text=='A-1';assert s.find('.//s:c[@r="C2"]/s:v',ns).text=='420';assert s.find('.//s:c[@r="K2"]',ns) is None;assert s.find('.//s:pane',ns).get('xSplit')=='1';assert s.find('.//s:f',ns) is None`,await exported.path()]);
 await writeFile(path,'broken');await page.getByRole('button',{name:'Обновить',exact:true}).click();await page.waitForFunction(()=>!economicsLoading);assert.equal(await page.evaluate(()=>economicsRows().length),2);assert.ok((await page.locator('main').innerText()).includes('Источник недоступен'));
 await writeFile(path,JSON.stringify(source));await page.locator('#periodSelect').selectOption('today');await page.waitForFunction(()=>!economicsLoading);assert.equal(await page.evaluate(()=>economicsRows().length),0,'wrong-period source never leaks into the report');await page.locator('#periodSelect').selectOption('month');await page.waitForFunction(()=>!economicsLoading&&economicsRows().length===2);
 for(let i=2;i<24;i++)source.rows.push(row('unit','wb','A-'+i));await writeFile(path,JSON.stringify(source));await page.getByRole('button',{name:'Обновить',exact:true}).click();await page.waitForFunction(()=>!economicsLoading&&economicsRows().length===24);assert.equal(await page.locator('.economics-table tbody tr').count(),10);await page.getByRole('button',{name:'Следующие товары'}).click();assert.equal(await page.locator('.economics-table tbody tr').count(),10);
 await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
 for(const route of ['unit','rnp'])for(const width of [1280,768,375]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/#'+route);await page.waitForFunction(()=>!economicsLoading);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))});
  assert.equal(await page.locator('#economicsColumns').count(),0,'all columns are in one table');
  assert.equal(await page.locator('.economics-table thead [data-key]').count(),route==='unit'?20:23);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true,route+' '+width+' page width');
  const scroller=page.locator('#economicsScroll'),first=page.locator('.economics-table tbody tr').first().locator('td').first(),before=await first.boundingBox();
  assert.ok(await scroller.evaluate(e=>e.scrollWidth>e.clientWidth),'table has inner horizontal scrolling');
  await page.locator('#economicsScrollRange').fill('1000');
  assert.ok(await scroller.evaluate(e=>e.scrollLeft>1000));
  const after=await first.boundingBox();assert.ok(Math.abs(after.x-before.x)<1,'product column stays fixed at the left edge');
  assert.equal(await page.locator('.economics-table th').last().isVisible(),true,'columns remain visible on mobile');
  assert.ok(await first.textContent().then(t=>t.includes('A-')),'sticky cell includes seller article');assert.ok(!(await first.textContent()).includes('Проверенный товар'),'only seller article is fixed');
  const leafHeader=page.locator('.economics-table th[data-key=article]');assert.equal(await leafHeader.textContent(),'Артикул продавца');
  if(route==='rnp'){assert.equal(await page.locator('.economics-table thead tr').count(),3);assert.equal(await page.locator('th').filter({hasText:/^Логистика, руб$/}).getAttribute('colspan'),'3');assert.equal(await page.locator('th').filter({hasText:/^Хранение, руб$/}).getAttribute('colspan'),'3');}
  const colors=await page.locator('.economics-table tbody tr').first().locator('td').evaluateAll(es=>Object.fromEntries(es.map(e=>[e.dataset.key,getComputedStyle(e).backgroundColor])));if(route==='unit'){assert.equal(colors.profit,'rgb(233, 221, 251)');assert.equal(colors.purchase,'rgb(210, 213, 222)');assert.equal(colors.price,'rgb(238, 240, 244)')}else{assert.notEqual(colors.article,colors.price);assert.notEqual(colors.price,colors.commissionRate)}
  await scroller.evaluate(e=>e.scrollLeft=300);await page.waitForFunction(()=>+document.getElementById('economicsScrollRange').value<1000);
  const previous=await scroller.evaluate(e=>e.scrollLeft);await scroller.dispatchEvent('wheel',{deltaY:120,shiftKey:true,bubbles:true,cancelable:true});assert.ok(await scroller.evaluate(e=>e.scrollLeft)>previous,'Shift + mouse wheel scrolls horizontally');
  await page.locator('#economicsScrollRange').fill('0');await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))});
  const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],route+' '+width+' accessibility');await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'})});await page.screenshot({path:new URL(`../test-results/economics-${route}-${width}.png`,import.meta.url).pathname,fullPage:true});
 }
 await page.setViewportSize({width:1280,height:1000});await page.goto(base+'/#rnp');await page.waitForFunction(()=>!economicsLoading);
 download=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать Excel',exact:true}).click();const rnpExport=await download;
 execFileSync('python',['-c',`import zipfile,sys,xml.etree.ElementTree as E
z=zipfile.ZipFile(sys.argv[1]);ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
s=E.fromstring(z.read('xl/worksheets/sheet2.xml'));assert s.find('.//s:c[@r="A4"]/s:is/s:t',ns).text=='A-1';assert s.find('.//s:pane',ns).get('topLeftCell')=='B4';assert len(s.find('s:mergeCells',ns))>5
styles=E.fromstring(z.read('xl/styles.xml'));assert len(styles.find('s:fills',ns))==10
for n in z.namelist():E.fromstring(z.read(n))`,await rnpExport.path()]);
 for(const schema of schemas.filter(s=>s.id!=='unit')){await page.locator('[data-economics-view="'+schema.id+'"]').click();assert.equal(await page.locator('.economics-table thead [data-key]').count(),schema.columns.length);assert.equal(await page.locator('.economics-table th.economics-pinned').textContent(),'Артикул продавца');if(schema.id==='compare'){assert.equal(await page.getByRole('columnheader',{name:'Wildberries, FBO',exact:true}).getAttribute('colspan'),'3');assert.equal(await page.getByRole('columnheader',{name:'Ozon, FBS',exact:true}).getAttribute('colspan'),'3');assert.equal(await page.locator('.economics-table thead tr').first().locator('th').evaluateAll(es=>new Set(es.map(e=>getComputedStyle(e).backgroundColor)).size),5)}}
 assert.deepEqual(errors,[]);console.log('PASS economics: headers only, legacy sample isolation, validated provenance, API priority, customer requests, manual persistence, period isolation, pagination, source errors, XLSX without guessed values/formulas, shared tables and WCAG at 1280/768/375');
}finally{await browser?.close();server.kill('SIGTERM');await rm(directory,{recursive:true,force:true})}
