export const JUGGLER_PAYOUT_BY_SETTING=Object.freeze({
  1:98.31125,
  2:99.42250,
  3:101.17500,
  4:103.69125,
  5:106.23250,
  6:109.58250,
});

export const HANA_PAYOUT_BY_SETTING=Object.freeze({
  1:97,
  2:99,
  3:101,
  4:103.75,
  5:106.75,
  6:109.75,
});

export const NEW_KING_V_PAYOUT_BY_SETTING=Object.freeze({
  1:97,
  2:99,
  3:101,
  4:104,
  V:108,
});

const PAYOUTS=Object.freeze({
  juggler:JUGGLER_PAYOUT_BY_SETTING,
  hana:HANA_PAYOUT_BY_SETTING,
  new_king_v:NEW_KING_V_PAYOUT_BY_SETTING,
});

function requireFamily(family){
  const key=String(family??'').trim();
  const payouts=PAYOUTS[key];
  if(!payouts)throw new TypeError(`unknown relevance family: ${key||'<empty>'}`);
  return Object.freeze({key,payouts});
}

function buildRelevance(payouts){
  const baseline=Number(payouts['1']);
  return Object.freeze(Object.fromEntries(
    Object.entries(payouts).map(([setting,payout])=>[setting,Number(payout)-baseline]),
  ));
}

const RELEVANCE=Object.freeze(Object.fromEntries(
  Object.entries(PAYOUTS).map(([family,payouts])=>[family,buildRelevance(payouts)]),
));

export function relevanceScaleForFamily(family){
  const {key}=requireFamily(family);
  return RELEVANCE[key];
}

export function expectedRelevance(posterior,family,{tolerance=1e-9}={}){
  if(!posterior||typeof posterior!=='object'||Array.isArray(posterior))throw new TypeError('posterior must be an object');
  const relevance=relevanceScaleForFamily(family);
  const tol=Number(tolerance);
  if(!Number.isFinite(tol)||tol<0)throw new TypeError('tolerance must be finite and nonnegative');

  let total=0;
  let expected=0;
  for(const [setting,rawProbability] of Object.entries(posterior)){
    const probability=Number(rawProbability);
    if(!Number.isFinite(probability))throw new TypeError(`posterior probability for setting ${setting} must be finite`);
    if(probability<0)throw new RangeError(`posterior probabilities must be nonnegative; setting ${setting} was ${probability}`);
    if(!(setting in relevance)){
      if(probability>tol)throw new RangeError(`posterior contains unsupported setting ${setting} for ${family}`);
      total+=probability;
      continue;
    }
    total+=probability;
    expected+=probability*Number(relevance[setting]);
  }
  if(Math.abs(total-1)>tol)throw new RangeError(`posterior probabilities must sum to 1; got ${total}`);
  return expected;
}
