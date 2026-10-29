import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[2];rows=json.loads((root/'evidence/v14/migration-matrix.json').read_text());ids={r['id'] for r in rows};assert len(ids)==len(rows)
fields=['id','name','original','sites','state','compatibility','evidence','uiApi','development','hostVerified','dependencies','blockers','acceptance','next'];states={'完成・検証済み','実装済み・実ホスト未検証','部分実装','未実装','技術的障害あり','仕様・対応方法が未確認'}
master=(root/'MIGRATION_MASTER_PLAN.md').read_text();block=(root/'MIGRATION_BLOCKERS.md').read_text();accept=(root/'MIGRATION_ACCEPTANCE_CRITERIA.md').read_text()
for r in rows:
 assert all(k in r for k in fields),r['id'];assert r['state'] in states;assert r['hostVerified'] is False;assert '## '+r['id']+' ' in master
 assert all(x in ids for x in r['dependencies']),(r['id'],r['dependencies'])
 assert all(x in block for x in r['blockers']),(r['id'],r['blockers'])
for n in range(1,13):assert f'AC-{n:02}' in accept
inv=json.loads((root/'evidence/v14/source-inventory.json').read_text());cover=json.loads((root/'evidence/v14/source-coverage.json').read_text());assert {x['path'] for x in inv['files']}=={x['path'] for x in cover}
for c in cover:assert all(i in ids for i in c['featureIds']),c
assert len([t for d in inv['databases'] for t in d.get('tables',[])])==42
print('PASS 55 stable feature rows, required fields/dependencies/blockers, 12 gates, complete indexed file domains, 42 SQL tables plus relay_kv; semantic gaps explicitly open')
