import{readFileSync,writeFileSync}from'node:fs';
const source=readFileSync(new URL('../upstream/vps/src/research/pre-v2/trial-store.mjs',import.meta.url),'utf8');
const start=source.indexOf('function requireText('),end=source.indexOf('function updateTrialRow(');if(start<0||end<0)throw Error('fixed PRE helper anchors missing');
writeFileSync(new URL('../lib/analysis/generated-pre-trial-kernel.mjs',import.meta.url),"// Exact validation/identity/row/evidence helpers extracted from the fixed SQLite trial store.\nimport{canonicalJson,hashCanonical}from'../../upstream/vps/src/canonical-json.mjs';\n"+source.slice(start,end)+"\nexport{requireText,requireTrialNumber,requireIsoTimestamp,normalizeDay,normalizeOutcomeRows,requireTrialShape,rowToRecord,trialKey,sameImmutableIdentity,evidenceForTrial};\n");

const prediction=readFileSync(new URL('../upstream/vps/src/research/pre-v2/formal-prediction-store.mjs',import.meta.url),'utf8'),a=prediction.indexOf('function rowToPrediction('),b=prediction.indexOf('export function loadFormalPrediction(');if(a<0||b<0)throw Error('fixed prediction row anchors missing');
writeFileSync(new URL('../lib/analysis/generated-pre-prediction-view.mjs',import.meta.url),'// Exact source formal prediction row mapping.\n'+prediction.slice(a,b)+'\nexport{rowToPrediction};\n');
