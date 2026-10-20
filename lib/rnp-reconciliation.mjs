// Column-independent reconciliation. Marketplace adapters must normalize real report
// details into dated cells only after the user's spreadsheet mapping is known.
const keyOf = cell => JSON.stringify([cell.marketplace, cell.accountId, cell.date, cell.article, cell.metric]);
const reportKey = report => JSON.stringify([report.marketplace, report.accountId, report.source, report.id]);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 160;

export function createRnpLedger() { return {version:1,reports:[],imports:[],audit:[]}; }

export function normalizeRnpReport(input) {
  const invalid = message => { throw new Error('Отчёт РНП: '+message); };
  if (!input || !text(input.id) || !text(input.accountId) || !['wb','ozon'].includes(input.marketplace) || !['daily','weekly'].includes(input.source) || !Number.isSafeInteger(input.revision) || input.revision < 1) invalid('неверный источник или версия');
  if (!validDate(input.from) || !validDate(input.to) || input.from > input.to || (Date.parse(input.to)-Date.parse(input.from))/86400000 > 366 || !Number.isFinite(Date.parse(input.publishedAt))) invalid('неверный период или время публикации');
  if (input.source === 'weekly' && (Date.parse(input.to)-Date.parse(input.from))/86400000 > 6) invalid('недельный период должен быть не длиннее семи дней');
  if (input.source === 'weekly' && input.closed !== true) invalid('неделя ещё не закрыта');
  if (!Array.isArray(input.cells) || input.cells.length > 100000) invalid('нужны детальные значения по датам; общий недельный итог нельзя распределять автоматически');
  const seen = new Set();
  const cells = input.cells.map(c => {
    if (!c || !validDate(c.date) || c.date < input.from || c.date > input.to || !(c.article === null || text(c.article)) || typeof c.metric !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(c.metric) || !(c.value === null || typeof c.value === 'number' && Number.isFinite(c.value))) invalid('неверное значение ячейки');
    const row = {date:c.date,article:c.article,metric:c.metric,value:c.value};
    const key = JSON.stringify([row.date,row.article,row.metric]);
    if (seen.has(key)) invalid('повторная ячейка; строки операций сначала нужно агрегировать');
    seen.add(key); return row;
  }).sort((a,b)=>JSON.stringify([a.date,a.article,a.metric]).localeCompare(JSON.stringify([b.date,b.article,b.metric])));
  const supersedes = input.supersedes ?? [];
  if (!Array.isArray(supersedes) || supersedes.some(id=>!text(id) || id===input.id) || new Set(supersedes).size!==supersedes.length || input.source==='daily' && supersedes.length) invalid('неверная ссылка на корректируемый отчёт');
  return {id:input.id,marketplace:input.marketplace,accountId:input.accountId,source:input.source,revision:input.revision,from:input.from,to:input.to,publishedAt:new Date(input.publishedAt).toISOString(),closed:input.source==='weekly',supersedes:[...supersedes].sort(),cells};
}

function effectiveReports(reports) {
  const latest = new Map(), allKeys = new Map();
  for (const report of reports) {
    const key = reportKey(report);
    if (!latest.has(key) || latest.get(key).revision < report.revision) latest.set(key,report);
    if (!allKeys.has(key)) allKeys.set(key,new Map());
    for (const cell of report.cells) allKeys.get(key).set(JSON.stringify([cell.date,cell.article,cell.metric]),cell);
  }
  const disabled = new Set();
  const inherited = new Map();
  const expand = (report,path=new Set()) => {
    const key=reportKey(report); if(path.has(key))throw new Error('Циклическая корректировка недельного отчёта');
    if(inherited.has(key))return inherited.get(key);
    const keys=new Map(allKeys.get(key));
    for(const id of report.supersedes){
      const oldKey=reportKey({...report,id});const old=latest.get(oldKey);
      if(!old || old.from!==report.from || old.to!==report.to)throw new Error('Не найден корректируемый недельный отчёт того же периода и кабинета');
      disabled.add(oldKey);
      for(const [cellKey,cell]of expand(old,new Set([...path,key])))keys.set(cellKey,cell);
    }
    inherited.set(key,keys);return keys;
  };
  for(const report of latest.values())if(report.source==='weekly')expand(report);
  return [...latest.values()].filter(r=>!disabled.has(reportKey(r))).map(report=>{
    if(report.source==='daily')return report;
    const cells=new Map(report.cells.map(c=>[JSON.stringify([c.date,c.article,c.metric]),c]));
    // A value removed by a new weekly revision becomes unknown, never a stale daily value.
    for(const [key,cell]of inherited.get(reportKey(report)))if(!cells.has(key))cells.set(key,{...cell,value:null});
    return {...report,cells:[...cells.values()]};
  });
}

export function reconcileRnp(ledger) {
  const result = new Map();
  for(const report of effectiveReports(ledger.reports))for(const cell of report.cells){
    const candidate={marketplace:report.marketplace,accountId:report.accountId,...cell,source:report.source,reportId:report.id,revision:report.revision,publishedAt:report.publishedAt,status:cell.value===null?'needs-review':report.source==='weekly'?'weekly-confirmed':'daily-preliminary'};
    const key=keyOf(candidate),previous=result.get(key);
    if(!previous){result.set(key,candidate);continue}
    if(previous.source==='weekly'&&candidate.source==='daily')continue;
    if(previous.source==='daily'&&candidate.source==='weekly'){result.set(key,candidate);continue}
    if(previous.source==='weekly')throw new Error('Пересекающиеся недельные отчёты: требуется явная ссылка supersedes');
    const order=Date.parse(candidate.publishedAt)-Date.parse(previous.publishedAt);
    if(order===0&&candidate.value!==previous.value)throw new Error('Противоречивые ежедневные данные с одинаковым временем публикации');
    if(order>0 || order===0&&candidate.reportId.localeCompare(previous.reportId)>0)result.set(key,candidate);
  }
  return [...result.values()].sort((a,b)=>keyOf(a).localeCompare(keyOf(b)));
}

export function ingestRnpReport(ledger,input,{at=new Date().toISOString()}={}) {
  if(!ledger || ledger.version!==1 || !Array.isArray(ledger.reports) || !Array.isArray(ledger.audit) || !Array.isArray(ledger.imports) || !Number.isFinite(Date.parse(at)))throw new Error('Некорректный журнал РНП');
  const report=normalizeRnpReport(input),key=reportKey(report),existing=ledger.reports.find(r=>reportKey(r)===key&&r.revision===report.revision);
  if(existing){if(JSON.stringify(existing)!==JSON.stringify(report))throw new Error('Содержимое существующей версии изменилось: нужна новая revision');return{ledger:structuredClone(ledger),changes:[],duplicate:true}}
  const before=new Map(reconcileRnp(ledger).map(c=>[keyOf(c),c])),next=structuredClone(ledger);
  next.reports.push(report);
  const after=new Map(reconcileRnp(next).map(c=>[keyOf(c),c])),changes=[];
  for(const cellKey of new Set([...before.keys(),...after.keys()])){
    const old=before.get(cellKey)??null,current=after.get(cellKey)??null;
    if(JSON.stringify(old)===JSON.stringify(current))continue;
    changes.push({sequence:next.audit.length+changes.length+1,at:new Date(at).toISOString(),cell:JSON.parse(cellKey),before:old,after:current,difference:typeof old?.value==='number'&&typeof current?.value==='number'?Number((current.value-old.value).toPrecision(14)):null,reason:current?.source==='weekly'?(old?.source==='weekly'?'weekly-correction':'weekly-confirmation'):'daily-update'});
  }
  next.audit.push(...changes);
  next.imports.push({sequence:next.imports.length+1,at:new Date(at).toISOString(),marketplace:report.marketplace,accountId:report.accountId,reportId:report.id,source:report.source,revision:report.revision,effectiveChanges:changes.length});
  return{ledger:next,changes,duplicate:false};
}
