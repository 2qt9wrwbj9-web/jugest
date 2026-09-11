const BRIDGE_ANCHOR=' getCollectorKey:()=>v510GetCollectorKey(),';
const BACKFILL_BRIDGE=' getVpsBackfillDays:()=>JSON.parse(JSON.stringify(externalDays)),';
const MODULE_TAG='<script type="module" src="./vps-ui-enhancements.mjs"></script>';

export function patchJugestIndexSource(input){
  let source=String(input??'');
  if(!source.includes(BACKFILL_BRIDGE)){
    if(!source.includes(BRIDGE_ANCHOR))throw new Error('JUGEST bridge anchor not found');
    source=source.replace(BRIDGE_ANCHOR,`${BRIDGE_ANCHOR}\n${BACKFILL_BRIDGE}`);
  }
  if(!source.includes(MODULE_TAG)){
    if(!/<\/body>/i.test(source))throw new Error('JUGEST body anchor not found');
    source=source.replace(/<\/body>/i,`${MODULE_TAG}\n</body>`);
  }
  return source;
}

export const __test={BRIDGE_ANCHOR,BACKFILL_BRIDGE,MODULE_TAG};
