// Exact retry arithmetic from fixed production coordinator.
function plusMs(isoText,ms){return new Date(new Date(isoText).getTime()+ms).toISOString()}
export function originalRetryAt(job,at){
    const exponent=Math.max(0,(job.failureCount??job.attempts??1));
    const base=Math.min(30*60*1000,30*1000*(2**exponent));
    const spread=(job.id%11)*1000;
    return plusMs(at,base+spread);
  }
