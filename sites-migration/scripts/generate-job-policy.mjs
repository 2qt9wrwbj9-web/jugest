import{readFileSync,writeFileSync}from'node:fs';
const source=readFileSync(new URL('../upstream/vps/src/coordinator.mjs',import.meta.url),'utf8');
const start=source.indexOf('  _retryAt(job,at){'),end=source.indexOf('\n  _persistMetric(',start);
if(start<0||end<0)throw Error('fixed coordinator retry anchor missing');
const method=source.slice(start,end).trim().replace('_retryAt(job,at){','export function originalRetryAt(job,at){');
writeFileSync(new URL('../lib/analysis/generated-job-policy.mjs',import.meta.url),'// Exact retry arithmetic from fixed production coordinator.\nfunction plusMs(isoText,ms){return new Date(new Date(isoText).getTime()+ms).toISOString()}\n'+method+'\n');
