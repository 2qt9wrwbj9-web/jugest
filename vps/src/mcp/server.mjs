import {createMcpHandler,McpServer} from '@modelcontextprotocol/server';
import {localhostHostValidation,localhostOriginValidation,toNodeHandler} from '@modelcontextprotocol/node';
import * as z from 'zod/v4';
import {createJugestMcpTools} from './tools.mjs';

const MACHINE_ROW_SCHEMA=z.object({
  tableNo:z.union([z.string(),z.number()]).optional(),
  machine:z.string().min(1).max(80),
  games:z.number().int().positive(),
  bb:z.number().int().nonnegative(),
  rb:z.number().int().nonnegative(),
  diff:z.number().int().optional()
}).strict();

const JUDGE_MACHINES_SCHEMA=z.object({
  machines:z.array(MACHINE_ROW_SCHEMA).min(1).max(200)
}).strict();

export function createJugestMcpServer({rootDir,judgeMachines}={}){
  const tools=createJugestMcpTools({rootDir,judgeMachines});
  const server=new McpServer({name:'jugest',version:'0.1.0'});

  server.registerTool('judge_machines',{
    title:'Judge observed JUGEST machine data',
    description:'Judge 1-200 machines using observed current machine data only. PRE, store tendencies, store identity and historical priors are not automatically used or fused into this posterior.',
    inputSchema:JUDGE_MACHINES_SCHEMA,
    annotations:{readOnlyHint:true,idempotentHint:true,openWorldHint:false,destructiveHint:false}
  },async({machines})=>{
    const result=await tools.callTool('judge_machines',{machines});
    return {
      content:[{type:'text',text:JSON.stringify(result)}],
      structuredContent:result
    };
  });

  return server;
}

export function createJugestMcpNodeHandler({rootDir,judgeMachines}={}){
  const handler=createMcpHandler(()=>createJugestMcpServer({rootDir,judgeMachines}),{responseMode:'json'});
  const nodeHandler=toNodeHandler(handler);
  const validateHost=localhostHostValidation();
  const validateOrigin=localhostOriginValidation();

  const wrapped=async(req,res)=>{
    if(!validateHost(req,res)||!validateOrigin(req,res))return;
    return await nodeHandler(req,res);
  };
  wrapped.close=()=>handler.close();
  return wrapped;
}

export const __test={MACHINE_ROW_SCHEMA,JUDGE_MACHINES_SCHEMA};
