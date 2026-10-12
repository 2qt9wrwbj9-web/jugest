"""Independent SciPy / full-enumeration audit. Requires scipy in test runtime only."""
import itertools,json,math,os,random,subprocess
from pathlib import Path
from scipy.stats import binom
from scipy.special import logsumexp

ROOT=Path(__file__).resolve().parents[1]
NODE=os.environ.get('JUGEST_TEST_NODE','node')
random.seed(20261010)
cases=[]
for n in [1,2,10,500,8000,100000,10000000]:
 for p in [.0001,1/409.6,1/229.15,.01,.5,.99,1-1e-7]:
  center=n*p
  for k in sorted(set([0,n,n-1,max(0,min(n,int(center))),max(0,min(n,int(center-3*math.sqrt(n*p*(1-p))))),max(0,min(n,int(center+3*math.sqrt(n*p*(1-p)))))])):
   cases.append([n,k,p])
cases += [[10,0,0],[10,0,1],[10,10,1],[0,0,.3],[10000000,0,1/230],[10000000,1,1/230]]
for _ in range(200):
 n=random.choice([100,1000,8000,100000,10000000]);p=random.uniform(.0001,.02)
 k=max(0,min(n,int(n*p+random.uniform(-10,10)*math.sqrt(n*p*(1-p)))))
 cases.append([n,k,p])

js="""import './group-judge.js';let text='';for await(const part of process.stdin)text+=part;const x=JSON.parse(text),t=globalThis.JUGESTGroupJudge.__test;process.stdout.write(JSON.stringify({cdf:x.cdf.map(a=>t.binomialLowerTail(...a)),ratios:x.enumerations.map(e=>t.logEvidenceRatio(e.logs,e.allowed,e.weights))}));"""
enums=[]
for n in [2,3,4]:
 for allowed in [[4,5,6],[5,6],[6]]:
  for weights in [[1/6]*6,[3/11,3/11,2/11,1/11,1/11,1/11],[1/11,1/11,1/11,2/11,3/11,3/11]]:
   enums.append({'logs':[[random.uniform(-30,0) for _ in range(6)] for _ in range(n)],'allowed':allowed,'weights':weights})
result=subprocess.run([NODE,'--input-type=module','-e',js],cwd=ROOT,input=json.dumps({'cdf':cases,'enumerations':enums}),text=True,capture_output=True,check=True)
observed=json.loads(result.stdout)
max_absolute=max_log=0
for (n,k,p),actual in zip(cases,observed['cdf']):
 expected=float(binom.cdf(k,n,p));expected_log=float(binom.logcdf(k,n,p))
 got=actual['p'];error=abs(got-expected);max_absolute=max(max_absolute,error)
 assert error<3e-8,((n,k,p),actual,expected,error)
 if math.isfinite(expected_log) and expected_log < -1e-5:
  log_error=abs(actual['logP']-expected_log);max_log=max(max_log,log_error)
  assert log_error<2e-7*max(1,abs(expected_log)),((n,k,p),actual,expected_log,log_error)
 if got==0 and 0<p<1 and k<n:
  assert actual['logP'] is not None and math.isfinite(actual['logP']), 'must retain underflow log probability'
max_enum=0
for e,actual in zip(enums,observed['ratios']):
 highs=[];lows=[];highpriors=[];lowpriors=[]
 for assignment in itertools.product(range(6),repeat=len(e['logs'])):
  logprior=sum(math.log(e['weights'][s]) for s in assignment)
  score=logprior+sum(row[s] for row,s in zip(e['logs'],assignment))
  target=all(s+1 in e['allowed'] for s in assignment)
  (highs if target else lows).append(score)
  (highpriors if target else lowpriors).append(logprior)
 expected=logsumexp(highs)-logsumexp(highpriors)-logsumexp(lows)+logsumexp(lowpriors)
 # The test helper accepts the same human setting numbers as the public API.
 if isinstance(actual,dict):actual=actual.get('logEvidenceRatio',actual.get('logRatio'))
 error=abs(float(actual)-float(expected));max_enum=max(max_enum,error)
 assert error<1e-10,(e,actual,float(expected))
print(json.dumps({'binomialCases':len(cases),'maxAbsoluteCdfError':max_absolute,'maxLogCdfError':max_log,'independentFullSettingEnumerations':len(enums),'maxEnumerationLogRatioError':max_enum}))
