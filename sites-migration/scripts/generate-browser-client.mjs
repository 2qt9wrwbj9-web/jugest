import{readFileSync,writeFileSync}from'node:fs';
let source=readFileSync(new URL('../upstream/vps-browser-analytics.mjs',import.meta.url),'utf8');
for(const[a,b]of[["  piaOnly=false\n","  piaOnly=false,\n  cookieAuth=false\n"],["if(!receiver&&!cookieRead)throw","if(!receiver&&!cookieRead&&!cookieAuth)throw"],["    async getStatus(shop){","    async getAnalysisHistory(shop){const store=await resolveStore(shop);return request(`/stores/${encodeURIComponent(store.id)}/analysis/history`);},\n    async getStatus(shop){"]]){if(!source.includes(a))throw Error('source anchor missing');source=source.replace(a,b)}
const methods=`
    async getActiveStoreReadById(id){return request(\`/stores/\${encodeURIComponent(id)}/research/store-read\`)},
    async listAnalysisJobsById(id){return request(\`/stores/\${encodeURIComponent(id)}/analysis/jobs\`)},
    async startAnalysisJobById(id,input){return request(\`/stores/\${encodeURIComponent(id)}/analysis/jobs\`,{method:'POST',body:JSON.stringify(input)})},
    async advanceAnalysisJobById(id,jobId){return request(\`/stores/\${encodeURIComponent(id)}/analysis/jobs/\${jobId}/advance\`,{method:'POST',body:'{}'})},
    async getAnalysisJobById(id,jobId){return request(\`/stores/\${encodeURIComponent(id)}/analysis/jobs/\${jobId}\`)},
    async getAnalysisJobResultById(id,jobId){return request(\`/stores/\${encodeURIComponent(id)}/analysis/jobs/\${jobId}/result\`)},
`;
source=source.replace('    async listStores(){',methods+'    async listStores(){');
writeFileSync(new URL('../lib/generated-browser-client.mjs' ,import.meta.url),'// Original client with explicit cookie transport and analysis receipt read. Server authorization remains mandatory.\n'+source);
