import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { importRnpFile, rnpSnapshot } from '../lib/rnp-store.mjs';
const fixture=JSON.parse(await readFile(new URL('../fixtures/rnp-template.json',import.meta.url),'utf8'));
const directory=await mkdtemp(join(tmpdir(),'brandos-rnp-')),ledgerPath=join(directory,'ledger.json');
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Moscow'});
const report=(id,source,value)=>({id,source,marketplace:'wb',accountId:'seller-1',revision:1,from:today,to:today,publishedAt:today+'T15:00:00Z',closed:source==='weekly',cells:[{date:today,article:'3468383',metric:'sales_revenue',value}]});
await importRnpFile(ledgerPath,report('d1','daily',5100));
await importRnpFile(ledgerPath,report('w1','weekly',5000));
assert.equal((await rnpSnapshot(ledgerPath)).cells[0].value,5000);
assert.equal((await importRnpFile(ledgerPath,report('d1','daily',5100))).duplicates,1);
const before=await readFile(ledgerPath,'utf8');
await assert.rejects(importRnpFile(ledgerPath,[report('d2','daily',4000),{bad:true}]));
assert.equal(await readFile(ledgerPath,'utf8'),before,'batch rejects atomically');
assert.equal((await rnpSnapshot(ledgerPath)).audit.length,2);
const base='http://127.0.0.1:3400',server=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'3400',HOST:'127.0.0.1',RNP_LEDGER_PATH:ledgerPath},stdio:'ignore'});
let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch(base+'/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 assert.equal((await fetch(base+'/api/rnp',{method:'POST'})).status,405);
 browser=await chromium.launch({...process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{},args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/#rnp');
 let matched=0;
 for(const sheet of fixture.sheets){
  await page.getByRole('button',{name:sheet.name,exact:true}).click();
  assert.equal(await page.locator('.rnp-table tbody tr').count(),sheet.rows.length);
  assert.equal(await page.locator('.rnp-table tbody tr').first().locator('td').count(),sheet.columns.length);
  const values=await page.evaluate(name=>{const s=rnpSheet(name);return s.rows.flatMap(r=>s.columns.map(c=>({coord:c.letter+r,...rnpCell(name,c.letter+r)})))},sheet.name);
  for(const cell of values){const expected=sheet.cached[cell.coord];if(typeof expected==='string'&&!expected.startsWith('#'))assert.equal(cell.value,expected,`${sheet.name}!${cell.coord} text reference`);if(typeof expected==='number'&&typeof cell.value==='number') {assert.ok(Math.abs(cell.value-expected)<1e-6,`${sheet.name}!${cell.coord}: ${cell.value} != ${expected}`);matched++}}
 }
 assert.ok(matched>400,'compare calculated/source numeric cells with XLSX cached values');
 assert.equal(await page.evaluate(()=>rnpCell('WB FBW','B4').value),'куртка ');
 assert.equal(await page.evaluate(()=>rnpCell('Ozon FBS','B15').value),null,'broken source reference');
 assert.equal(await page.evaluate(()=>rnpCell('Товары','L10').value),null,'missing purchase is unknown');
 assert.equal(await page.evaluate(()=>rnpCell('WB FBW','U6').value),null,'missing logistics is not zero');
 assert.equal(await page.evaluate(()=>rnpCell('Товары','L9').value),700,'optional own costs blank=0 per source');
 await page.getByRole('button',{name:'Товары',exact:true}).click();await page.locator('[data-rnp-edit="E3"]').click();await page.getByLabel('Закупка',{exact:true}).fill('2500');await page.getByRole('button',{name:'Сохранить',exact:true}).click();
 assert.equal(await page.evaluate(()=>rnpCell('Товары','L3').value),2848);assert.ok(Math.abs(await page.evaluate(()=>rnpCell('WB FBW','U4').value)-531.15)<1e-8);
 await page.reload();assert.equal(await page.evaluate(()=>rnpCell('Товары','L3').value),2848);
 await page.getByRole('button',{name:'Параметры',exact:true}).click();await page.getByLabel('Расчётная ставка налога, %',{exact:true}).fill('6');await page.getByRole('button',{name:'Сохранить',exact:true}).click();assert.ok(Math.abs(await page.evaluate(()=>rnpCell('WB FBW','T4').value)-260.1)<1e-8);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать РНП XLSX',exact:true}).click();const file=await download,path=await file.path();assert.equal(file.suggestedFilename(),'РНП-МойСклад.xlsx');
 execFileSync('python',['-c',`import zipfile,sys,xml.etree.ElementTree as E
z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None
for n in z.namelist():
 if n.endswith('.xml') or n.endswith('.rels'):E.fromstring(z.read(n))
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
w=E.fromstring(z.read('xl/workbook.xml'));assert len(w.find('s:sheets',ns))==7
s=E.fromstring(z.read('xl/worksheets/sheet1.xml'));c=s.find('.//s:c[@r="L3"]/s:v',ns);assert float(c.text)==2848
assert b'#REF!' not in z.read('xl/worksheets/sheet4.xml')
a=E.fromstring(z.read('xl/worksheets/sheet2.xml'));assert a.find('.//s:c[@r="B4"]/s:is/s:t',ns).text=='куртка ';assert a.find('.//s:c[@r="G4"]',ns).get('s')=='3';assert a.find('.//s:pane',ns).get('topLeftCell')=='E4'
styles=E.fromstring(z.read('xl/styles.xml'));assert styles.find('s:cellXfs',ns)[3].get('numFmtId')=='10'`,path]);
 await page.getByRole('button',{name:'Фактические данные',exact:true}).click();await page.waitForFunction(()=>rnpFacts.mode==='reports');await page.locator('#periodSelect').selectOption('today');assert.equal(await page.getByRole('cell',{name:'Подтверждено недельным',exact:true}).count(),1);assert.equal(await page.getByRole('cell',{name:'5 000,00',exact:true}).count(),1);assert.equal(await page.evaluate(()=>data.rnp.overrides['Товары!E3']),2500,'reconciliation never overwrites manual costs');
 await writeFile(ledgerPath,'broken');await page.getByRole('button',{name:'Обновить отчёты',exact:true}).click();await page.waitForFunction(()=>!rnpLoading);assert.equal(await page.getByRole('cell',{name:'Подтверждено недельным',exact:true}).count(),1,'failed refresh keeps last successful snapshot');
 assert.deepEqual(errors,[]);console.log(`PASS RNP: ${matched} XLSX cached cells, exact 6 sheet layouts, source errors, missing values, editing + persistence + dependent formulas, tax, 7-sheet XLSX export, atomic report import, weekly API reconciliation and failure retention`);
}finally{await browser?.close();server.kill('SIGTERM');await rm(directory,{recursive:true,force:true})}
