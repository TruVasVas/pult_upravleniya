// Stable internal snapshot contract. Real marketplace IDs must come from source catalogs.
export function validateInventorySnapshot(payload) {
  const fail = () => { throw new Error('Некорректный снимок остатков'); };
  if (!payload || payload.version !== 1 || !['demo', 'live'].includes(payload.mode) || !Array.isArray(payload.warehouses) || !Array.isArray(payload.items) || !Number.isFinite(Date.parse(payload.updatedAt)) || payload.warehouses.length > 1000 || payload.items.length > 100000) fail();
  const keys = new Map(), identities = new Set();
  for (const w of payload.warehouses) {
    if (!w || typeof w.key !== 'string' || !w.key || keys.has(w.key) || !['wb','ozon'].includes(w.marketplace) || typeof w.name !== 'string' || !w.name.trim() || !['FBW','FBO','FBS'].includes(w.fulfillment) || (w.externalId !== null && (typeof w.externalId !== 'string' || !w.externalId))) fail();
    if (payload.mode === 'live' && !w.externalId) fail();
    if (w.externalId) { const identity = `${w.marketplace}:${w.fulfillment}:${w.externalId}`; if (identities.has(identity)) fail(); identities.add(identity); }
    keys.set(w.key, w);
  }
  const records = new Set();
  for (const r of payload.items) {
    const w = keys.get(r?.warehouseKey);
    if (!w || r.marketplace !== w.marketplace || typeof r.article !== 'string' || !r.article.trim() || typeof r.name !== 'string' || !r.name.trim()) fail();
    for (const field of ['available','reserved','toCustomer','returnsInTransit']) if (!Number.isSafeInteger(r[field]) || r[field] < 0) fail();
    const key = JSON.stringify([r.warehouseKey,r.article]); if (records.has(key)) fail(); records.add(key);
  }
  // Allow only explicitly public inventory fields; discard unrelated source metadata.
  return {version:1,mode:payload.mode,updatedAt:payload.updatedAt,note:typeof payload.note === 'string' ? payload.note.slice(0,2000) : '',warehouses:payload.warehouses.map(w=>({key:w.key,marketplace:w.marketplace,externalId:w.externalId,name:w.name,fulfillment:w.fulfillment})),items:payload.items.map(r=>({warehouseKey:r.warehouseKey,marketplace:r.marketplace,article:r.article,name:r.name,available:r.available,reserved:r.reserved,toCustomer:r.toCustomer,returnsInTransit:r.returnsInTransit}))};
}
