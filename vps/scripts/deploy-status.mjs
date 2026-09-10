#!/usr/bin/env node
import path from 'node:path';
import {readState,resolveCurrentSha,resolveCurrentTarget} from '../src/deploy-core.mjs';
import {DEPLOY_DEFAULTS,execCommand} from '../src/deploy-runner.mjs';

const rootDir=process.env.JUGEST_DEPLOY_ROOT??DEPLOY_DEFAULTS.rootDir;
const stateDir=process.env.JUGEST_DEPLOY_STATE_DIR??DEPLOY_DEFAULTS.stateDir;
const currentPath=path.join(rootDir,'current');

const [state,currentTarget,currentSha]=await Promise.all([
  readState(stateDir),
  resolveCurrentTarget(currentPath),
  resolveCurrentSha(currentPath,execCommand)
]);

console.log(JSON.stringify({
  currentTarget,
  currentSha,
  ...state
},null,2));
