import subprocess,json,time
from pathlib import Path
out=Path('evidence/v14');records=[]
for d,m in [(90,106),(180,106),(240,106),(180,160)]:
 for mode in ['v13','optimized']:
  cmd=['node','evidence/v14/full-job-probe.mjs',str(d),str(m),'1','96',mode];log=out/'logs'/f'full-{d}-{m}-{mode}.log';t=time.monotonic()
  with log.open('w') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=240)
  records.append({'command':cmd,'log':log.name,'exit':r.returncode,'wallSeconds':time.monotonic()-t});(out/'comparison-commands.json').write_text(json.dumps(records,indent=2))
 cmd=['node','evidence/v14/large-stage-comparison.mjs','1',str(d),str(m)];log=out/'logs'/f'parity-final-{d}-{m}.log'
 with log.open('w') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=240)
 records.append({'command':cmd,'log':log.name,'exit':r.returncode});(out/'comparison-commands.json').write_text(json.dumps(records,indent=2))
