from pathlib import Path
import json
root=Path('evidence/v14');rows=[];parity=[]
for d,m in [(90,106),(180,106),(240,106),(180,160)]:
 for mode in ['v13','optimized']:
  p=root/'logs'/f'full-{d}-{m}-{mode}.log';lines=p.read_text().splitlines();get=lambda prefix:json.loads(next(s[len(prefix):] for s in lines if s.startswith(prefix)));samples=[json.loads(s) for s in lines if s.startswith('{"stage":')];inv=[]
  for s in samples:
   if s['stage']=='handler:start' or not inv:inv.append({'ordinal':len(inv),'phase':s['phase'],'samples':[]})
   inv[-1]['samples'].append(s)
  for i in inv:i['observedUsedHeapMaxBytes']=max(x['usedSize'] for x in i['samples'])
  r=get('MEMORY ');r.update(io=get('IO '),calls=get('CALLS '),invocations=inv,allStageSamples=samples,log=str(p));rows.append(r)
 match=json.loads(next(s[6:] for s in (root/'logs'/f'parity-final-{d}-{m}.log').read_text().splitlines() if s.startswith('MATCH ')));parity.append(match)
 for a,b in [(rows[-2],rows[-1])]:
  for prefix in ['READ_RESULT ','STEP /advance ']:
   aLines=(root/'logs'/f'full-{d}-{m}-v13.log').read_text().splitlines();bLines=(root/'logs'/f'full-{d}-{m}-optimized.log').read_text().splitlines()
   if prefix=='READ_RESULT ':assert next(x for x in aLines if x.startswith(prefix))==next(x for x in bLines if x.startswith(prefix))
   else:
    aa=json.loads([x[len(prefix):] for x in aLines if x.startswith(prefix)][-1]);bb=json.loads([x[len(prefix):] for x in bLines if x.startswith(prefix)][-1]);assert aa['inputHash']==bb['inputHash'];assert aa['outputHash']==bb['outputHash']
repeat=[]
for p in sorted((root/'logs').glob('repeat-*-180-160-*.log')):
 lines=p.read_text().splitlines();found=[json.loads(s[7:]) for s in lines if s.startswith('MEMORY ')];assert len(found)==1;repeat.append({'log':str(p),**found[0]})
report={'method':'native workerd Inspector debugger stage sampling; old-space96MiB/semi4; not strict peak or total128MB enforcement. Node RSS not Worker isolate memory. Independent maxima not additive. Wall time includes debugger pauses and concurrent test workload, not CPU benchmark.','rows':rows,'repeats':repeat,'host128MbVerified':False,'peakReductionProven':False}
(root/'memory-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');(root/'model-comparison.json').write_text(json.dumps(parity,indent=2)+'\n')
parts=['# 保存版14 全工程メモリ検証\n\n'+report['method']+'\n\n受付→D1固定→日別R2保存→load/prefix→解析→canonical仮保存→照合/確定→stream再取得を含む。controlはGit保存版13のlib。v14は研究用option行の記録等のinfra差も含むので、差すべてをsingle参照解放の因果効果としない。\n\n| 規模 | v13使用heap観測最大MiB | v14 MiB | v13/v14 wall秒 | v14 D1 SQL | R2 get/put | R2 written bytes |\n|---|---:|---:|---|---:|---|---:|\n']
for i in range(0,len(rows),2):
 a,b=rows[i:i+2];parts.append(f"| {a['count']}×{a['machines']} | {a['maxObservedUsedHeapBytes']/2**20:.2f} | {b['maxObservedUsedHeapBytes']/2**20:.2f} | {sum(c['elapsedMs'] for c in a['calls']['calls'])/1000:.2f}/{sum(c['elapsedMs'] for c in b['calls']['calls'])/1000:.2f} | {b['io']['d1Statements']} | {b['io']['r2Gets']}/{b['io']['r2Puts']} | {b['io']['r2WrittenBytes']} |\n")
parts.append('\n180×160は同条件で追加2回ずつ計測。\n\n| run | mode | used MiB | backing MiB |\n|---|---|---:|---:|\n')
for r in repeat:parts.append(f"| {Path(r['log']).name} | {r['mode']} | {r['maxObservedUsedHeapBytes']/2**20:.2f} | {r['maxObservedBackingStorageBytes']/2**20:.2f} |\n")
parts.append('''\n結論：v13比の全工程ピーク低下は証明できなかった。最終runの各規模観測値は上表、同条件の追加runは次表を正本とする。GC/観測時点のばらつきを含み、参照寿命の短縮を128MB対応やピーク解消と呼ばない。

実装は、全候補評価後に使わなくなったg.machineGroupsとstoreGroups索引だけを解放。BHの全対象配列store/machine、p値/補正対象/順序/同点/最終sortは完全に維持。新しい候補分割・checkpoint・再計算は採用していない。全モデル/8中間値/最終payload hashは4/4一致。実装前後でR2 bytes/get/put/結果サイズは同一。v14の通常job option記録にD1 SQLが3文、API2呼出し、読取り2行/書込み1行増える。これは研究cycle option固定のためで、新memory checkpointの増加ではない。

single部分の母集団やBHを台分割で別集合にできない。実測上、単純な評価後解放だけではgroup構築時やv4 trainingの観測量を下げられない。追加の候補checkpointは効果/統合peakを証明するまで導入しない。次の検証は、共通scope/元候補順固定→各候補の評価→同じ全BH対象への補正→最終化の契約をpure kernelとして比較すること。1版をこの課題だけで費やさず、正式holdout/認証等へ進む停止条件を満たした。

usedSize/totalSize/backingStorageSize/embedderHeapUsedSizeをraw JSONへ別記。各requestのstage samplesも保存。ArrayBuffer全量、platform allocator、実Sites総量/CPU/同時request/課金は未測定。独立最大を足して総量にしない。旧13の89.52MiBは別runであり今回controlの88.27等と区別する。入力規模・履歴・数式・モデル探索範囲は削らない。正式PRE/holdoutの完全一致をこの現行予測試験から推測しない。
''')
(root/'MEMORY_REPORT.md').write_text(''.join(parts))
print('PASS4 exact model/stage comparisons; 8 full jobs +4 repeat jobs; peak improvement unproven')
