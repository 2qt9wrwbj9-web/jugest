const BASE_POLICY={
  hardReserveMiB:320,
  emergencyReserveMiB:220,
  cautionUsedRatio:0.70,
  pauseUsedRatio:0.82,
  emergencyUsedRatio:0.88,
  maxAnalysisChildren:3,
  sampleIntervalMs:2000,
  emergencyCooldownMs:10000
};

function finitePositive(value,name){
  if(!Number.isFinite(value)||value<=0)throw new TypeError(`${name} must be a positive finite number`);
}

function validate(policy){
  finitePositive(policy.hardReserveMiB,'hardReserveMiB');
  finitePositive(policy.emergencyReserveMiB,'emergencyReserveMiB');
  if(policy.hardReserveMiB<policy.emergencyReserveMiB)throw new RangeError('reserve policy requires hardReserveMiB >= emergencyReserveMiB');
  for(const name of ['cautionUsedRatio','pauseUsedRatio','emergencyUsedRatio']){
    const value=policy[name];
    if(!Number.isFinite(value)||value<=0||value>1)throw new RangeError(`${name} must be in (0, 1]`);
  }
  if(!(policy.cautionUsedRatio<policy.pauseUsedRatio&&policy.pauseUsedRatio<policy.emergencyUsedRatio)){
    throw new RangeError('pressure ratios must satisfy caution < pause < emergency');
  }
  if(!Number.isInteger(policy.maxAnalysisChildren)||policy.maxAnalysisChildren<1)throw new RangeError('maxAnalysisChildren must be a positive integer');
  if(!Number.isInteger(policy.sampleIntervalMs)||policy.sampleIntervalMs<100)throw new RangeError('sampleIntervalMs must be an integer >= 100');
  if(!Number.isInteger(policy.emergencyCooldownMs)||policy.emergencyCooldownMs<policy.sampleIntervalMs){
    throw new RangeError('emergencyCooldownMs must be an integer >= sampleIntervalMs');
  }
  return policy;
}

export const DEFAULT_RESOURCE_POLICY=Object.freeze(validate({...BASE_POLICY}));

export function loadResourcePolicy(overrides={}){
  if(overrides===null||typeof overrides!=='object'||Array.isArray(overrides))throw new TypeError('resource policy overrides must be an object');
  return Object.freeze(validate({...BASE_POLICY,...overrides}));
}
