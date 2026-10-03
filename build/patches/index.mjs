import { patchStoreAnalysisHtml, patchStoreAnalysisApp } from './store-analysis-view.mjs';
import { patchAnalysisJitterApp } from './analysis-jitter-fix.mjs';
import { patchCollectorCoverageHtml } from './collector-coverage.mjs';
import { patchFixedChromeCss } from './fixed-chrome.mjs';
import { patchCollectorUiApp } from './collector-ui.mjs';

export function applyHtmlBuildPatches(input){
 let html=patchCollectorCoverageHtml(input);
 return patchStoreAnalysisHtml(html);
}

export function applyCssBuildPatches(input){
 return patchFixedChromeCss(input);
}

export function applyAppBuildPatches(input){
 let app=patchCollectorUiApp(input);
 app=patchStoreAnalysisApp(app);
 return patchAnalysisJitterApp(app);
}
