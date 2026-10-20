import { readFile, mkdir, rename, writeFile, copyFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRnpLedger, ingestRnpReport, reconcileRnp } from './rnp-reconciliation.mjs';

// Validate persisted data by replaying its reports; never trust stored effective cells.
export async function readRnpLedger(path) {
  let raw;
  try { raw = await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return createRnpLedger(); throw error; }
  if (Buffer.byteLength(raw) > 50 * 1024 * 1024) throw new Error('Журнал РНП слишком большой');
  const input = JSON.parse(raw);
  if (input.version !== 1 || !Array.isArray(input.reports) || input.reports.length > 10000) throw new Error('Неверный журнал РНП');
  let ledger = createRnpLedger();
  for (let i=0;i<input.reports.length;i++) {
    const report = input.reports[i];
    ledger = ingestRnpReport(ledger, report, {at: input.imports?.[i]?.at || report.publishedAt}).ledger;
  }
  return ledger;
}

export async function importRnpFile(path, input) {
  await mkdir(dirname(path), {recursive:true});
  const lock = path+'.lock';
  try { await mkdir(lock); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Импорт РНП уже выполняется; повторите после завершения'); throw error; }
  const temporary = path+'.tmp';
  try {
    let ledger = await readRnpLedger(path);
    const reports = Array.isArray(input) ? input : [input];
    if (!reports.length || reports.length > 10000) throw new Error('Нужны нормализованные отчёты');
    let changed=0,duplicates=0;
    for (const report of reports) {
      const result = ingestRnpReport(ledger,report);
      ledger = result.ledger;
      changed += result.changes.length;
      duplicates += Number(result.duplicate);
    }
    if (duplicates===reports.length) return {changed,duplicates,reports:ledger.reports.length};
    await writeFile(temporary,JSON.stringify(ledger,null,2)+'\n',{mode:0o600});
    try { await copyFile(path,path+'.bak'); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
    await rename(temporary,path);
    return {changed,duplicates,reports:ledger.reports.length};
  } finally {
    await rm(temporary,{force:true});
    await rm(lock,{recursive:true,force:true});
  }
}

export async function rnpSnapshot(path) {
  if (!path) return {version:1,mode:'disconnected',cells:[],audit:[],imports:[]};
  const ledger=await readRnpLedger(path);
  return {version:1,mode:ledger.reports.length?'reports':'disconnected',cells:reconcileRnp(ledger),audit:ledger.audit,imports:ledger.imports};
}
