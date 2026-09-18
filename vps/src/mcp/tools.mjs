import {runExistingMachineJudgementBatch} from '../analysis/runtime-adapter.mjs';

const MACHINE_ROW_SCHEMA=Object.freeze({
  type:'object',
  additionalProperties:false,
  required:['machine','games','bb','rb'],
  properties:{
    tableNo:{type:'string'},
    machine:{type:'string',minLength:1},
    games:{type:'number',exclusiveMinimum:0},
    bb:{type:'number',minimum:0},
    rb:{type:'number',minimum:0},
    diff:{type:'number'}
  }
});

const JUDGE_MACHINES_TOOL=Object.freeze({
  name:'judge_machines',
  title:'Judge observed machine data',
  description:'Judge 1-200 machines from observed current machine data only. This tool does not automatically use PRE, store tendencies, store identity, or historical priors.',
  inputSchema:Object.freeze({
    type:'object',
    additionalProperties:false,
    required:['machines'],
    properties:{
      machines:{type:'array',minItems:1,maxItems:200,items:MACHINE_ROW_SCHEMA}
    }
  })
});

function validateTopLevelArgs(args,allowed){
  if(!args||typeof args!=='object'||Array.isArray(args))throw new TypeError('tool arguments must be an object');
  for(const key of Object.keys(args))if(!allowed.has(key))throw new TypeError(`unsupported argument: ${key}`);
}

export function createJugestMcpTools({rootDir,judgeMachines=runExistingMachineJudgementBatch}={}){
  if(!rootDir)throw new TypeError('rootDir is required');
  if(typeof judgeMachines!=='function')throw new TypeError('judgeMachines must be a function');

  return Object.freeze({
    listTools(){return [JUDGE_MACHINES_TOOL]},
    async callTool(name,args={}){
      if(name!=='judge_machines')throw new TypeError(`unknown tool: ${name}`);
      validateTopLevelArgs(args,new Set(['machines']));
      if(!Array.isArray(args.machines))throw new TypeError('machines must be an array');
      return await judgeMachines({rootDir,machines:args.machines});
    }
  });
}

export const __test={JUDGE_MACHINES_TOOL,MACHINE_ROW_SCHEMA,validateTopLevelArgs};
