import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { importRnpFile, rnpSnapshot } from '../lib/rnp-store.mjs';
const dir=await mkdtemp(join(tmpdir(),'brandos-rnp-')),path=join(dir,'ledger.json');
const report=(id,source,value)=>({id,source,marketplace:'wb',accountId:'seller-1',revision:1,from:'2026-10-19',to:'2026-10-19',publishedAt:'2026-10-19T15:00:00Z',closed:source==='weekly',cells:[{date:'2026-10-19',article:'A-1',metric:'sales_revenue',value}]});
try {
 assert.equal((await rnpSnapshot()).mode,'disconnected');
 await importRnpFile(path,report('d1','daily',5100));
 await importRnpFile(path,report('w1','weekly',5000));
 assert.equal((await rnpSnapshot(path)).cells[0].value,5000);
 const before=await readFile(path,'utf8');
 assert.equal((await importRnpFile(path,report('d1','daily',5100))).duplicates,1);
 assert.equal(await readFile(path,'utf8'),before);
 await assert.rejects(importRnpFile(path,[report('d2','daily',4000),{bad:true}]));
 assert.equal(await readFile(path,'utf8'),before);
 assert.equal((await rnpSnapshot(path)).audit.length,2);
 const input=join(dir,'report.json');await writeFile(input,JSON.stringify({...report('d2','daily',4600),revision:2}));
 execFileSync(process.execPath,['scripts/rnp-import.mjs',input],{env:{...process.env,RNP_LEDGER_PATH:path},stdio:'pipe'});
 assert.equal((await rnpSnapshot(path)).cells[0].value,5000,'late daily import never replaces weekly confirmation');
 await writeFile(path,'invalid');await assert.rejects(rnpSnapshot(path));
 console.log('PASS RNP store: atomic imports, batch rollback, backup, idempotency, CLI, weekly precedence and invalid source rejection');
} finally {await rm(dir,{recursive:true,force:true})}
