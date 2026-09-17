export const PRE_V2_SEQUENTIAL_VERSION='pre-v2-weak-null-fixed-mixture-v1';
export const PRE_V2_C=2;
export const PRE_V2_LAMBDA_GRID=Object.freeze([0.025,0.05,0.10,0.20,0.30,0.40,0.475]);
export const PRE_V2_LINEAGE_ALPHA=0.05;

function requirePositiveInteger(value,name){
  const n=Number(value);
  if(!Number.isInteger(n)||n<1)throw new TypeError(`${name} must be a positive integer`);
  return n;
}

function requireAlpha(alpha){
  const value=Number(alpha);
  if(!Number.isFinite(value)||value<=0||value>=1)throw new TypeError('alpha must be finite and strictly between 0 and 1');
  return value;
}

function requireDelta(delta){
  const value=Number(delta);
  if(!Number.isFinite(value))throw new TypeError('daily delta must be finite');
  if(value<-1||value>1)throw new RangeError(`daily delta must be in [-1, 1]; got ${value}`);
  return value;
}

function exponentialPsi(lambda,c=PRE_V2_C){
  const lam=Number(lambda);
  const scale=Number(c);
  if(!Number.isFinite(lam)||lam<=0)throw new TypeError('lambda must be finite and positive');
  if(!Number.isFinite(scale)||scale<=0)throw new TypeError('c must be finite and positive');
  if(!(lam<1/scale))throw new RangeError(`lambda must be less than 1/c (${1/scale})`);
  return(-Math.log(1-scale*lam)-scale*lam)/(scale*scale);
}

function logMeanExp(values){
  if(!Array.isArray(values)||values.length===0)throw new TypeError('values must be a non-empty array');
  const maximum=Math.max(...values);
  if(!Number.isFinite(maximum))throw new TypeError('log-evidence components must be finite');
  let scaled=0;
  for(const value of values){
    if(!Number.isFinite(value))throw new TypeError('log-evidence components must be finite');
    scaled+=Math.exp(value-maximum);
  }
  return maximum+Math.log(scaled/values.length);
}

function displayExp(logValue){
  const logMax=Math.log(Number.MAX_VALUE);
  return Math.exp(Math.min(Number(logValue),logMax));
}

function validateState(state){
  if(!state||typeof state!=='object'||Array.isArray(state))throw new TypeError('sequential state must be an object');
  if(state.version!==PRE_V2_SEQUENTIAL_VERSION)throw new RangeError(`unsupported sequential state version: ${state.version}`);
  if(Number(state.c)!==PRE_V2_C)throw new RangeError(`sequential state c must equal ${PRE_V2_C}`);
  if(!Array.isArray(state.lambdas)||state.lambdas.length!==PRE_V2_LAMBDA_GRID.length)throw new RangeError('sequential state lambda grid does not match scorer version');
  PRE_V2_LAMBDA_GRID.forEach((lambda,index)=>{
    if(Number(state.lambdas[index])!==lambda)throw new RangeError('sequential state lambda grid does not match scorer version');
  });
  if(!Number.isInteger(state.count)||state.count<0)throw new RangeError('sequential state count must be a nonnegative integer');
  for(const name of ['cumulativeSum','intrinsicTime','lastPredictableCenter','logE','eValue','maxLogE','maxEValue']){
    if(!Number.isFinite(Number(state[name])))throw new TypeError(`sequential state ${name} must be finite`);
  }
  if(Number(state.intrinsicTime)<0)throw new RangeError('sequential state intrinsicTime must be nonnegative');
  if(!Number.isInteger(state.maxAt)||state.maxAt<0||state.maxAt>state.count)throw new RangeError('sequential state maxAt is invalid');
  if(!Array.isArray(state.componentLogE)||state.componentLogE.length!==PRE_V2_LAMBDA_GRID.length)throw new RangeError('sequential state componentLogE does not match lambda grid');
  state.componentLogE.forEach((value)=>{
    if(!Number.isFinite(Number(value)))throw new TypeError('sequential component log evidence must be finite');
  });
  return state;
}

export function alphaForTrial(k){
  const trial=requirePositiveInteger(k,'trial number');
  return PRE_V2_LINEAGE_ALPHA/(trial*(trial+1));
}

export function createSequentialState(){
  return{
    version:PRE_V2_SEQUENTIAL_VERSION,
    c:PRE_V2_C,
    lambdas:[...PRE_V2_LAMBDA_GRID],
    count:0,
    cumulativeSum:0,
    intrinsicTime:0,
    lastPredictableCenter:0,
    componentLogE:PRE_V2_LAMBDA_GRID.map(()=>0),
    logE:0,
    eValue:1,
    maxLogE:0,
    maxEValue:1,
    maxAt:0,
  };
}

export function updateSequentialState(inputState,rawDelta){
  const state=validateState(inputState);
  const delta=requireDelta(rawDelta);
  const predictableCenter=state.count>0?Number(state.cumulativeSum)/state.count:0;
  const cumulativeSum=Number(state.cumulativeSum)+delta;
  const residual=delta-predictableCenter;
  const intrinsicTime=Number(state.intrinsicTime)+residual*residual;

  const componentLogE=PRE_V2_LAMBDA_GRID.map((lambda)=>
    lambda*cumulativeSum-exponentialPsi(lambda,PRE_V2_C)*intrinsicTime,
  );
  const logE=logMeanExp(componentLogE);
  const eValue=displayExp(logE);
  const count=state.count+1;
  const isNewMaximum=logE>Number(state.maxLogE);
  const maxLogE=isNewMaximum?logE:Number(state.maxLogE);
  const maxAt=isNewMaximum?count:state.maxAt;

  return{
    version:PRE_V2_SEQUENTIAL_VERSION,
    c:PRE_V2_C,
    lambdas:[...PRE_V2_LAMBDA_GRID],
    count,
    cumulativeSum,
    intrinsicTime,
    lastPredictableCenter:predictableCenter,
    componentLogE,
    logE,
    eValue,
    maxLogE,
    maxEValue:displayExp(maxLogE),
    maxAt,
  };
}

export function promotionEvidence(inputState,rawAlpha){
  const state=validateState(inputState);
  const alpha=requireAlpha(rawAlpha);
  const threshold=1/alpha;
  const logThreshold=Math.log(threshold);
  const crossed=Number(state.maxLogE)>=logThreshold;
  return Object.freeze({
    alpha,
    threshold,
    logThreshold,
    crossed,
    crossedAt:crossed?state.maxAt:null,
    currentLogE:Number(state.logE),
    currentEValue:Number(state.eValue),
    maxLogE:Number(state.maxLogE),
    maxEValue:Number(state.maxEValue),
    maxAt:state.maxAt,
  });
}

export function safetyEvidence(state,alpha){
  return promotionEvidence(state,alpha);
}
