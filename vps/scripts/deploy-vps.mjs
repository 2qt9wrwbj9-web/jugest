#!/usr/bin/env node
import {runDeployOnce} from '../src/deploy-runner.mjs';

const options={};
if (process.env.JUGEST_DEPLOY_ROOT) options.rootDir=process.env.JUGEST_DEPLOY_ROOT;
if (process.env.JUGEST_DEPLOY_STATE_DIR) options.stateDir=process.env.JUGEST_DEPLOY_STATE_DIR;

const result=await runDeployOnce(options);
console.log(JSON.stringify(result));

if (result.status==='failed' || result.status==='rolled-back') {
  process.exitCode=1;
}
