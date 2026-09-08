const frozenAliases=aliases=>Object.freeze([...aliases]);

const axisDefinition=definition=>Object.freeze({
  ...definition,
  aliases:frozenAliases(definition.aliases)
});

export const DEFAULT_AXIS_DEFINITIONS=Object.freeze([
  axisDefinition({
    id:'practical-v1',label:'Practical single evidence',version:1,approved:true,
    sourceId:'jugest-row:practicalSignal',sourceField:'practicalSignal',aliases:[],
    scope:'prediction-row',minHistory:0,availability:'finite-source-value',
    audit:'Existing practical single-evidence aggregate; never recomputed here.',
    correlationGroup:'practical',maxWeight:1
  }),
  axisDefinition({
    id:'model-v1',label:'Model/root',version:1,approved:true,
    sourceId:'jugest-row:modelSignal',sourceField:'modelSignal',aliases:[],
    scope:'prediction-row',minHistory:0,availability:'finite-source-value',
    audit:'Existing model/root aggregate; never recomputed here.',
    correlationGroup:'model',maxWeight:1
  }),
  axisDefinition({
    id:'strict-v1',label:'Strict calibrated',version:1,approved:true,
    sourceId:'jugest-row:strictSignal',sourceField:'strictSignal',aliases:[],
    scope:'prediction-row',minHistory:0,availability:'finite-source-value',
    audit:'Existing strict calibrated aggregate; never recomputed here.',
    correlationGroup:'strict',maxWeight:1
  }),
  axisDefinition({
    id:'calendar-v1',label:'Validated calendar',version:1,approved:false,
    sourceId:'jugest-row:validated-calendar',sourceField:null,aliases:[],
    scope:'prediction-row',minHistory:0,availability:'unavailable-phase-1',
    audit:'Descriptor only: unavailable pending point-in-time and overlap audit.',
    correlationGroup:'calendar-model',maxWeight:.20
  })
]);

const DEFAULT_CORRELATION_GROUPS=Object.freeze([
  Object.freeze({id:'practical'}),
  Object.freeze({id:'model'}),
  Object.freeze({id:'strict'}),
  Object.freeze({id:'calendar-model',maxWeight:.20})
]);

function isRecord(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}

function requireText(value,field,context){
  if(typeof value!=='string'||value.trim()===''){
    throw new TypeError(`${context} ${field} must be a non-empty string`);
  }
  return value;
}

function requireWeight(value,field,context){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1){
    throw new RangeError(`${context} ${field} must be a finite number from 0 to 1`);
  }
  return value;
}

function snapshotGroups(groups){
  if(!Array.isArray(groups))throw new TypeError('correlationGroups must be an array');
  const byId=new Map();
  for(const raw of groups){
    if(!isRecord(raw))throw new TypeError('correlation group metadata must be an object');
    const id=requireText(raw.id,'id','correlation group');
    if(byId.has(id))throw new TypeError(`duplicate correlation group id: ${id}`);
    const group={id};
    if(raw.maxWeight!==undefined)group.maxWeight=requireWeight(raw.maxWeight,'maxWeight',`correlation group ${id}`);
    byId.set(id,Object.freeze(group));
  }
  return byId;
}

function snapshotAxis(raw,groupById){
  if(!isRecord(raw))throw new TypeError('axis definition must be an object');
  const id=requireText(raw.id,'id','axis');
  requireText(raw.label,'label',`axis ${id}`);
  if(!Number.isInteger(raw.version)||raw.version<1){
    throw new TypeError(`axis ${id} version must be a positive integer`);
  }
  if(typeof raw.approved!=='boolean')throw new TypeError(`axis ${id} approved must be boolean`);
  requireText(raw.sourceId,'sourceId',`axis ${id}`);
  if(raw.sourceField!==null&&(typeof raw.sourceField!=='string'||raw.sourceField.trim()==='')){
    throw new TypeError(`axis ${id} sourceField must be a non-empty string or null`);
  }
  if(!Array.isArray(raw.aliases)||raw.aliases.some(alias=>typeof alias!=='string'||alias.trim()==='')){
    throw new TypeError(`axis ${id} aliases must be an array of non-empty strings`);
  }
  if(new Set(raw.aliases).size!==raw.aliases.length)throw new TypeError(`axis ${id} has duplicate aliases`);
  requireText(raw.scope,'scope',`axis ${id}`);
  if(!Number.isInteger(raw.minHistory)||raw.minHistory<0){
    throw new TypeError(`axis ${id} minHistory must be a non-negative integer`);
  }
  requireText(raw.availability,'availability',`axis ${id}`);
  requireText(raw.audit,'audit',`axis ${id}`);
  const correlationGroup=requireText(raw.correlationGroup,'correlationGroup',`axis ${id}`);
  if(!groupById.has(correlationGroup)){
    throw new TypeError(`axis ${id} references unknown correlation group: ${correlationGroup}`);
  }
  const maxWeight=requireWeight(raw.maxWeight,'maxWeight',`axis ${id}`);
  return Object.freeze({
    id,
    label:raw.label,
    version:raw.version,
    approved:raw.approved,
    sourceId:raw.sourceId,
    sourceField:raw.sourceField,
    aliases:frozenAliases(raw.aliases),
    scope:raw.scope,
    minHistory:raw.minHistory,
    availability:raw.availability,
    audit:raw.audit,
    correlationGroup,
    maxWeight
  });
}

function registryInput(input){
  if(input===undefined)return{
    definitions:DEFAULT_AXIS_DEFINITIONS,
    correlationGroups:DEFAULT_CORRELATION_GROUPS
  };
  if(Array.isArray(input))return{
    definitions:input,
    correlationGroups:DEFAULT_CORRELATION_GROUPS
  };
  if(!isRecord(input))throw new TypeError('registry input must be an axis array or registry options');
  return{
    definitions:input.definitions,
    correlationGroups:input.correlationGroups??DEFAULT_CORRELATION_GROUPS
  };
}

export function createAxisRegistry(input){
  const {definitions,correlationGroups}=registryInput(input);
  if(!Array.isArray(definitions))throw new TypeError('axis definitions must be an array');
  const groupById=snapshotGroups(correlationGroups);
  const byId=new Map();
  const axes=[];
  for(const raw of definitions){
    const axis=snapshotAxis(raw,groupById);
    if(byId.has(axis.id))throw new TypeError(`duplicate axis id: ${axis.id}`);
    byId.set(axis.id,axis);
    axes.push(axis);
  }

  const list=Object.freeze(axes);
  const approved=Object.freeze(axes.filter(axis=>axis.approved));
  const caps=Object.freeze(Object.fromEntries(
    [...groupById.values()]
      .filter(group=>group.maxWeight!==undefined)
      .map(group=>[group.id,group.maxWeight])
  ));

  return Object.freeze({
    get:id=>byId.get(id),
    has:id=>byId.has(id),
    list:()=>list,
    approved:()=>approved,
    groupCap:id=>caps[id]??null,
    groupCaps:()=>caps
  });
}
