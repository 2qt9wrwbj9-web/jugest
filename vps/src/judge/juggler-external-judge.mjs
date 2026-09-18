import {runExistingJugglerJudgementBatch} from '../analysis/runtime-adapter.mjs';

export const JUGGLER_MACHINE_KEYS=Object.freeze(['my','im','go','fk','hp','gg','mr','um']);

const MACHINE_NAMES=Object.freeze({
  my:'マイジャグV',im:'ネオアイムジャグラー',go:'ゴーゴージャグラー3',fk:'ファンキージャグラー2',
  hp:'ハッピージャグラーVⅢ',gg:'ジャグラーガールズSS',mr:'ミスタージャグラー',um:'ウルトラミラクルジャグラー'
});

export function jugglerMachineName(key){return MACHINE_NAMES[key]??null}

function posteriorSummary(q){
  return {
    expectedSetting:q.reduce((sum,value,index)=>sum+value*(index+1),0),
    p4:(q[3]||0)+(q[4]||0)+(q[5]||0),
    p5:(q[4]||0)+(q[5]||0),
    p6:q[5]||0
  };
}

function decorate(input,judged){
  if(!judged)return null;
  const machine=String(input?.machine??'').trim(),games=+input?.games||0;
  const bb=Math.max(0,+input?.bb||0),rb=Math.max(0,+input?.rb||0);
  const hasDiff=input?.diff!==null&&input?.diff!==undefined&&input?.diff!==''&&Number.isFinite(+input.diff);
  const q=Array.from(judged.q,Number);
  return {
    machine,machineName:jugglerMachineName(machine),games,bb,rb,diff:hasDiff?+input.diff:null,q,method:judged.method,
    ...posteriorSummary(q),
    estimatedGrape:judged.estimatedGrape,estimatedGrapeCount:judged.estimatedGrapeCount,
    grapeCountLo:judged.grapeCountLo,grapeCountHi:judged.grapeCountHi,reverseWarn:!!judged.reverseWarn
  };
}

export async function judgeJugglerExternalBatch({rootDir,machines}={}){
  if(!Array.isArray(machines))throw new TypeError('machines must be an array');
  const judged=await runExistingJugglerJudgementBatch({rootDir,machines});
  return machines.map((input,index)=>decorate(input,judged[index]));
}

export async function judgeJugglerExternal(input={},options={}){
  const [result]=await judgeJugglerExternalBatch({rootDir:options.rootDir,machines:[input]});
  return result??null;
}

export const __test={MACHINE_NAMES,posteriorSummary};