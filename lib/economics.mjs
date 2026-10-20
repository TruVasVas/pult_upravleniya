import { readFile } from 'node:fs/promises';
import { validateEconomicsSnapshot } from './economics-schema.mjs';
export const economicsSchemas=JSON.parse(await readFile(new URL('../fixtures/economics-columns.json',import.meta.url),'utf8'));
export async function economicsSnapshot(path,range) {
  if(!path)return{version:1,mode:'disconnected',rows:[],from:null,to:null,updatedAt:null};
  const raw=await readFile(path,'utf8');if(Buffer.byteLength(raw)>20*1024*1024)throw new Error('Снимок слишком большой');
  const snapshot=validateEconomicsSnapshot(JSON.parse(raw),economicsSchemas);
  if(snapshot.mode==='source'&&(range.from!==snapshot.from||range.to!==snapshot.to))return{version:1,mode:'source',rows:[],from:range.from,to:range.to,updatedAt:snapshot.updatedAt};
  return snapshot;
}
