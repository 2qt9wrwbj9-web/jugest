import{getActiveStoreModel as sourceGetActive}from'../upstream/vps/src/research/store-read-output.mjs';
// One identical D1 SELECT; reuse the source's defensive JSON/number mapping.
export function activeModelView(row,storeId){return sourceGetActive({prepare(){return{get(){return row}}}},{storeId})}
export async function getActiveStoreModel(db,{storeId}){const id=String(storeId??'').trim();if(!id)throw TypeError('storeId is required');return activeModelView(await db.prepare('SELECT * FROM active_store_models WHERE store_id=?').bind(id).first(),id)}
