const finiteOrNull=value=>typeof value==='number'&&Number.isFinite(value)?value:null;

function predictionKey(row){
  if(typeof row.key==='string'&&row.key.length>0)return row.key;
  if(row.machine===null||row.machine===undefined||row.tableNo===null||row.tableNo===undefined){
    throw new TypeError('prediction row requires an existing key or machine/table identity');
  }
  const machine=String(row.machine);
  const tableNo=String(row.tableNo);
  if(machine.length===0||tableNo.length===0){
    throw new TypeError('prediction row machine/table identity must not be empty');
  }
  return `${machine}|${tableNo}`;
}

function requiredFinite(row,field){
  const value=row[field];
  if(typeof value!=='number'||!Number.isFinite(value)){
    throw new TypeError(`prediction row ${field} must be a finite number`);
  }
  return value;
}

export function axisSignalsFromPredictionRow(row,registry){
  if(row===null||typeof row!=='object'||Array.isArray(row)){
    throw new TypeError('prediction row must be an object');
  }
  if(!registry||typeof registry.list!=='function'){
    throw new TypeError('an axis registry is required');
  }

  const axes={};
  for(const axis of registry.list()){
    axes[axis.id]=axis.availability==='finite-source-value'&&axis.sourceField!==null
      ?finiteOrNull(row[axis.sourceField])
      :null;
  }

  return Object.freeze({
    key:predictionKey(row),
    controlRank:requiredFinite(row,'rank'),
    controlScore:requiredFinite(row,'hybridScore'),
    fixedBonus:finiteOrNull(row.hybridValidatedBonus)??0,
    axes:Object.freeze(axes),
    actualES:finiteOrNull(row.actualES),
    actualP4:finiteOrNull(row.actualP4)
  });
}
