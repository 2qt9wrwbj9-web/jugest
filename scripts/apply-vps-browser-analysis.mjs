import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'app-v510.js');
let source=fs.readFileSync(target,'utf8');
let changes=0;

function replaceLiteral(name,from,to){
  if(source.includes(to))return;
  const first=source.indexOf(from);
  if(first<0)throw new Error(`${name}: expected source text not found`);
  if(source.indexOf(from,first+from.length)>=0)throw new Error(`${name}: source text is not unique`);
  source=source.slice(0,first)+to+source.slice(first+from.length);
  changes++;
}

function replaceRegex(name,pattern,to){
  if(source.includes(to))return;
  const matches=[...source.matchAll(new RegExp(pattern.source,pattern.flags.includes('g')?pattern.flags:pattern.flags+'g'))];
  if(matches.length!==1)throw new Error(`${name}: expected exactly one match, got ${matches.length}`);
  source=source.replace(pattern,to);
  changes++;
}

replaceLiteral(
  'VPS analytics module loader',
  "const UI_KEY='jugest:v510:ui';\nconst MOTION=Object.freeze({fast:160,view:220,sheet:320});",
  "const UI_KEY='jugest:v510:ui';\nlet vpsAnalyticsClientPromise=null;\nfunction getVpsAnalyticsClient(){\n  if(!vpsAnalyticsClientPromise)vpsAnalyticsClientPromise=import('./vps-browser-analytics.mjs').then(module=>module.createVpsAnalyticsClient());\n  return vpsAnalyticsClientPromise;\n}\nconst MOTION=Object.freeze({fast:160,view:220,sheet:320});"
);

replaceRegex(
  'analysis job runner injection',
  /const analysisJob=\{status:'idle'[\s\S]*?\n\};\nfunction buildHomeStatus/,
  `const analysisJob={status:'idle',shop:'',progress:0,result:null,completedAt:0,listeners:new Set(),promise:null,
  emit(){for(const fn of this.listeners)fn(this)},
  start(bridge,shop,options,runner){
    if(this.status==='running')return this.promise;
    if(!shop)return Promise.resolve(null);
    if(typeof runner!=='function')throw new TypeError('analysis runner is required');
    Object.assign(this,{status:'running',shop,options:Object.freeze({...options}),progress:0,stage:'VPS解析結果を取得中',result:null,completedAt:0});
    this.emit();
    this.promise=(async()=>{
      try{const result=await runner(bridge,shop,this.options,(fraction,stage)=>{this.progress=Math.max(this.progress,Math.min(99,Math.round(fraction*100)));this.stage=stage||'解析中';this.emit()});
        if(!result||result.error)throw Error(result?.error||'解析結果を取得できませんでした');
        Object.assign(this,{status:'completed',result,progress:100,completedAt:Date.now(),stage:'解析完了'});
      }catch(e){Object.assign(this,{status:'failed',result:{error:String(e?.message||e),code:String(e?.code||'')},stage:'解析結果を取得できませんでした'})}
      this.emit();return this.result;
    })();return this.promise;
  }
};
function buildHomeStatus`
);

replaceLiteral(
  'ordinary store-analysis navigation',
  "if(action==='store-analysis'){this.state.analysisResult=analysisJob.shop===this.state.activeStore?analysisJob.result:null;this.state.analysisHistoryOpen=null;this.navigate('store','analysis');this.loadAnalysisHistory();return}",
  "if(action==='store-analysis'){this.state.analysisResult=analysisJob.shop===this.state.activeStore?analysisJob.result:null;this.state.analysisHistoryOpen=null;this.navigate('store','analysis');this.loadVpsStoreAnalysis();this.loadAnalysisHistory();return}"
);

replaceLiteral(
  'VPS-backed store analysis runner',
  "  async runStoreAnalysis(){const b=this.bridge();if(!b)return;await analysisJob.start(b,this.state.activeStore,this.state.analysisOpts);if(this.state.activeStore===analysisJob.shop)await this.loadAnalysisHistory(false);this.render()}",
  `  async loadVpsStoreAnalysis(){
    const b=this.bridge(),activeShop=this.state.activeStore;if(!b||!activeShop)return null;
    await analysisJob.start(b,activeShop,this.state.analysisOpts,async(bridge,_shop,options,onProgress)=>{
      try{
        const client=await getVpsAnalyticsClient(),snapshot=await client.getDefaultAnalysis(activeShop);
        if(!snapshot?.analysis){
          const status=await client.getStatus(activeShop).catch(()=>null),phase=String(status?.status?.status||'');
          const error=new Error(phase==='pending'?'VPSで店舗解析を実行中です。少し後で更新してね。':'VPS解析結果がまだありません。Collector送信後の自動解析完了を確認してね。');
          error.code=phase==='pending'?'vps_analysis_pending':'vps_analysis_unavailable';throw error;
        }
        return snapshot.analysis;
      }catch(error){
        if(global.JUGEST_LOCAL_ANALYSIS_FALLBACK===true)return bridge.runStoreAnalysis(activeShop,options,onProgress);
        throw error;
      }
    });
    if(this.state.activeStore===analysisJob.shop)this.state.analysisResult=analysisJob.result;
    this.render();return this.state.analysisResult;
  }
  async runStoreAnalysis(){return this.loadVpsStoreAnalysis()}`
);

if(changes){
  fs.writeFileSync(target,source);
  console.log(`patched app-v510.js (${changes} replacements)`);
}else{
  console.log('app-v510.js already has VPS browser analysis patch');
}
