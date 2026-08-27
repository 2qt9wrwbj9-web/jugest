import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('./index.html','utf8');
const pub=fs.readFileSync('./public/index.html','utf8');
assert.equal(html,pub,'root/public index must be byte-identical');
assert.match(html,/ジャグラー設定判別 v4\.7\.8/);
assert.match(html,/ranking:\{version:4,separatedFromStrict:true,singleFirst:true,hybrid:true,hybridWeights:\{\.\.\.hybridWeights,validatedCalendarMax:\.05\},hybridOptimization/);
assert.match(html,/function v4HybridApplyWeights\(rawRows,weights\)/);
assert.match(html,/weights\.practical\*row\.practicalSignal\+weights\.model\*row\.modelSignal\+weights\.strict\*row\.strictSignal/);
const fs0=html.indexOf('function bruteForecastRows(result,targetDate){'), fs1=html.indexOf('\nfunction bruteRenderForecast(){',fs0); assert.ok(fs0>0&&fs1>fs0); const forecastFn=html.slice(fs0,fs1);
assert.match(forecastFn,/v4PredictStore\(shop,targetDate,externalDays\)/);
assert.doesNotMatch(forecastFn,/bruteSingleRankForRow\(/,'screen must not independently re-rank single evidence');
assert.match(html,/rows=bruteForecastRows\(r,target\),top=rows\.slice\(0,30\)/,'screen should preserve unified order without a second candidate filter');
assert.match(html,/targets:pred\?\.rows\.slice\(0,10\)/,'AI JSON must use the same final pred.rows order');
assert.match(html,/hybridComponents:\{practical:r\.practicalSignal,model:r\.modelSignal,strict:r\.strictSignal/);
assert.match(html,/統合内訳 実用/);
console.log('PASS v4.7.8 hybrid ranking: screen + JSON share one final order');
