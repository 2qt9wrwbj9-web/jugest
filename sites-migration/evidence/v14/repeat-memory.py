import subprocess,json
from pathlib import Path
commands=[{'command': ['node', 'evidence/v14/full-job-probe.mjs', '180', '160', '1', '96', 'v13'], 'log': 'evidence/v14/logs/repeat-2-180-160-v13.log'}, {'command': ['node', 'evidence/v14/full-job-probe.mjs', '180', '160', '1', '96', 'optimized'], 'log': 'evidence/v14/logs/repeat-2-180-160-optimized.log'}, {'command': ['node', 'evidence/v14/full-job-probe.mjs', '180', '160', '1', '96', 'v13'], 'log': 'evidence/v14/logs/repeat-3-180-160-v13.log'}, {'command': ['node', 'evidence/v14/full-job-probe.mjs', '180', '160', '1', '96', 'optimized'], 'log': 'evidence/v14/logs/repeat-3-180-160-optimized.log'}]
results=[]
for item in commands:
 with open(item["log"],"w") as out:r=subprocess.run(item["command"],stdout=out,stderr=subprocess.STDOUT,timeout=240)
 results.append({**item,"exit":r.returncode});Path("evidence/v14/repeat-commands.json").write_text(json.dumps(results,indent=2))
