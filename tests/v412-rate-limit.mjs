import fs from 'node:fs';
const s=fs.readFileSync(new URL('../ana-launcher.js', import.meta.url),'utf8');
const must=[
  "const VERSION='4.8.4'",
  "const PARSER_VERSION=4500",
  "const ACCESS_RATE_KEY='jugglerAnaAccessRate:v1'",
  "const ACCESS_RATE_COOKIE='jugglerAnaRateV1'",
  "const ACCESS_WINDOW_MS=15*60*1000",
  "const ACCESS_LIMIT=30",
  "function accessRateState(now=Date.now())",
  "async function waitForAnaAccessSlot()",
  "if(!opts.bypassRateLimit){await waitForAnaAccessSlot();recordAnaAccess()}const r=await fetch(url",
  "Domain=.ana-slo.com",
  "直近15分"
];
for(const x of must) if(!s.includes(x)) throw new Error('missing rolling-rate feature: '+x);
for(const x of ['NORMAL_COOLDOWN_KEY','NORMAL_COOLDOWN_MS','setNormalCooldown({planned','planned>=30&&attempted>0']) if(s.includes(x)) throw new Error('old fixed cooldown remains: '+x);
const W=15*60*1000,L=30;
const prune=(a,now)=>[...new Set(a.filter(t=>Number.isFinite(t)&&t>now-W&&t<=now+60000))].sort((x,y)=>x-y).slice(-L);
const state=(a,now)=>{const times=prune(a,now),count=times.length,nextAt=count?times[0]+W:0,wait=count>=L?Math.max(0,nextAt-now):0;return{count,wait}};
const hits=Array.from({length:30},(_,i)=>i*1000);
let st=state(hits,29000);
if(st.count!==30||st.wait!==871000) throw new Error('30-hit rolling window math broken: '+JSON.stringify(st));
st=state(hits,W);
if(st.count!==29||st.wait!==0) throw new Error('slot must reopen exactly at 15 minutes: '+JSON.stringify(st));
const retryHits=[...hits.slice(0,29),29500];
st=state(retryHits,29500);
if(st.count!==30||st.wait<=0) throw new Error('failed/retry request slot accounting model broken');
console.log('v4.8.4 rolling 30 accesses / 15 minutes: ok');
