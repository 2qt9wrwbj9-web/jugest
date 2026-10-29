from pathlib import Path
import json
root=Path(__file__).resolve().parents[2];rows=json.loads((root/'evidence/v13/migration-matrix.json').read_text());by={r['id']:r for r in rows};changes=[]
def change(fid,**values):
 r=by[fid];changes.append({'id':fid,'before':r['state'],'after':values.get('state',r['state'])});r.update(values)
change('CYCLE-01',compatibility='既存の未昇格BACKTEST→探索を維持。opt-in cycleはroot単位にidentityを固定し、同じsnapshot/modelから後続を自動受付',evidence='tests/port-research-transition.test.mjs（既存）; port-research-cycle.test.mjs; evidence/v14/logs/native-cycle.log; BROWSER_CHECK.md',next='ホストQueue契約と再配信を検証。元logical keyはcontextに保持しインフラidentityはchannel/input/rootで分離')
change('CYCLE-02',compatibility='frontier/gen/round/noImprove/repeated/stateを元と比較。決定latchと原子的publication、入力・実装・世代・registry snapshotをfence。正式holdout後状態は未移植',evidence='port-research-cycle.test.mjsの6分岐・全cycle元SQLite比較・rollback/race; cycle-oom-results.json',next='正式holdoutの固定model集合・予測行/score保存・復旧を移植')
change('CYCLE-03',sites='lib/analysis/research-cycle.mjs; jobs.mjs; drizzle/0013*,0014*; client/analysis-job-panel.mjs',state='実装済み・実ホスト未検証',compatibility='研究championの採用/棄却/歴史化を元recordModelSearchCompletionと比較。candidate/世代/score/createdAt更新規則を維持。active modelは変更しない',evidence='evidence/v14/logs/cycle-sqlite-final.log; native-cycle.log; real-cycle-oom.log; browser-promoted.txt',uiApi='既存解析panelの研究cycle checkboxから開始、採否/履歴/個別結果を表示。開発用権限のみ',development='6分岐と実データ合成cycle、故障・競合・実OOM復旧が合格',acceptance='対象採否/履歴/次logical job/権限/競合の比較を維持し、実hostで同じ決定・復旧を確認。正式採用と混同しない',next='ホスト無人運用/監視を検証、正式holdoutとactive-model採用を別gateで実装')
change('CYCLE-04',sites='lib/analysis/research-cycle.mjs:planResearchDecision; evidence/v14/holdout-boundary.mjs（元のみ）',state='部分実装',compatibility='元shouldConvergeをそのまま使用。repeat/no_improvement終了を比較。移植先はconverged_holdout_pendingで封印継続。元本番はdaysを渡してholdout確定まで進むため、そこは明確な未移植差分',evidence='cycle-sqlite-final.log（days=null境界まで一致）; holdout-boundary.json（元正式評価のみ）; native-cycle.log',next='全歴代championの固定集合、元better/rankRows/holdout hashと予測行を分割保存して一致・再開・原子確定を検証',blockers=['B-PIPELINE','B-HOLDOUT'])
change('FEAT-01',compatibility='元特徴量の値/hash/行互換を維持。opt-inで成功確定と同じtransactionに研究loop/固定BT/outboxを追加',evidence='既存元SQLite比較回帰; cycle-sqlite-final.log; native-cycle.log; BROWSER_CHECK.md')
change('AN-02',compatibility='全候補評価後の索引/機種group参照を解放。全BH集合・演算/候補/同点順は不変。4規模元8値/全出力一致。ピーク改善とhost128MBは未証明',evidence='evidence/v14/model-comparison.json; memory-results.json; MEMORY_REPORT.md',next='単純解放ではピーク低下不確定。元共通母集団/候補順を固定したpure候補kernel・全BHの契約試験から分割の可否を判定')
change('AUTH-01',sites='lib/access/d1-sessions.mjs（専用DBのsession/challenge部分のみ）',state='部分実装',compatibility='元session認証/期限/失効/one-use challengeのD1互換を合成SQLite比較。v2 nullable expiryと専用DB境界を維持。WebAuthn ceremony/register/login routeは未移植',evidence='tests/port-access-sessions.test.mjs; logs/access-schema-final.log; access-public-final.log',uiApi='正式authへの接続なし。既存DEV authは別のまま',development='独立ACCESS bindingの合成試験のみ。canonical DB・v1型schemaを拒否',next='第2D1供給契約を確認し、署名検証/再認証/発行/登録/招待の同等transactionを移植',blockers=['B-AUTH','U-ACCESS-BINDING','U-RPID'])
change('AUTH-03',sites='lib/access/d1-sessions.mjs（admin/credential/invite失効部分）',state='部分実装',compatibility='元失効のSQL・auditを比較。招待/追加管理者発行、viewer単体失効、rate limit、正式管理画面は未移植',evidence='port-access-sessions.test.mjs; 元access/store.mjsとのaudit/戻り値比較',uiApi='公開API/画面への接続なし',next='専用DB提供・正式ceremonyと失効/招待/rateの全操作へ接続',blockers=['B-AUTH','U-ACCESS-BINDING'])
change('DATA-03',sites='lib/access/d1-sessions.mjs; tests/port-access-sessions.test.mjs',state='部分実装',compatibility='空の元access v2 SQLite schema/合成rowを専用D1に複製してsession操作比較。本番認証DBの複製/秘密移行は未実施',evidence='access-schema-final.log; source-inventory.jsonのaccess9表',next='秘密を保持しないschema migration/専用binding供給/復元/発行・失効全transactionの検証',blockers=['B-AUTH','U-ACCESS-BINDING'])
localCompared={'MATH-01','API-01','API-02','AN-01','AN-02','AN-03','FEAT-01','BT-01','BT-02','SEARCH-01','CYCLE-01','CYCLE-02','CYCLE-03','CYCLE-04','AUTH-01','AUTH-03','DATA-03','DATA-05'}
ui={'UI-01','MATH-01','API-01','API-02','AN-01','AN-02','FEAT-01','BT-01','SEARCH-01','CYCLE-01','CYCLE-02','CYCLE-03','CYCLE-04'}
unattended={'AN-01','AN-02','FEAT-01','BT-01','SEARCH-01','CYCLE-01','CYCLE-02','CYCLE-03','CYCLE-04','JOB-02'}
for r in rows:r['checks']={'localImplementation':'対象経路のlocal実装済み' if r['state']=='実装済み・実ホスト未検証' else r['state'],'originalComparison':'対象範囲のみ合格（互換性欄の境界を参照）' if r['id'] in localCompared else '原本の個別証拠以外は未確認','screenApi':'開発用の対象画面/APIへ接続済み' if r['id'] in ui else '全体接続は未確認/未実装','localUnattended':'対象local Queue/DEV driverを検証済み' if r['id'] in unattended else '未検証または対象外','sitesHost':'未検証','fullAcceptance':'未達'}
assert len(rows)==55
(root/'evidence/v14/migration-matrix.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n');(root/'evidence/v14/feature-changes.json').write_text(json.dumps(changes,ensure_ascii=False,indent=2)+'\n')
parts=['''# JUGEST 完全移植マスター計画（authoritative / 保存版14）

元fixed deploy/vps@1f8c29fc458f34e11e546fb57944d0fc31db98a5。再開Site13@00c5edcac2a2f1597db91800f08d176da9b746fe、GitHub work/sites-migration-20261027@d2f6513944a8d63d90e8ea33c8c8a06ed5eff34e。保存後の正確なSHA/receiptはZIP参照。公開許可ではない。

55機能IDを全て維持。各行は「local実装」「元比較」「画面/API」「local無人」「実Sites」「最終gate」を分離する。対象subsetの合格と全機能完成を混同しない。host未検証のため全体完成の行・完成率は出さない。元155source/42SQL表+relay_kv/全fixed treeの索引はevidence/v13原本とv14コピー。同じsourceを再調査して進捗扱いにしない。動的UI/実配信/全APIのsemantic完全監査は未完（B-COVERAGE）。

## 次の依存順と停止条件

1. CYCLE-04/B-HOLDOUT：研究収束まではlocal完成。元holdoutの全歴代champion・固定input・better/rankRows/score/予測行/hashを段階保存し、再開・原子的確定を検証する。active model/PREは別gate。
2. AUTH-01/03/U-ACCESS-BINDING：専用DBでのsession互換単位を足場に、Sites第2D1の提供条件を確認。canonical DBへ認証表を混在させない。正式WebAuthn/招待発行/rate/全scopeへ進む。
3. B-MEM/AN-02：4規模/繰返しでも単純な候補参照解放のピーク改善は不確定。高コストcheckpointは導入しない。元共通母集団・候補順・全BHの契約をpure kernelで固定してから分割を検証する。研究/他機能を停止させない。
4. U-QUEUE/B-HOST：HOST_VALIDATION_PLAN.mdの提供interface/非公開実行を確認し、公開が必要なhost canaryの最終操作だけ別承認へ分ける。外部恒久基盤なし。
5. 正式PRE/過去・店舗横断比較→Collector/自動収集→端末同期→pachinko/全MCP/OAuth→許可された実データ移行を、依存と権限の完成順に接続する。独立pure計算/変換の試験は先行可能。

機械的再開：receipt→本書→BLOCKERS→ACCEPTANCE→STATUS→evidence/v14/REPRODUCE.md。機械可読行はmigration-matrix.json。UNKNOWNは不可能とも完成とも扱わない。

''']
for r in rows:
 parts.append('## '+r['id']+' '+r['name']+'\n\n')
 for key,label in [('original','元ファイル/関数/API'),('sites','Sites対応'),('state','状態'),('compatibility','互換性と境界'),('evidence','証拠'),('uiApi','画面/API'),('development','開発環境'),('hostVerified','実Sites検証'),('checks','段階別判定'),('dependencies','依存'),('blockers','障害'),('acceptance','完成条件'),('next','次作業')]:parts.append('- '+label+': '+(json.dumps(r[key],ensure_ascii=False) if isinstance(r[key],(dict,list,bool)) else r[key])+'\n')
 parts.append('\n')
old=(root/'MIGRATION_MASTER_PLAN.md').read_text();annex=old[old.index('## 元DB全表'):];parts.append(annex)
(root/'MIGRATION_MASTER_PLAN.md').write_text(''.join(parts))
