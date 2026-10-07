#!/usr/bin/env python3
"""Offline audit of archived public PIA fixtures; no network or database access."""
import json, math, statistics, collections, hashlib, pathlib, datetime, argparse, gzip
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=pathlib.Path,required=True)
parser.add_argument('--fixtures',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent.parent/'tests'/'fixtures'/'pachinko')
args=parser.parse_args()
BASE=args.output.resolve()
if any(BASE==p or p in BASE.parents for p in [pathlib.Path('/var/lib/jugest'),pathlib.Path('/opt/jugest')]):
 parser.error('production paths are prohibited')
BASE.mkdir(parents=True,exist_ok=True)
PATHS={'latest':args.fixtures/'2026-10-07-ranking.json.gz','old':args.fixtures/'2026-10-05-ranking.json.gz','same_day_earlier':args.fixtures/'2026-10-07-earlier-ranking.json.gz','oct6_ooumi':args.fixtures/'2026-10-06-ranking.json.gz'}
RAW={k:gzip.decompress(p.read_bytes()) for k,p in PATHS.items()}
MODELS={'ooumi':('00021','Ｐ大海物語５スペシャルＡＬＴＡ'),'ghoul399':('00022','ｅ東京喰種Ｗ'),'ghoul999':('00406','ｅ東京喰種ＭＷ')}
RAWKEYS=['store_id','machine_no','name','sis_machine_code','store_machine_id','special','start','final_start','special_1','special_2','special_2d','special_out','special_safe','out','safe','difference']
STATEKEYS=['special','special_1','special_2','special_2d','special_out','special_safe']
THRESHOLDS=[1,50,100,200,500,1000,1500]
D={k:json.loads(b) for k,b in RAW.items()}
def canon(r): return json.dumps({k:r[k] for k in RAWKEYS},ensure_ascii=False,sort_keys=True,separators=(',',':'))
def sha(b): return hashlib.sha256(b).hexdigest()
def select(rows,m): return [r for r in rows if (r['sis_machine_code'],r['name'])==MODELS[m]]
def normal_net(r): return r['out']-r['special_out']-r['safe']+r['special_safe']
def no_state(r): return all(r[k]==0 for k in STATEKEYS)
def div(x,y): return x/y if y else None
def dist(v):
 v=sorted(v); n=len(v)
 if not n:return {'n':0}
 def q(p):
  i=(n-1)*p; j=int(i); return v[j]+(v[min(j+1,n-1)]-v[j])*(i-j)
 return {'n':n,'sum':sum(v),'mean':statistics.mean(v),'sd':statistics.stdev(v) if n>1 else None,'min':v[0],'p05':q(.05),'p25':q(.25),'p50':q(.5),'p75':q(.75),'p95':q(.95),'max':v[-1]}
def matrix_inv(a):
 n=len(a); z=[list(map(float,a[i]))+[float(i==j) for j in range(n)] for i in range(n)]
 for i in range(n):
  piv=max(range(i,n),key=lambda j:abs(z[j][i]))
  if abs(z[piv][i])<1e-10:return None
  z[i],z[piv]=z[piv],z[i]; v=z[i][i]; z[i]=[x/v for x in z[i]]
  for j in range(n):
   if j!=i:
    v=z[j][i]; z[j]=[z[j][k]-v*z[i][k] for k in range(2*n)]
 return [r[n:] for r in z]
def sandwich(inv,meat,factor):
 p=len(inv)
 return [[factor*sum(inv[i][a]*meat[a][b]*inv[b][j] for a in range(p) for b in range(p)) for j in range(p)] for i in range(p)]
def fit(rows,features=('start',),intercept=True,fe=False,yfunc=normal_net):
 n=len(rows); groups=collections.defaultdict(list)
 for i,r in enumerate(rows):groups[r['store_machine_id']].append(i)
 out={'n':n,'clusters':len(groups),'features':list(features),'intercept_included':intercept and not fe,'machine_fixed_effects':fe}
 p=len(features)+(1 if intercept and not fe else 0)
 if n<=p or n<3:out['status']='insufficient_sample';return out
 xs=[[float(r[k]) for k in features] for r in rows]; ys=[float(yfunc(r)) for r in rows]
 absorbed=0
 if fe:
  absorbed=len(groups)
  for ix in groups.values():
   mx=[sum(xs[i][j] for i in ix)/len(ix) for j in range(len(features))]; my=sum(ys[i] for i in ix)/len(ix)
   for i in ix:xs[i]=[xs[i][j]-mx[j] for j in range(len(features))];ys[i]-=my
 elif intercept:xs=[[1.]+v for v in xs]
 df=n-p-absorbed
 if df<=0:out['status']='insufficient_degrees_of_freedom';return out
 xtx=[[sum(x[i]*x[j] for x in xs) for j in range(p)] for i in range(p)]
 inv=matrix_inv(xtx)
 if inv is None:out['status']='rank_deficient';return out
 xty=[sum(xs[k][i]*ys[k] for k in range(n)) for i in range(p)]
 beta=[sum(inv[i][j]*xty[j] for j in range(p)) for i in range(p)]
 res=[ys[k]-sum(xs[k][j]*beta[j] for j in range(p)) for k in range(n)]
 sse=sum(e*e for e in res); ym=sum(ys)/n; sst=sum((y-ym)**2 for y in ys)
 hom=[[inv[i][j]*sse/df for j in range(p)] for i in range(p)]
 meat=[[sum(xs[k][i]*xs[k][j]*res[k]**2 for k in range(n)) for j in range(p)] for i in range(p)]
 hc=sandwich(inv,meat,n/df)
 cluster=None
 informative_groups={k:ix for k,ix in groups.items() if any(abs(v)>1e-10 for i in ix for v in xs[i])}
 out['informative_clusters']=len(informative_groups)
 if fe and len(informative_groups)<2:out['cluster_inference_warning']='Fewer than two machines have within-machine variation; cluster SE is undefined.'
 if len(informative_groups)>1:
  scores=[[sum(xs[k][j]*res[k] for k in ix) for j in range(p)] for ix in informative_groups.values()]
  cm=[[sum(v[i]*v[j] for v in scores) for j in range(p)] for i in range(p)]
  g=len(informative_groups);cluster=sandwich(inv,cm,g/(g-1)*(n-1)/df)
 labels=(['intercept'] if intercept and not fe else [])+list(features)
 coefs={}
 for j,name in enumerate(labels):
  se=math.sqrt(max(0.,hom[j][j]));hcse=math.sqrt(max(0.,hc[j][j]));cse=math.sqrt(max(0.,cluster[j][j])) if cluster else None
  coefs[name]={'estimate':beta[j],'se_ols':se,'se_hc1':hcse,'se_cluster_machine':cse}
 out.update(status='ok',df_resid=df,r2_centered=1-sse/sst if sst else None,r2_uncentered=1-sse/sum(y*y for y in ys) if sum(y*y for y in ys) else None,rmse=math.sqrt(sse/df),coefficients=coefs)
 if 'start' in coefs:
  b=coefs['start']['estimate']; out['K_from_start_slope']=25/b if b>0 else None
  for mode in ['ols','hc1','cluster_machine']:
   se=coefs['start']['se_'+mode]
   if se is not None:
    out['K_se_delta_'+mode]=25*se/(b*b) if b else None
    lo=b-1.96*se;hi=b+1.96*se;out['K_ci95_normal_'+mode]=[25/hi,25/lo] if lo>0 else None
 return out
def pooled(rows):
 s=sum(r['start'] for r in rows);nn=sum(normal_net(r) for r in rows)
 return {'n':len(rows),'start_sum':s,'normal_net_sum_10balls':nn,'K_ratio_of_sums':div(25*s,nn),'start_min':min((r['start'] for r in rows),default=None),'start_max':max((r['start'] for r in rows),default=None)}
def regressions(rows):
 valid=[r for r in rows if r['start']>0 and normal_net(r)>0]
 subs={'all':valid,'hit0':[r for r in valid if r['special']==0],'strict_no_state':[r for r in valid if no_state(r)],'hit_positive':[r for r in valid if r['special']>0]}
 result={}
 for label,sub in subs.items():
  result[label]={}
  for t in THRESHOLDS:
   rr=[r for r in sub if r['start']>=t]
   result[label][str(t)]={'pooled':pooled(rr),'with_intercept':fit(rr),'through_origin':fit(rr,intercept=False),'within_machine':fit(rr,intercept=False,fe=True)}
 result['counter_adjusted_exploratory']={'ols':fit(valid,('start','special','special_2d','special_2')),'within_machine':fit(valid,('start','special','special_2d','special_2'),intercept=False,fe=True)}
 return result
def overview(rows):
 sums={k:sum(r[k] for r in rows) for k in RAWKEYS if k not in ['store_id','machine_no','store_machine_id','name','sis_machine_code']}
 active=[r for r in rows if r['start']>0 and normal_net(r)>0]
 ms=collections.Counter(r['machine_no'] for r in rows)
 no=[r for r in rows if no_state(r)]
 hit0=[r for r in rows if r['special']==0]
 charge=[r for r in rows if r['special']>0 and r['special_2']==0 and r['special_2d']==0]
 return {'rows':len(rows),'machine_nos':sorted(ms),'store_machine_ids':sorted(set(r['store_machine_id'] for r in rows)),'records_per_machine':dict(sorted(ms.items())),'records_per_machine_hist':dict(collections.Counter(ms.values())),'distinct_fingerprints':len(set(canon(r) for r in rows)),'duplicate_multiplicity':len(rows)-len(set(canon(r) for r in rows)),'sums':sums,'start_over_special':div(sums.get('start',0),sums.get('special',0)),'candidate_all':pooled(rows),'candidate_positive_rows':pooled(active),'counts':{
 'difference_equals_10_safe_minus_out':sum(r['difference']==10*(r['safe']-r['out']) for r in rows),
 'special1_equals_special_plus_special2d':sum(r['special_1']==r['special']+r['special_2d'] for r in rows),
 'special2_equals_special2d':sum(r['special_2']==r['special_2d'] for r in rows),
 'final_start_gt_start':sum(r['final_start']>r['start'] for r in rows),'final_start_eq_start':sum(r['final_start']==r['start'] for r in rows),'final_start_zero':sum(r['final_start']==0 for r in rows),
 'special_out_gt_out':sum(r['special_out']>r['out'] for r in rows),'special_safe_gt_safe':sum(r['special_safe']>r['safe'] for r in rows),
 'normal_net_lt0':sum(normal_net(r)<0 for r in rows),'normal_net_eq0':sum(normal_net(r)==0 for r in rows),'normal_net_positive':sum(normal_net(r)>0 for r in rows),
 'zero_start_positive_net':sum(r['start']==0 and normal_net(r)>0 for r in rows),'hit0':len(hit0),'strict_no_state_including_zero_play':len(no),'strict_no_state_positive_play':sum(r['start']>0 and normal_net(r)>0 for r in no),'hit0_with_special_state':sum(not no_state(r) for r in hit0),'no_continuation_counter':len(charge)},
 'distributions':{**{k:dist([r[k] for r in rows]) for k in ['start','final_start','special','special_1','special_2','special_2d','special_out','special_safe']},
 'final_start_minus_start':dist([r['final_start']-r['start'] for r in rows]),
 'K_positive':dist([25*r['start']/normal_net(r) for r in active]),
 'normal_base_pct':dist([100*(r['safe']-r['special_safe'])/(r['out']-r['special_out']) for r in rows if r['out']>r['special_out']]),
 'special_payout_per_special1_balls':dist([10*r['special_safe']/r['special_1'] for r in rows if r['special_1']>0]),
 'special_net_per_special1_balls':dist([10*(r['special_safe']-r['special_out'])/r['special_1'] for r in rows if r['special_1']>0]),
 'no_continuation_gross_payout_per_special_balls':dist([10*r['special_safe']/r['special'] for r in charge]),
 'no_continuation_net_payout_per_special_balls':dist([10*(r['special_safe']-r['special_out'])/r['special'] for r in charge])},
 'totals_ratios':{'special_out_over_out':div(sums.get('special_out',0),sums.get('out',0)),'special_safe_over_safe':div(sums.get('special_safe',0),sums.get('safe',0)),'special_out_over_special_safe':div(sums.get('special_out',0),sums.get('special_safe',0)),'gross_payout_per_special1_balls':div(10*sums.get('special_safe',0),sums.get('special_1',0)),'net_payout_per_special1_balls':div(10*(sums.get('special_safe',0)-sums.get('special_out',0)),sums.get('special_1',0))},
 'no_state_start_bins':{str(lo)+'_'+str(hi):sum(lo<=r['start']<hi for r in no if r['start']>0) for lo,hi in [(1,50),(50,100),(100,200),(200,500),(500,1000),(1000,1500),(1500,1000000)]},
 'hit0_special_state_rows':[r for r in hit0 if not no_state(r)],
 'final_start_gt_start_examples':[r for r in rows if r['final_start']>r['start']][:5],
 'per_machine':[{'machine_no':m,**pooled([r for r in rows if r['machine_no']==m]),'no_state':pooled([r for r in rows if r['machine_no']==m and no_state(r) and r['start']>0]),'with_intercept':fit([r for r in rows if r['machine_no']==m and r['start']>0 and normal_net(r)>0])} for m in sorted(ms)]}
def delta(old,new,include_rows=False):
 a=collections.Counter(canon(r) for r in old); b=collections.Counter(canon(r) for r in new); plus=b-a;minus=a-b; common=a&b
 def records(c):return [json.loads(v) for v,n in c.items() for _ in range(n)]
 pr=records(plus);mr=records(minus)
 pn=collections.Counter(r['machine_no'] for r in pr);mn=collections.Counter(r['machine_no'] for r in mr)
 v={'old_n':len(old),'new_n':len(new),'common_multiset':sum(common.values()),'added_multiset':sum(plus.values()),'removed_multiset':sum(minus.values()),'added_per_machine':dict(sorted(pn.items())),'removed_per_machine':dict(sorted(mn.items())),'added_stats':pooled(pr),'removed_stats':pooled(mr),'all_old_id_count':len(set(r['store_machine_id'] for r in old)),'all_new_id_count':len(set(r['store_machine_id'] for r in new)),'shared_ids':len(set(r['store_machine_id'] for r in old)&set(r['store_machine_id'] for r in new))}
 v['added_fingerprint_multiset']={sha(k.encode()):n for k,n in plus.items()}
 v['removed_fingerprint_multiset']={sha(k.encode()):n for k,n in minus.items()}
 if include_rows:v.update(added_raw_records=pr,removed_raw_records=mr)
 return v
R={'created_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'audit_version':2,'scope':'PIA大船 store35 P; exact sis_machine_code AND fullwidth name; no ① variants','formulas':{'normal_net_10ball_units':'(out-special_out)-(safe-special_safe)','K_candidate':'25*start/normal_net_10ball_units','regression':'normal_net_10ball_units = intercept + slope*start [+ counter terms]; K=25/slope','strict_no_state':'all of special,special_1,special_2,special_2d,special_out,special_safe equal zero; regressions require start>0 and normal_net>0','CI_note':'OLS, HC1 and machine-cluster SE supplied; CI uses asymptotic normal 1.96 and ignores counter-semantic uncertainty. Sparse clusters/selected no-hit samples are not independent calibration.'},'snapshots':{},'comparisons':{},'models':{},'date_backfill':{}}
for k,d in D.items():
 R['snapshots'][k]={'path':str(PATHS[k]),'file_sha256':sha(RAW[k]),'rows':len(d['ranking']),'server_date_time':d.get('server_date_time'),'row_keys':sorted(set(x for r in d['ranking'] for x in r)),'missing_raw_keys_rows':sum(any(z not in r for z in RAWKEYS) for r in d['ranking'])}
 if 'provenance' in d:R['snapshots'][k]['provenance']=d['provenance']
for aa,bb in [('old','latest'),('same_day_earlier','latest')]:
 R['comparisons'][aa+'_to_'+bb]={'all_models':delta(D[aa]['ranking'],D[bb]['ranking']),**{m:delta(select(D[aa]['ranking'],m),select(D[bb]['ranking'],m),True) for m in MODELS}}
for aa,bb in [('old','oct6_ooumi'),('oct6_ooumi','latest')]:
 R['comparisons'][aa+'_to_'+bb]={'ooumi':delta(select(D[aa]['ranking'],'ooumi'),select(D[bb]['ranking'],'ooumi'),True)}
for m in MODELS:
 R['models'][m]={'identity':{'sis_machine_code':MODELS[m][0],'name':MODELS[m][1]},'latest':{'overview':overview(select(D['latest']['ranking'],m)),'regressions':regressions(select(D['latest']['ranking'],m))},'old':{'overview':overview(select(D['old']['ranking'],m)),'regressions':regressions(select(D['old']['ranking'],m))}}
R['models']['ooumi']['oct6']={'overview':overview(select(D['oct6_ooumi']['ranking'],'ooumi'))}
R['date_backfill']={}
for business_date,comp in [('2026-10-05','old_to_oct6_ooumi'),('2026-10-06','oct6_ooumi_to_latest')]:
 z=R['comparisons'][comp]['ooumi'];oneone=(len(z['added_per_machine'])==48 and len(z['removed_per_machine'])==48 and all(v==1 for v in z['added_per_machine'].values()) and all(v==1 for v in z['removed_per_machine'].values()) and z['shared_ids']==48)
 candidates=[{'business_date':business_date if oneone else None,'date_status':'derived' if oneone else 'unknown','date_assignment_method':'consecutive_snapshot_multiset_previous_day' if oneone else None,'raw_fingerprint_sha256':sha(canon(r).encode()),'raw_record':r,'K_candidate':25*r['start']/normal_net(r) if r['start']>0 and normal_net(r)>0 else None,'normal_net_10ball_units':normal_net(r),'calculation_status':'available' if r['start']>0 and normal_net(r)>0 else 'unusable_zero_play_or_nonpositive_net'} for r in sorted(z['added_raw_records'],key=lambda r:r['machine_no'])]
 R['date_backfill'][business_date]={'business_date':business_date if oneone else None,'date_status':'derived' if oneone else 'unknown','date_assignment_method':'consecutive_snapshot_multiset_previous_day' if oneone else None,'official_business_date_verified':False,'policy_source':'User requested prior-day derivation for adjacent snapshot dates with stable identities and exactly one added and one removed occurrence per machine. This is a policy-derived label, not an API date field.','candidate_source':comp,'one_add_one_remove_all_48_machines':oneone,'summary':z['added_stats'],'candidate_rows':candidates,'null_K_machine_nos':[v['raw_record']['machine_no'] for v in candidates if v['K_candidate'] is None],'indistinguishable_no_delta_machine_nos':[n for n in range(1097,1145) if not z['added_per_machine'].get(str(n),z['added_per_machine'].get(n,0)) or not z['removed_per_machine'].get(str(n),z['removed_per_machine'].get(n,0))],'limitations':['API rows contain no business_date.','Official snapshot refresh/rollover rule is not verified.','Multiset differences identify values/multiplicity; identical occurrences have no independent event identity.','A correction or current-day inclusion cannot be ruled out solely from these snapshots.']}
R['recommendations']={
 'status_definition':{'verified':'Operational raw-formula validation: algebraic identities and within-dataset checks passed; does not mean independently measured true rotation or officially documented field semantics.','provisional':'Raw formula yields plausible internally consistent estimates, but model/cohort-specific validation is sparse or systematic uncertainty remains.','unverified':'Insufficient direct evidence to accept a semantics/parameter mapping.','unusable':'Method cannot identify the requested quantity under available data; return null rather than force a value.'},
 'ooumi':{'raw_net_formula_status':'verified','validation_scope':'operational_internal','independent_measurement_status':'unverified','date_status':'derived_only_for_two_48row_delta_cohorts','reason':'1440/1440 algebraic identities; start/special=315.52 consistent with 319.6; strict no-state intercept K20.45 and within K20.68 converge with all-row K20.48/20.78. Short no-state pooled K19.15 is strongly affected by an approximately 80.9-ball intercept and selected short exposures. Counter-adjusted within slope K20.479 agrees with raw pooled20.477, without tuning parameters.','limitations':['168 positive strict-no-state records but only18 at start>=200 and1 at>=500.','No independently observed normal-spin/net-ball reference; payout-state partition semantics remain inferred.','Residual dependence on exposure length persists: all-row pooled K20.477 to20.637 at >=1500; with-intercept slopes20.78 to21.39. No scalar correction should be fitted to a known border.']},
 'ghoul399':{'raw_net_formula_status':'provisional','validation_scope':'new_cohort_24_records','independent_measurement_status':'unverified','reason':'New IDs/positions have24 records and zero no-hit controls. Current pooled15.688 vs all-intercept16.677 and within16.958. Historical28 no-state controls support the same formula mechanism (K17.01/17.03), but old720/new24 share no machine IDs; that calibration cannot be silently transferred.','limitations':['Only2 records per current machine.','Threshold >=1000 fit K17.99/within19.52 demonstrates unstable slope inference on narrow exposure ranges.','special includes combined symbol-plus-charge events; use199.95 expectation, not399.9 per special.']},
 'ghoul999':{'raw_net_formula_status':'provisional','validation_scope':'1440_record_internal_with_sparse_no_state_controls','independent_measurement_status':'unverified','reason':'All1440 identities hold; start/special348.527 matches combined349.919 expectation. Pooled32.399 remains32.410 atstart>=1500. No-state10 records yield pooled31.779/intercept32.162, supporting rates in30s without forced border calibration.','limitations':['Only10 strict-no-state records,7 machines; within variation comes from1 machine so machine-cluster SE is undefined.','No-state>=1000 only3 records; no>=1500 records.','Counters cannot uniquely separate symbol hits,charge and1500-ball constituent rounds.']},
 'all_models':{'fixed_average_payout_substitution':'unusable','special2_equals_rush_entry':'unverified','final_start_as_total_normal_start':'unusable','forcing_K_to_known_border':'unusable','use_rule':'Keep raw net formula unchanged; calculation requires start>0, normal_net>0 and valid partitions. Keep identity and model/cohort status. Do not emit finite K for zero play/nonpositive denominator.'}}
out=BASE/'raw-statistical-audit.json'
out.write_text(json.dumps(R,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
print('JSON',out,'bytes',out.stat().st_size)
for m,x in R['models'].items():
 o=x['latest']['overview'];print(m,o['rows'],'rows; pooled candidate K',o['candidate_all']['K_ratio_of_sums'])
for date,entry in R['date_backfill'].items():
 print(date,'derived candidate K',entry['summary']['K_ratio_of_sums'])
