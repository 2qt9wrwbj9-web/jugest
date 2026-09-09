import {createHash} from 'node:crypto';

const MIB=1024*1024;
let peakRssMiB=process.memoryUsage().rss/MIB;

function sample(){
  peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/MIB);
  process.send?.({type:'heartbeat',rssMiB:peakRssMiB});
}

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

async function main(){
  const encoded=process.argv[2];
  if(!encoded)throw new Error('missing job descriptor');
  const descriptor=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
  const payload=descriptor.payload??{};
  const sleepMs=Number.isFinite(payload.sleepMs)?Math.max(0,Math.floor(payload.sleepMs)):0;
  const allocateMiB=Number.isFinite(payload.allocateMiB)?Math.max(0,Math.floor(payload.allocateMiB)):0;
  if(allocateMiB>1024)throw new RangeError('synthetic allocation too large');
  const held=[];
  for(let i=0;i<allocateMiB;i+=1){
    held.push(Buffer.alloc(MIB,1));
    if((i+1)%16===0)sample();
  }
  sample();
  if(sleepMs>0)await sleep(sleepMs);
  sample();
  const resultHash=createHash('sha256').update(String(payload.resultSeed??descriptor.id)).digest('hex');
  process.send?.({type:'complete',peakRssMiB,resultHash});
  void held;
}

main().then(()=>process.exit(0)).catch(error=>{
  peakRssMiB=Math.max(peakRssMiB,process.memoryUsage().rss/MIB);
  process.send?.({type:'error',peakRssMiB,errorClass:'synthetic_error',message:String(error?.message??error)},()=>process.exit(1));
  if(!process.connected)process.exit(1);
});
