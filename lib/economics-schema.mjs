// Public source contract. Values are in rubles per unit and percentage points (25 = 25%).
// The same validator is embedded in the standalone browser app.
export function validateEconomicsSnapshot(input, schemas) {
  const fail=()=>{throw new Error('Некорректные данные юнит-экономики')};
  if(!input||input.version!==1||!['disconnected','source'].includes(input.mode)||!Array.isArray(input.rows)||input.rows.length>20000)fail();
  const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  if(input.mode==='source'&&(!day(input.from)||!day(input.to)||input.from>input.to||!Number.isFinite(Date.parse(input.updatedAt))))fail();
  if(input.mode==='disconnected'&&input.rows.length)fail();
  const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=240,ids=new Set();
  const rows=input.rows.map(row=>{
    const schema=schemas.find(s=>s.id===row?.view);
    if(!schema||!['wb','ozon'].includes(row.marketplace)||!text(row.accountId)||!text(row.article)||!text(row.name)||!text(row.externalId)||!row.values||typeof row.values!=='object'||Array.isArray(row.values))fail();
    const id=JSON.stringify([row.view,row.marketplace,row.accountId,row.article]);if(ids.has(id))fail();ids.add(id);
    const values={};
    for(const col of schema.columns){
      const item=row.values[col.key];if(item===undefined||item===null)continue;
      if(col.format==='text')fail();
      if(!item||typeof item.value!=='number'||!Number.isFinite(item.value)||Math.abs(item.value)>1e12||!['api','calculated'].includes(item.source)||!text(item.reference)||!Number.isFinite(Date.parse(item.at))||!['current','daily-preliminary','weekly-confirmed'].includes(item.status))fail();
      if(item.source==='calculated'&&!text(item.method))fail();
      if((col.key.endsWith('Rate')||col.key==='buyout')&&(item.value<0||item.value>100))fail();
      values[col.key]={value:item.value,source:item.source,reference:item.reference,at:item.at,status:item.status,...(item.source==='calculated'?{method:item.method}:{})};
    }
    const unavailable=row.unavailable??[];
    if(!Array.isArray(unavailable)||unavailable.some(key=>!schema.columns.some(c=>c.key===key&&c.format!=='text')||Object.hasOwn(values,key))||new Set(unavailable).size!==unavailable.length)fail();
    return{id,view:row.view,marketplace:row.marketplace,accountId:row.accountId,externalId:row.externalId,article:row.article,name:row.name,group:text(row.group)?row.group:null,barcode:text(row.barcode)?row.barcode:null,values,unavailable:[...unavailable]};
  });
  return{version:1,mode:input.mode,from:input.from??null,to:input.to??null,updatedAt:input.updatedAt??null,rows};
}
