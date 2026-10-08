export const PACHINKO_STORE_ID='pia:35-p';
export const PACHINKO_STORE=Object.freeze({id:PACHINKO_STORE_ID,name:'PIA大船-P',source_store_id:35,denomination:4,loan_balls_per_1000_yen:250,equal_exchange:true});

export const MODELS=Object.freeze([
  {key:'OUMI5_SPECIAL_ALTA',displayName:'大海5SP',apiName:'Ｐ大海物語５スペシャルＡＬＴＡ',sisMachineCode:'00021',
    estimatorStatus:'verified',estimatorReason:'API内の状態分離と実データ統計を検証済み。公式フィールド定義と独立実測の照合は未完了。',
    estimatorId:'sea-normal-consumption-10',estimatorVersion:'1',formName:'P大海物語5スペシャル ALTA',denomination:4},
  {key:'TOKYO_GHOUL_399',displayName:'喰種399',apiName:'ｅ東京喰種Ｗ',sisMachineCode:'00022',
    estimatorStatus:'provisional',estimatorReason:'通常時の打込/払出カウンターから暫定Kを算出。PIA公式のカウンター定義と独立実測との照合は未完了。',
    estimatorId:'tokyo-ghoul-399-unverified',estimatorVersion:'1',candidateMethodId:'tokyo-ghoul-399-normal-consumption-10-candidate',candidateMethodVersion:'1',formName:'e東京喰種W',denomination:4},
  {key:'TOKYO_GHOUL_999',displayName:'喰種999',apiName:'ｅ東京喰種ＭＷ',sisMachineCode:'00406',
    estimatorStatus:'provisional',estimatorReason:'通常時の打込/払出カウンターから暫定Kを算出。PIA公式のカウンター定義と独立実測との照合は未完了。',
    estimatorId:'tokyo-ghoul-999-unverified',estimatorVersion:'1',candidateMethodId:'tokyo-ghoul-999-normal-consumption-10-candidate',candidateMethodVersion:'1',formName:'e東京喰種MW',denomination:4}
].map(Object.freeze));

export function normalizePachinkoName(value){
  return typeof value==='string'?value.normalize('NFKC').toUpperCase().replace(/\s+/gu,''):'';
}

export function identifyPachinkoModel(raw){
  if(!raw||!(raw.store_id===35||raw.store_id==='35')||typeof raw.sis_machine_code!=='string')return null;
  const name=normalizePachinkoName(raw.name);
  return MODELS.find(model=>model.sisMachineCode===raw.sis_machine_code&&normalizePachinkoName(model.apiName)===name)??null;
}
