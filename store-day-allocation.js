(function (root) {
  'use strict';

  // This module consumes setting likelihoods, never individual posterior q.
  // All three displayed bands are marginals of the same configuration prior.
  const VERSION = 'store-day-allocation-1.0.0';
  const NEG = -Infinity;
  const BAND_IDS = ['456', '56', '6'];
  const MIXED = [1 / 3, 1 / 3, 1 / 3];
  const HIGH_COMPONENTS = [MIXED, [1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const DEFAULT_MIX = [.25, .25, .25, .25];
  const SENSITIVITY = [
    {id: 'shared4-flat', prior: 'flat', mixtureWeights: DEFAULT_MIX, lowWeights: MIXED},
    {id: 'independent-flat', prior: 'flat', mixtureWeights: [1, 0, 0, 0], lowWeights: MIXED},
    {id: 'mixed70-flat', prior: 'flat', mixtureWeights: [.7, .1, .1, .1], lowWeights: MIXED},
    {id: 'shared4-binomial-0.1', prior: 'binomial-0.1', mixtureWeights: DEFAULT_MIX, lowWeights: MIXED},
    {id: 'shared4-beta-binomial-1-4', prior: 'beta-binomial-1-4', mixtureWeights: DEFAULT_MIX, lowWeights: MIXED},
    {id: 'shared4-low1', prior: 'flat', mixtureWeights: DEFAULT_MIX, lowWeights: [.7, .2, .1]},
    {id: 'shared4-low3', prior: 'flat', mixtureWeights: DEFAULT_MIX, lowWeights: [.1, .2, .7]},
    {id: 'high4-flat', prior: 'flat', mixtureWeights: [.25, .5, .125, .125], lowWeights: MIXED},
    {id: 'high6-flat', prior: 'flat', mixtureWeights: [.25, .125, .125, .5], lowWeights: MIXED}
  ];
  const BASELINES = [
    {id: 'low-centered', label: '低設定中心', weights: [.7, .2, .1, 0, 0, 0]},
    {id: 'middle-centered', label: '中間中心', weights: [.1, .2, .5, .15, .04, .01]},
    {id: 'some-high', label: '一部高設定', weights: [.5, .25, .15, .06, .03, .01]}
  ];

  function add(a, b) {
    if (a === NEG) return b;
    if (b === NEG) return a;
    const hi = a > b ? a : b;
    return hi + Math.log1p(Math.exp((a > b ? b : a) - hi));
  }
  function sum(values) {
    let out = NEG;
    for (const x of values) out = add(out, x);
    return out;
  }
  function negativeArray(n) { return new Float64Array(n).fill(NEG); }
  function logWeight(x) { return x === 0 ? NEG : Math.log(x); }
  function weightedRow(logs, weights, offset) {
    let out = NEG;
    for (let s = 0; s < weights.length; s++) if (weights[s] > 0) out = add(out, logs[s + (offset || 0)] + Math.log(weights[s]));
    return out;
  }
  function logChooseRow(n) {
    const out = new Float64Array(n + 1);
    for (let k = 1; k <= n; k++) out[k] = out[k - 1] + Math.log(n - k + 1) - Math.log(k);
    return out;
  }
  function normalizedLogs(logs) {
    const total = sum(logs);
    return Array.from(logs, x => x === NEG ? NEG : x - total);
  }
  function ratio(a, b) { return a === NEG && b === NEG ? null : a - b; }
  function clone(x) {
    if (Array.isArray(x)) return x.map(clone);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([key, value]) => [key, clone(value)]));
    return x;
  }
  function inBand(setting, id) { return id === '456' ? setting >= 3 : id === '56' ? setting >= 4 : setting === 5; }
  function matches(count, spec) { return spec.kind === 'exact' ? count === spec.count : count >= spec.count; }

  // Coefficients of product(low_i + high_i z); division by C(n,k)
  // is essential: coefficients are sums, while fixed-count models are averages.
  function countCoefficients(low, high) {
    const n = low.length, dp = negativeArray(n + 1);
    dp[0] = 0;
    for (let i = 0; i < n; i++) for (let k = i + 1; k >= 0; k--) {
      dp[k] = add(k <= i ? dp[k] + low[i] : NEG, k > 0 ? dp[k - 1] + high[i] : NEG);
    }
    return dp;
  }
  function countLogLikelihoods(logs, highWeights, lowWeights) {
    const low = logs.map(row => weightedRow(row, lowWeights));
    const high = logs.map(row => weightedRow(row, highWeights));
    const choose = logChooseRow(logs.length), coefficients = countCoefficients(low, high);
    return Array.from(coefficients, (x, k) => x - choose[k]);
  }

  const tri = k => k * (k + 1) / 2;
  const jointSize = n => tri(n + 1);
  function factors(logs, highWeights, lowWeights, target) {
    const low = [], high = [], other = [], targetHigh = [];
    for (const row of logs) {
      low.push(weightedRow(row, lowWeights));
      high.push(weightedRow(row, highWeights, 3));
      let outside = NEG, inside = NEG;
      for (let j = 0; j < 3; j++) if (highWeights[j] > 0) {
        const value = row[j + 3] + Math.log(highWeights[j]);
        if (inBand(j + 3, target)) inside = add(inside, value); else outside = add(outside, value);
      }
      other.push(outside); targetHigh.push(inside);
    }
    return {low, high, other, targetHigh};
  }

  // Packed (K456, Ktarget) triangle. Both variables refer to one placement.
  function jointCoefficients(f, keepPrefixes) {
    const n = f.low.length, dp = negativeArray(jointSize(n));
    dp[0] = 0;
    const prefixes = keepPrefixes ? [new Float64Array([0])] : null;
    for (let i = 0; i < n; i++) {
      for (let k = i + 1; k >= 0; k--) for (let j = k; j >= 0; j--) {
        const index = tri(k) + j;
        let value = k <= i ? dp[index] + f.low[i] : NEG;
        if (k > 0 && j < k) value = add(value, dp[tri(k - 1) + j] + f.other[i]);
        if (j > 0) value = add(value, dp[tri(k - 1) + j - 1] + f.targetHigh[i]);
        dp[index] = value;
      }
      if (prefixes) prefixes.push(dp.slice(0, jointSize(i + 1)));
    }
    return {coefficients: dp, prefixes};
  }

  function countPrior(n, id) {
    const choose = logChooseRow(n), out = new Float64Array(n + 1);
    if (id === 'flat') out.fill(-Math.log(n + 1));
    else if (id === 'binomial-0.1') for (let k = 0; k <= n; k++) out[k] = choose[k] + k * Math.log(.1) + (n - k) * Math.log(.9);
    else {
      const factorial = new Float64Array(n + 5);
      for (let j = 1; j < factorial.length; j++) factorial[j] = factorial[j - 1] + Math.log(j);
      for (let k = 0; k <= n; k++) out[k] = choose[k] + factorial[k] + factorial[n - k + 3] - factorial[n + 4] + Math.log(4);
    }
    return normalizedLogs(out);
  }

  function thinPrior(prior, probability) {
    const n = prior.length - 1, out = negativeArray(n + 1);
    if (probability === 0) { out[0] = sum(prior); return out; }
    if (probability === 1) return Float64Array.from(prior);
    for (let k = 0; k <= n; k++) {
      const choose = logChooseRow(k);
      for (let j = 0; j <= k; j++) out[j] = add(out[j], prior[k] + choose[j] + j * Math.log(probability) + (k - j) * Math.log1p(-probability));
    }
    return out;
  }

  function componentData(logs, highWeights, lowWeights) {
    const f = factors(logs, highWeights, lowWeights, '456');
    const count = countCoefficients(f.low, f.high), joints = {};
    for (const id of ['56', '6']) {
      const p = highWeights.reduce((total, w, j) => total + (inBand(j + 3, id) ? w : 0), 0);
      joints[id] = p === 0 || p === 1 ? {deterministic: p} : {coefficients: jointCoefficients(factors(logs, highWeights, lowWeights, id), false).coefficients};
    }
    return {count, joints};
  }

  function componentMass(data, prior, choose, id) {
    const n = prior.length - 1;
    const weightedCount = Array.from(data.count, (x, k) => x + prior[k] - choose[k]);
    if (id === '456' || data.joints[id].deterministic === 1) return weightedCount;
    const out = negativeArray(n + 1);
    if (data.joints[id].deterministic === 0) { out[0] = sum(weightedCount); return out; }
    const joint = data.joints[id].coefficients;
    for (let k = 0; k <= n; k++) for (let j = 0; j <= k; j++) out[j] = add(out[j], joint[tri(k) + j] + prior[k] - choose[k]);
    return out;
  }

  function summarize(logs, priorLogs, id) {
    const logDistribution = normalizedLogs(logs), logPriorDistribution = normalizedLogs(priorLogs);
    const distribution = logDistribution.map(Math.exp), priorDistribution = logPriorDistribution.map(Math.exp);
    const quantile = q => {
      let cumulative = 0;
      // DP/log normalization may put an exact CDF tie a few ulps below q.
      // Resolve ties to the lower quantile, within the numerical error budget.
      for (let k = 0; k < distribution.length; k++) { cumulative += distribution[k]; if (cumulative >= q - 1e-12) return k; }
      return distribution.length - 1;
    };
    return {id, distribution, priorDistribution, logDistribution, logPriorDistribution,
      expected: distribution.reduce((total, p, k) => total + k * p, 0), median: quantile(.5), interval: {lo: quantile(.05), hi: quantile(.95)}};
  }

  function evaluateModel(logs, config, cache) {
    const n = logs.length, prior = countPrior(n, config.prior), choose = logChooseRow(n);
    const mass = BAND_IDS.map(() => negativeArray(n + 1)), priorMass = BAND_IDS.map(() => negativeArray(n + 1));
    const componentEvidence = [];
    for (let r = 0; r < 4; r++) {
      if (config.mixtureWeights[r] === 0) { componentEvidence.push(NEG); continue; }
      const lw = Math.log(config.mixtureWeights[r]), high = HIGH_COMPONENTS[r];
      const key = `${config.lowWeights.join(',')}:${r}`;
      let data = cache.get(key);
      if (!data) { data = componentData(logs, high, config.lowWeights); cache.set(key, data); }
      for (let b = 0; b < 3; b++) {
        const id = BAND_IDS[b], cm = componentMass(data, prior, choose, id);
        const probability = high.reduce((total, w, j) => total + (inBand(j + 3, id) ? w : 0), 0);
        const cp = thinPrior(prior, probability);
        for (let k = 0; k <= n; k++) { mass[b][k] = add(mass[b][k], lw + cm[k]); priorMass[b][k] = add(priorMass[b][k], lw + cp[k]); }
        if (b === 0) componentEvidence.push(lw + sum(cm));
      }
    }
    const logEvidence = sum(mass[0]);
    return {config, mass, priorMass, logEvidence, componentPosterior: componentEvidence.map(x => Math.exp(x - logEvidence)),
      bands: BAND_IDS.map((id, b) => summarize(mass[b], priorMass[b], id))};
  }

  // Unlike a_i-b_i arithmetic, forced support remains defined when b_i=-Inf.
  function maximumNullLogLikelihood(logs, id, threshold) {
    let base = 0, forced = 0;
    const gains = [];
    for (const row of logs) {
      let high = NEG, low = NEG;
      for (let s = 0; s < 6; s++) { if (inBand(s, id)) high = Math.max(high, row[s]); else low = Math.max(low, row[s]); }
      if (high === NEG && low === NEG) return NEG;
      if (low === NEG) { forced++; base += high; }
      else { base += low; if (high !== NEG) gains.push(high - low); }
    }
    if (forced >= threshold) return NEG;
    gains.sort((a, b) => b - a);
    for (let j = 0; j < Math.min(threshold - 1 - forced, gains.length); j++) if (gains[j] > 0) base += gains[j];
    return base;
  }

  function detectionLogLikelihood(logs, id, threshold) {
    const n = logs.length, highIndices = [0, 1, 2, 3, 4, 5].filter(s => inBand(s, id));
    const lowWeights = Array.from({length: 6}, (_, s) => inBand(s, id) ? 0 : 1 / (6 - highIndices.length));
    const variants = highIndices.length === 1 ? [highIndices] : [highIndices, ...highIndices.map(s => [s])];
    let prediction = NEG;
    for (const indices of variants) {
      const highWeights = Array.from({length: 6}, (_, s) => indices.includes(s) ? 1 / indices.length : 0);
      const fixedCounts = countLogLikelihoods(logs, highWeights, lowWeights);
      prediction = add(prediction, sum(fixedCounts.slice(threshold)) - Math.log(n - threshold + 1) - Math.log(variants.length));
    }
    return prediction;
  }

  function selected(logs, spec, included) {
    let total = NEG;
    for (let k = 0; k < logs.length; k++) if (matches(k, spec) === included) total = add(total, logs[k]);
    return total;
  }

  function makeEvent(model, id, spec, context, registered) {
    const index = BAND_IDS.indexOf(id), logPrior = model.bands[index].logPriorDistribution;
    const ah = selected(logPrior, spec, true), ac = selected(logPrior, spec, false);
    const zh = selected(model.mass[index], spec, true), zc = selected(model.mass[index], spec, false), z = add(zh, zc);
    const mh = ah === NEG ? null : zh - ah, mc = ac === NEG ? null : zc - ac;
    const logBF = mh === null || mc === null ? null : ratio(mh, mc);
    const baselines = context.baselines.map(b => ({id: b.id, label: b.label, weights: b.weights.slice(), logLikelihood: b.logLikelihood,
      logBF: mh === null ? null : ratio(mh, b.logLikelihood)}));
    const best = context.baselines.reduce((a, b) => !a || b.logLikelihood > a.logLikelihood ? b : a, null);
    let logDetectionLikelihood = null, logNullMaximum = null, logEValue = null;
    if (registered) {
      logDetectionLikelihood = detectionLogLikelihood(context.logs, id, spec.count);
      logNullMaximum = maximumNullLogLikelihood(context.logs, id, spec.count);
      logEValue = ratio(logDetectionLikelihood, logNullMaximum);
    }
    const out = {kind: spec.kind, count: spec.count, priorProbability: Math.exp(ah), posteriorProbability: Math.exp(zh - z),
      logPriorProbability: ah, logPriorComplement: ac, logPosteriorProbability: zh - z, logPosteriorComplement: zc - z,
      logObservedMass: zh, logObservedComplement: zc, logLikelihood: mh, logBF, logEValue, logDetectionLikelihood, logNullMaximum,
      logThreshold: registered ? context.logThreshold : null, eRegistered: registered,
      modelPass: registered && logEValue !== null && logEValue >= context.logThreshold, strongEnabled: false,
      baselines, bestBaseline: best ? {id: best.id, logBF: mh === null ? null : ratio(mh, best.logLikelihood)} : null};
    if (spec.id) out.id = spec.id;
    if (ah === NEG || ac === NEG) out.comparisonReason = 'prior-degenerate';
    if (zh === NEG) out.reason = 'event-zero-support';
    return out;
  }

  // Assumption comparisons reuse the same event calculation, without reserving
  // any further e declaration or repeating large baseline/log-mass diagnostics.
  function diagnosticEvent(model, band, spec, context) {
    const {id, kind, count, priorProbability, posteriorProbability, logBF, eRegistered, logEValue, logThreshold, modelPass, strongEnabled} = makeEvent(model, band, spec, context, false);
    return {id, kind, count, priorProbability, posteriorProbability, logBF, eRegistered, logEValue, logThreshold, modelPass, strongEnabled};
  }

  // Reverse messages differentiate event mass with respect to each row/category.
  // The count prior is for all n rows throughout, including neutralized rows.
  function conditionalComponent(logs, high, low, spec, prior, choose) {
    const n = logs.length, f = factors(logs, high, low, spec.band);
    const {prefixes} = jointCoefficients(f, true);
    let bh = negativeArray(jointSize(n)), bc = negativeArray(jointSize(n));
    for (let k = 0; k <= n; k++) for (let j = 0; j <= k; j++) {
      (matches(j, spec) ? bh : bc)[tri(k) + j] = prior[k] - choose[k];
    }
    const observed = [], neutralH = [], neutralC = [];
    for (let i = n - 1; i >= 0; i--) {
      const gh = negativeArray(3), gc = negativeArray(3), prefix = prefixes[i];
      const nextH = negativeArray(jointSize(i)), nextC = negativeArray(jointSize(i));
      for (let k = 0; k <= i; k++) for (let j = 0; j <= k; j++) {
        const index = tri(k) + j, destinations = [index, tri(k + 1) + j, tri(k + 1) + j + 1];
        for (let category = 0; category < 3; category++) {
          gh[category] = add(gh[category], prefix[index] + bh[destinations[category]]);
          gc[category] = add(gc[category], prefix[index] + bc[destinations[category]]);
        }
        nextH[index] = add(add(f.low[i] + bh[destinations[0]], f.other[i] + bh[destinations[1]]), f.targetHigh[i] + bh[destinations[2]]);
        nextC[index] = add(add(f.low[i] + bc[destinations[0]], f.other[i] + bc[destinations[1]]), f.targetHigh[i] + bc[destinations[2]]);
      }
      const settingH = negativeArray(6);
      let nh = NEG, nc = NEG;
      for (let s = 0; s < 6; s++) {
        const w = s < 3 ? low[s] : high[s - 3], lw = logWeight(w);
        const category = s < 3 ? 0 : inBand(s, spec.band) ? 2 : 1;
        settingH[s] = logs[i][s] + lw + gh[category];
        nh = add(nh, lw + gh[category]); nc = add(nc, lw + gc[category]);
      }
      observed[i] = settingH; neutralH[i] = nh; neutralC[i] = nc;
      bh = nextH; bc = nextC;
    }
    return {observed, neutralH, neutralC};
  }

  function detailResult(inputRows, logs, model, spec, context) {
    const n = logs.length, registered = spec.kind === 'atLeast' && [n, Math.ceil(n / 2), Math.ceil(n / 3)].includes(spec.count);
    const event = makeEvent(model, spec.band, spec, context, registered);
    const rowMass = Array.from({length: n}, () => negativeArray(6)), neutralH = negativeArray(n), neutralC = negativeArray(n);
    if (event.logObservedMass !== NEG) {
      const prior = countPrior(n, 'flat'), choose = logChooseRow(n);
      for (let r = 0; r < 4; r++) {
        const component = conditionalComponent(logs, HIGH_COMPONENTS[r], MIXED, spec, prior, choose), lw = Math.log(.25);
        for (let i = 0; i < n; i++) {
          for (let s = 0; s < 6; s++) rowMass[i][s] = add(rowMass[i][s], lw + component.observed[i][s]);
          neutralH[i] = add(neutralH[i], lw + component.neutralH[i]);
          neutralC[i] = add(neutralC[i], lw + component.neutralC[i]);
        }
      }
    }
    const available = event.logObservedMass !== NEG;
    return {...event, band: spec.band, conditionalAvailable: available, rows: inputRows.map((row, i) => {
      const qLogs = available ? normalizedLogs(rowMass[i]) : null;
      const neutralBF = event.logPriorProbability === NEG || event.logPriorComplement === NEG ? null : ratio(neutralH[i] - event.logPriorProbability, neutralC[i] - event.logPriorComplement);
      const influence = event.logBF !== null && neutralBF !== null ? event.logBF - neutralBF : null;
      return {id: row.id == null ? `row-${i}` : row.id, tableNo: row.tableNo, machine: row.machine, input: clone(row.input), individual: clone(row.individual),
        conditionalQ: qLogs ? qLogs.map(Math.exp) : null, logConditionalQ: qLogs, logBFNeutralized: available ? neutralBF : null,
        logBFInfluence: available && influence !== null && !Number.isNaN(influence) ? influence : null, influenceN: n, influenceCount: spec.count};
    })};
  }

  function failure(reason, n) {
    return {ok: false, version: VERSION, n: Number.isInteger(n) ? n : 0, bands: [], detail: null, sensitivity: [],
      warnings: ['入力の不足または不整合により計算を保留しました。'], reason, strongEnabled: false};
  }

  function analyzeMachine(input) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.rows)) return failure('invalid-rows');
    const {rows} = input, n = rows.length;
    if (n < 1 || n > 120) return failure(n > 120 ? 'maximum-rows-exceeded' : 'empty-rows', n);
    const familySize = input.familySize === undefined ? 9 : input.familySize, alpha = input.alpha === undefined ? .05 : input.alpha;
    // Even a standalone caller receives all three bands and their distinct
    // principal thresholds. The store service reserves an equal or larger M.
    const minimumFamilySize = 3 * new Set([n, Math.ceil(n / 2), Math.ceil(n / 3)]).size;
    if (!Number.isSafeInteger(familySize) || familySize < minimumFamilySize) return failure('invalid-family-size', n);
    if (typeof alpha !== 'number' || !Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) return failure('invalid-alpha', n);
    if (input.includeSensitivity !== undefined && typeof input.includeSensitivity !== 'boolean') return failure('invalid-sensitivity-option', n);
    const detail = input.detail === undefined ? null : input.detail;
    if (detail !== null && (!detail || !BAND_IDS.includes(detail.band) || !['exact', 'atLeast'].includes(detail.kind) || !Number.isInteger(detail.count) || detail.count < 0 || detail.count > n)) return failure('invalid-detail', n);
    const logs = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') return failure('invalid-row', n);
      const values = row.bonusLogs === undefined ? row.logs : row.bonusLogs;
      if (!Array.isArray(values) || values.length !== 6 || values.some(x => typeof x !== 'number' || (x !== NEG && !Number.isFinite(x)))) return failure('invalid-likelihoods', n);
      const maximum = Math.max(...values);
      if (maximum === NEG) return failure('row-zero-support', n);
      // Row constants cancel in every posterior, BF and e-value. Remove them
      // before DP to retain precision under large negative absolute likelihoods.
      logs.push(values.map(x => x === NEG ? NEG : x - maximum));
    }
    const cache = new Map(), main = evaluateModel(logs, SENSITIVITY[0], cache);
    if (!Number.isFinite(main.logEvidence)) return failure('numerical-zero-support', n);
    const baselines = BASELINES.map(b => ({...b, logLikelihood: logs.reduce((total, row) => total + weightedRow(row, b.weights), 0)}));
    const context = {logs, baselines, logThreshold: Math.log(familySize) - Math.log(alpha)};
    const models = input.includeSensitivity === false ? [main] : [main, ...SENSITIVITY.slice(1).map(config => evaluateModel(logs, config, cache))];
    const principalSpecs = [{id: 'all', kind: 'atLeast', count: n}, {id: 'half', kind: 'atLeast', count: Math.ceil(n / 2)}, {id: 'third', kind: 'atLeast', count: Math.ceil(n / 3)}];
    const bands = main.bands.map((b, index) => ({...b,
      sensitivityRange: {lo: Math.min(...models.map(m => m.bands[index].interval.lo)), hi: Math.max(...models.map(m => m.bands[index].interval.hi))},
      events: principalSpecs.map(spec => makeEvent(main, b.id, spec, context, true))}));
    const selectedDetail = detail ? {...detailResult(rows, logs, main, detail, context),
      sensitivityComparisons: input.includeSensitivity === false ? [] : models.map(m => ({...diagnosticEvent(m, detail.band, detail, context), id: m.config.id}))} : null;
    return {ok: true, version: VERSION, n, familySize, alpha, bands, detail: selectedDetail,
      sensitivity: input.includeSensitivity === false ? [] : models.map(m => ({id: m.config.id, prior: m.config.prior,
        mixtureWeights: m.config.mixtureWeights.slice(), lowWeights: m.config.lowWeights.slice(),
        bands: m.bands.map(b => ({...b, events: principalSpecs.map(spec => diagnosticEvent(m, b.id, spec, context))})), componentPosterior: m.componentPosterior})),
      assumptions: {id: 'shared4-flat', countPrior: 'flat', mixtureWeights: DEFAULT_MIX.slice(), highComponents: HIGH_COMPONENTS.map(x => x.slice()),
        lowWeights: MIXED.slice(), intervalMass: .9, componentPosterior: main.componentPosterior, sensitivityCount: input.includeSensitivity === false ? 0 : 9,
        detectionMixture: 'fixed-band-components-uniform-atLeast-count', calibrated: false},
      warnings: ['配分の仮定に基づく参考分析です。強い候補表示は未校正のため無効です。'], strongEnabled: false};
  }

  root.JUGESTStoreDayAllocation = Object.freeze({version: VERSION, analyzeMachine,
    // Pure, unscaled log-likelihood functions for independent numerical checks.
    __test: Object.freeze({countLogLikelihoods, maximumNullLogLikelihood, detectionLogLikelihood, logChooseRow,
      countPrior: (n, id) => Array.from(countPrior(n, id)), logAdd: add})});
})(globalThis);
