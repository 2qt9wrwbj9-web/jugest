import fs from 'node:fs';
const s=fs.readFileSync(new URL('../ana-launcher.js', import.meta.url),'utf8');
for(const x of ['NORMAL_COOLDOWN_KEY','NORMAL_COOLDOWN_MS','planned>=30&&attempted>0','setNormalCooldown({planned']){
  if(s.includes(x)) throw new Error('retired v4.1.1 fixed cooldown still remains: '+x);
}
if(!s.includes("const ACCESS_LIMIT=30")||!s.includes("const ACCESS_WINDOW_MS=30*60*1000")) throw new Error('v4.1.2 rolling replacement missing');
console.log('v4.1.1 fixed cooldown retired: ok');
