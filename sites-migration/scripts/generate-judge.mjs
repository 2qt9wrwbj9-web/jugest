import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Extract the frozen production implementation verbatim. In particular, no
// probability table or calculation is independently reimplemented here.
const root=fileURLToPath(new URL('../',import.meta.url));
const read=rel=>readFileSync(path.join(root,'upstream',rel),'utf8');
const html=read('index.html');
const mcp=read('vps/src/mcp-handler.mjs');
const external=read('vps/src/judge/juggler-external-judge.mjs');
function section(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  if(a<0||b<0||source.indexOf(start,a+start.length)!==-1)throw new Error(`JUGEST source anchor missing or ambiguous: ${start}`);
  return source.slice(a,b);
}
const model=section(html,'const rare=','\nconst HANA=window.HanaJudge;');
const styles=section(html,'function styleRates(', '\nfunction styleOptions(');
const norm=section(html,'function norm(', '\n\n/* legacy UI removed: render */');
const reverse=section(html,'function logBonus(', '\n\n\n/* legacy UI removed: revcalc */');
const safeNorm=section(html,'function safeNorm(', '\nfunction expectedSetting(');
const judge=section(html,'function externalBonusJudgeQ(', '\n// Independent observed-data judgement');
const decorated=section(external,'export const JUGGLER_MACHINE_KEYS=', '\nexport async function judgeJugglerExternalBatch(');
const mcpJudge=section(mcp,'function finite(value)', '\nfunction listStores(');
const version=mcp.match(/const JUDGE_VERSION='([^']+)'/);
if(!version)throw new Error('JUGEST judge version not found');

const output=`// Generated from upstream fixed production source; do not edit by hand.\n`+
`const globalThis={};\n${read('machine-names.js')}\n${read('judgement-model.js')}\n`+
`${model}\nconst HANA=null;\nconst HANA_MACHINE_KEYS=['houou','king','dragon','star','newkingv'];\n`+
`${styles}\n${norm}\n${reverse}\n${safeNorm}\n${judge}\n${decorated}\n`+
`async function judgeJugglerExternal(input={}) {\n`+
` const machine=String(input?.machine??'').trim(),games=Number(input?.games)||0;\n`+
` const bb=Math.max(0,Number(input?.bb)||0),rb=Math.max(0,Number(input?.rb)||0);\n`+
` const hasDiff=input?.diff!==null&&input?.diff!==undefined&&input?.diff!==''&&Number.isFinite(Number(input.diff));\n`+
` const raw=externalJudge(machine,games,bb,rb,hasDiff?Number(input.diff):null);\n`+
` if(!raw)return null; const q=Array.isArray(raw.q)?Array.from(raw.q,Number):null;\n`+
` if(!q||!q.length||q.some(value=>!Number.isFinite(value)))return null;\n`+
` return decorate(input,{q,method:String(raw.method||''),estimatedGrape:Number(raw.estimatedGrape),estimatedGrapeCount:Number(raw.estimatedGrapeCount),grapeCountLo:Number(raw.grapeCountLo),grapeCountHi:Number(raw.grapeCountHi),reverseWarn:!!raw.reverseWarn});\n}\n`+
`const MACHINE_KEYS=new Set(JUGGLER_MACHINE_KEYS);\nconst JUDGE_VERSION=${JSON.stringify(version[1])};\n${mcpJudge}\n`;
mkdirSync(path.join(root,'lib'),{recursive:true});
writeFileSync(path.join(root,'lib/generated-judge.mjs'),output.trimEnd()+'\n');
const {__test}=await import('../upstream/vps/src/mcp-handler.mjs');
writeFileSync(path.join(root,'lib/generated-mcp-tool.mjs'),
  `// Generated from the fixed production MCP tool definition.\nexport default ${JSON.stringify(__test.TOOL_DEFS.find(tool=>tool.name==='judge_machines'),null,2)};\n`);
console.log('Generated judge module from fixed JUGEST source.');
