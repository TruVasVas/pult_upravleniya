import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { importRnpFile } from '../lib/rnp-store.mjs';
const file=process.argv[2];
if(!file){console.error('Использование: npm run rnp:import -- /path/to/normalized-reports.json');process.exitCode=1;}
else try {
  const raw=await readFile(resolve(file),'utf8');
  if(Buffer.byteLength(raw)>20*1024*1024)throw new Error('Файл слишком большой');
  const result=await importRnpFile(resolve(process.env.RNP_LEDGER_PATH||'data/rnp-ledger.json'),JSON.parse(raw));
  console.log(JSON.stringify(result));
} catch(error){console.error('Импорт РНП отклонён: '+error.message);process.exitCode=1;}
