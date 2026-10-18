import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';

// This suite catches lost combination averages, separately fitted bands,
// component-wise conditioning, unsafe support arithmetic and changed row q.
const file = new URL('../store-day-allocation.js', import.meta.url);
const context = vm.createContext({console});
if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
const engine = context.JUGESTStoreDayAllocation;
assert.equal(typeof engine?.analyzeMachine, 'function', 'allocation engine is not implemented');
const analyze = input => engine.analyzeMachine(input);
const plain = x => structuredClone(x);
const close = (a, b, tolerance = 1e-10) => assert.ok(Object.is(a, b) || Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const vectorClose = (a, b, tolerance = 1e-10) => { assert.equal(a.length, b.length); a.forEach((x, i) => close(x, b[i], tolerance)); };
const band = (result, id) => result.bands.find(b => b.id === id);
const event = (result, id, name) => band(result, id).events.find(e => e.id === name);
const rows = logs => logs.map((l, i) => ({id: `r${i}`, tableNo: `${100 + i}`, machine: 'my', logs: l, individual: {q: [1, 2, 3, 4, 5, 6]}}));
const neutral = n => rows(Array.from({length: n}, () => Array(6).fill(0)));
const choose = (n, k) => { let c = 1; for (let j = 1; j <= k; j++) c *= (n - j + 1) / j; return c; };
const counts = s => [s.filter(x => x >= 3).length, s.filter(x => x >= 4).length, s.filter(x => x === 5).length];
const mixtures = [[1/3, 1/3, 1/3], [1, 0, 0], [0, 1, 0], [0, 0, 1]];

// Independent small-n reference: enumerate all 6^n fixed configurations.
function enumerate(logs, {mix = [.25, .25, .25, .25], low = [1/3, 1/3, 1/3], prior = null, detail = null} = {}) {
  const n = logs.length, pi = prior ?? Array(n + 1).fill(1 / (n + 1));
  const priorMass = Array.from({length: 3}, () => Array(n + 1).fill(0));
  const mass = priorMass.map(x => x.slice());
  const conditional = Array.from({length: n}, () => Array(6).fill(0));
  let total = 0, eventMass = 0, eventPrior = 0;
  for (let code = 0; code < 6 ** n; code++) {
    let z = code; const s = [];
    for (let i = 0; i < n; i++, z = Math.floor(z / 6)) s.push(z % 6);
    const ks = counts(s), k = ks[0];
    let p = 0;
    for (let r = 0; r < 4; r++) {
      let term = mix[r] * pi[k] / choose(n, k);
      for (const setting of s) term *= setting < 3 ? low[setting] : mixtures[r][setting - 3];
      p += term;
    }
    const likelihood = Math.exp(s.reduce((sum, x, i) => sum + logs[i][x], 0));
    const likelihoodMass = p * likelihood;
    total += likelihoodMass;
    for (let b = 0; b < 3; b++) { priorMass[b][ks[b]] += p; mass[b][ks[b]] += likelihoodMass; }
    if (detail) {
      const kTarget = ks[['456', '56', '6'].indexOf(detail.band)];
      if (detail.kind === 'exact' ? kTarget === detail.count : kTarget >= detail.count) {
        eventMass += likelihoodMass; eventPrior += p;
        s.forEach((setting, i) => { conditional[i][setting] += likelihoodMass; });
      }
    }
  }
  return {priorMass, mass, total, distributions: mass.map(b => b.map(x => x / total)), eventMass, eventPrior,
    conditional: conditional.map(r => r.map(x => x / eventMass))};
}

let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`ok ${passed} - ${name}`); }

test('two-row count likelihood averages both placements', () => {
  const result = engine.__test.countLogLikelihoods([[1, 2, 3, 5, 7, 9].map(Math.log), [2, 4, 6, 8, 10, 12].map(Math.log)], [0, 0, 0, 1/3, 1/3, 1/3], [1/3, 1/3, 1/3, 0, 0, 0]);
  vectorClose(result.map(Math.exp), [8, 24, 70]);
});

test('neutral observations preserve shared prior and give unit Bayes factors', () => {
  const result = analyze({rows: neutral(5)});
  assert.equal(result.ok, true);
  vectorClose(band(result, '456').distribution, Array(6).fill(1/6));
  for (const b of result.bands) {
    vectorClose(b.distribution, b.priorDistribution);
    for (const e of b.events) { close(e.logBF, 0); close(e.logEValue, 0); assert.equal(e.modelPass, false); }
  }
  close(event(result, '456', 'half').priorProbability, .5);
  assert.equal(event(result, '456', 'half').count, 3);
  assert.equal(event(result, '456', 'third').count, 2);
});

test('neutral equal-tail boundaries use lower quantiles consistently at exact CDF ties', () => {
  const result = analyze({rows: neutral(19), includeSensitivity: false});
  assert.deepEqual(plain(band(result, '456').interval), {lo: 0, hi: 18});
  assert.equal(band(result, '456').median, 9);
});

test('all6 prior uses shared components rather than exponential independence alone', () => {
  const result = analyze({rows: neutral(58), includeSensitivity: false});
  close(event(result, '6', 'all').priorProbability, (1 + 3 ** -58) / (4 * 59));
  assert.equal(result.strongEnabled, false);
  for (const b of result.bands) for (const e of b.events) assert.equal(e.strongEnabled, false);
});

const fixture = [[.2, .4, .7, 2, 3, 5], [1.5, 1, .5, 4, 2, .7], [2, 1.1, .9, .3, 1.5, 6]].map(r => r.map(Math.log));
test('three inclusive bands and events match all six-setting configurations', () => {
  const result = analyze({rows: rows(fixture)}), ref = enumerate(fixture);
  for (let b = 0; b < 3; b++) {
    vectorClose(result.bands[b].distribution, ref.distributions[b]);
    vectorClose(result.bands[b].priorDistribution, ref.priorMass[b]);
    for (const e of result.bands[b].events) {
      const zh = ref.mass[b].slice(e.count).reduce((a, x) => a + x, 0);
      const zc = ref.mass[b].slice(0, e.count).reduce((a, x) => a + x, 0);
      const ah = ref.priorMass[b].slice(e.count).reduce((a, x) => a + x, 0);
      const ac = ref.priorMass[b].slice(0, e.count).reduce((a, x) => a + x, 0);
      close(e.posteriorProbability, zh / ref.total);
      close(e.logBF, Math.log(zh / ah) - Math.log(zc / ac));
      assert.equal(e.baselines.length, 3);
    }
  }
  for (const name of ['all', 'half', 'third']) {
    assert.ok(event(result, '6', name).posteriorProbability <= event(result, '56', name).posteriorProbability + 1e-12);
    assert.ok(event(result, '56', name).posteriorProbability <= event(result, '456', name).posteriorProbability + 1e-12);
  }
});

test('detail conditions mixed masses first and keeps ordinary q unchanged', () => {
  const detail = {band: '6', kind: 'exact', count: 2};
  const inputRows = rows(fixture), frozen = JSON.stringify(inputRows), ref = enumerate(fixture, {detail});
  const result = analyze({rows: inputRows, detail});
  assert.equal(result.ok, true);
  close(result.detail.posteriorProbability, ref.eventMass / ref.total);
  result.detail.rows.forEach((r, i) => {
    vectorClose(r.conditionalQ, ref.conditional[i]);
    assert.deepEqual(plain(r.individual), inputRows[i].individual);
  });
  close(result.detail.rows.reduce((sum, r) => sum + r.conditionalQ[5], 0), 2);
  assert.equal(result.detail.logEValue, null);
  assert.equal(result.detail.modelPass, false);
  assert.equal(JSON.stringify(inputRows), frozen);
});

test('at-least detail returns conditional marginals and neutralized-row influence', () => {
  const detail = {band: '56', kind: 'atLeast', count: 2};
  const result = analyze({rows: rows(fixture), detail});
  const ref = enumerate(fixture, {detail});
  result.detail.rows.forEach((r, i) => {
    vectorClose(r.conditionalQ, ref.conditional[i]);
    const neutralized = fixture.map((x, j) => j === i ? Array(6).fill(0) : x);
    const nf = enumerate(neutralized, {detail});
    const bf = Math.log(nf.eventMass / nf.eventPrior) - Math.log((nf.total - nf.eventMass) / (1 - nf.eventPrior));
    close(r.logBFInfluence, result.detail.logBF - bf);
    assert.equal(r.influenceN, 3);
    assert.equal(r.influenceCount, 2);
  });
});

test('normal baseline ratios use declared complete fixed distributions', () => {
  const result = analyze({rows: rows(fixture)}), ref = enumerate(fixture);
  const all = event(result, '456', 'all');
  const eventLikelihood = ref.mass[0][3] / ref.priorMass[0][3];
  for (const [id, weights] of [
    ['low-centered', [.7, .2, .1, 0, 0, 0]],
    ['middle-centered', [.1, .2, .5, .15, .04, .01]],
    ['some-high', [.5, .25, .15, .06, .03, .01]]
  ]) {
    const b = all.baselines.find(x => x.id === id);
    const m = fixture.reduce((p, l) => p * l.reduce((x, v, s) => x + Math.exp(v) * weights[s], 0), 1);
    close(b.logBF, Math.log(eventLikelihood / m));
  }
  close(all.bestBaseline.logBF, Math.min(...all.baselines.map(x => x.logBF)));
});

test('maximum null handles forced support, negative gains and ties', () => {
  const logs = [[-2, -1, 0, -3, -4, -5], [-2, -2, -2, -1, 0, 0], [-1, -1, -1, -1, -1, -1]];
  for (const id of ['456', '56', '6']) for (const threshold of [1, 2, 3]) {
    let maximum = -Infinity;
    for (let code = 0; code < 216; code++) {
      const s = [code % 6, Math.floor(code / 6) % 6, Math.floor(code / 36)];
      if (counts(s)[['456', '56', '6'].indexOf(id)] < threshold) maximum = Math.max(maximum, logs.reduce((sum, r, i) => sum + r[s[i]], 0));
    }
    close(engine.__test.maximumNullLogLikelihood(logs, id, threshold), maximum);
  }
  assert.equal(engine.__test.maximumNullLogLikelihood([[-Infinity, -Infinity, -Infinity, 0, -Infinity, -Infinity]], '456', 1), -Infinity);
});

test('fixed detection mixtures average normalized alternatives', () => {
  const result = analyze({rows: rows(fixture), familySize: 27, alpha: .025});
  for (const b of result.bands) for (const e of b.events) {
    const n = fixture.length, high = b.id === '456' ? [3, 4, 5] : b.id === '56' ? [4, 5] : [5];
    const low = [0, 1, 2, 3, 4, 5].filter(s => !high.includes(s));
    const us = high.length === 1 ? [high] : [high, ...high.map(s => [s])];
    let q = 0, maximum = -Infinity;
    for (let code = 0; code < 6 ** n; code++) {
      let z = code; const s = [];
      for (let i = 0; i < n; i++, z = Math.floor(z / 6)) s.push(z % 6);
      const k = s.filter(x => high.includes(x)).length;
      const ll = fixture.reduce((sum, l, i) => sum + l[s[i]], 0);
      if (k < e.count) maximum = Math.max(maximum, ll);
      else for (const u of us) {
        let p = 1 / us.length / (n - e.count + 1) / choose(n, k);
        for (const x of s) p *= high.includes(x) ? (u.includes(x) ? 1 / u.length : 0) : 1 / low.length;
        q += p * Math.exp(ll);
      }
    }
    close(e.logEValue, Math.log(q) - maximum);
    close(e.logThreshold, Math.log(27 / .025));
  }
});

test('family size cannot be smaller than the distinct declarations returned for this group',()=>{
  for(const [n,minimum] of [[1,3],[2,6],[3,9],[12,9]]){
    const rejected=analyze({rows:neutral(n),familySize:minimum-1});
    assert.equal(rejected.ok,false);assert.equal(rejected.reason,'invalid-family-size');
    assert.equal(analyze({rows:neutral(n),familySize:minimum}).ok,true);
  }
});

test('one neutral row keeps every all-event e-value at most one', () => {
  const result = analyze({rows: rows([Array(6).fill(0), [-1000, -1000, -1000, 0, 0, 0], [-1000, -1000, -1000, -1000, -1000, 0]])});
  for (const b of result.bands) assert.ok(b.events.find(e => e.id === 'all').logEValue <= 1e-10);
});

test('nine fixed sensitivities preserve their shared-prior marginals and envelope', () => {
  const result = analyze({rows: neutral(4)});
  assert.equal(result.sensitivity.length, 9);
  for (const model of result.sensitivity) for (const b of model.bands) vectorClose(b.distribution, b.priorDistribution);
  const binomial = result.sensitivity.find(x => x.id === 'shared4-binomial-0.1');
  vectorClose(binomial.bands[0].priorDistribution, [.6561, .2916, .0486, .0036, .0001]);
  for (const b of result.bands) {
    close(b.sensitivityRange.lo, Math.min(...result.sensitivity.map(m => m.bands.find(x => x.id === b.id).interval.lo)));
    close(b.sensitivityRange.hi, Math.max(...result.sensitivity.map(m => m.bands.find(x => x.id === b.id).interval.hi)));
  }
});

test('sensitivity event diagnostics retain principal BF without adding e declarations', () => {
  const result = analyze({rows: rows(fixture), familySize: 27, alpha: .025});
  const unchanged = analyze({rows: rows(fixture), familySize: 27, alpha: .025, includeSensitivity: false});
  const defaultModel = result.sensitivity.find(m => m.id === 'shared4-flat');
  for (const b of defaultModel.bands) {
    assert.ok(Array.isArray(b.events), 'sensitivity bands must expose event comparisons');
    assert.equal(b.events.length, 3);
    for (const e of b.events) {
      assert.deepEqual(Object.keys(e).sort(), ['id', 'kind', 'count', 'priorProbability', 'posteriorProbability', 'logBF', 'eRegistered', 'logEValue', 'logThreshold', 'modelPass', 'strongEnabled'].sort());
      const principal = event(result, b.id, e.id);
      close(e.logBF, principal.logBF);
      close(e.priorProbability, principal.priorProbability);
      close(e.posteriorProbability, principal.posteriorProbability);
      assert.equal(e.eRegistered, false);
      assert.equal(e.logEValue, null);
      assert.equal(e.logThreshold, null);
      assert.equal(e.modelPass, false);
      assert.equal(e.strongEnabled, false);
      assert.equal(principal.eRegistered, true);
      close(principal.logThreshold, Math.log(27 / .025));
    }
    assert.deepEqual(plain(band(result, b.id).events), plain(band(unchanged, b.id).events));
  }
  assert.equal(result.familySize, 27);
});

test('all nine neutral sensitivity event comparisons keep unit BF and fixed thresholds', () => {
  for (const [n, counts] of [[1, [1, 1, 1]], [2, [2, 1, 1]], [5, [5, 3, 2]]]) {
    const result = analyze({rows: neutral(n)});
    for (const m of result.sensitivity) for (const b of m.bands) {
      assert.ok(Array.isArray(b.events), 'each fixed prior must expose event comparisons');
      vectorClose(b.events.map(e => e.count), counts, 0);
      for (const e of b.events) {
        close(e.logBF, 0);
        close(e.posteriorProbability, e.priorProbability);
        assert.equal(e.eRegistered, false);
        assert.equal(e.logEValue, null);
        assert.equal(e.modelPass, false);
      }
    }
  }
});

test('event diagnostics expose a BF direction change across fixed assumptions', () => {
  const result = analyze({rows: rows(Array.from({length: 3}, () => [1, 1, 1, 2.5, .2, .1].map(Math.log)))});
  const comparison = id => result.sensitivity.find(m => m.id === id).bands.find(b => b.id === '456').events.find(e => e.id === 'all');
  assert.ok(comparison('shared4-flat').logBF > 0, 'shared structure favors the all456 event');
  assert.ok(comparison('independent-flat').logBF < 0, 'independent high settings favor its complement');
  assert.equal(comparison('shared4-flat').modelPass, false);
  assert.equal(comparison('independent-flat').modelPass, false);
});

test('each sensitivity under informative observations matches its declared full prior', () => {
  const result = analyze({rows: rows(fixture)});
  const specifications = [
    ['shared4-flat', [.25, .25, .25, .25], [1/3, 1/3, 1/3], [.25, .25, .25, .25]],
    ['independent-flat', [1, 0, 0, 0], [1/3, 1/3, 1/3], [.25, .25, .25, .25]],
    ['mixed70-flat', [.7, .1, .1, .1], [1/3, 1/3, 1/3], [.25, .25, .25, .25]],
    ['shared4-binomial-0.1', [.25, .25, .25, .25], [1/3, 1/3, 1/3], [.729, .243, .027, .001]],
    ['shared4-beta-binomial-1-4', [.25, .25, .25, .25], [1/3, 1/3, 1/3], [4/7, 2/7, 4/35, 1/35]],
    ['shared4-low1', [.25, .25, .25, .25], [.7, .2, .1], [.25, .25, .25, .25]],
    ['shared4-low3', [.25, .25, .25, .25], [.1, .2, .7], [.25, .25, .25, .25]],
    ['high4-flat', [.25, .5, .125, .125], [1/3, 1/3, 1/3], [.25, .25, .25, .25]],
    ['high6-flat', [.25, .125, .125, .5], [1/3, 1/3, 1/3], [.25, .25, .25, .25]]
  ];
  for (const [id, mix, low, prior] of specifications) {
    const model = result.sensitivity.find(m => m.id === id), ref = enumerate(fixture, {mix, low, prior});
    model.bands.forEach((b, i) => {
      vectorClose(b.distribution, ref.distributions[i]); vectorClose(b.priorDistribution, ref.priorMass[i]);
      for (const e of b.events) {
        const ah = ref.priorMass[i].slice(e.count).reduce((total, x) => total + x, 0);
        const ac = ref.priorMass[i].slice(0, e.count).reduce((total, x) => total + x, 0);
        const zh = ref.mass[i].slice(e.count).reduce((total, x) => total + x, 0);
        const zc = ref.mass[i].slice(0, e.count).reduce((total, x) => total + x, 0);
        close(e.priorProbability, ah);
        close(e.posteriorProbability, zh / ref.total);
        close(e.logBF, Math.log(zh / ah) - Math.log(zc / ac));
        assert.equal(e.eRegistered, false);
        assert.equal(e.logEValue, null);
        assert.equal(e.modelPass, false);
      }
    });
    close(model.componentPosterior.reduce((a, x) => a + x, 0), 1);
  }
});

test('selected exact and nonprincipal detail compare all fixed priors without e declarations', () => {
  const inputRows = rows([...fixture, ...fixture]);
  for (const detail of [{band: '6', kind: 'exact', count: 2}, {band: '56', kind: 'atLeast', count: 4}]) {
    const result = analyze({rows: inputRows, detail, familySize: 27});
    assert.ok(Array.isArray(result.detail.sensitivityComparisons), 'detail must expose selected prior comparisons');
    assert.equal(result.detail.sensitivityComparisons.length, 9);
    for (const comparison of result.detail.sensitivityComparisons) {
      assert.deepEqual(Object.keys(comparison).sort(), ['id', 'kind', 'count', 'priorProbability', 'posteriorProbability', 'logBF', 'eRegistered', 'logEValue', 'logThreshold', 'modelPass', 'strongEnabled'].sort());
      const model = result.sensitivity.find(m => m.id === comparison.id), b = model.bands.find(x => x.id === detail.band);
      const select = (values, included) => values.reduce((total, value, count) => total + ((detail.kind === 'exact' ? count === detail.count : count >= detail.count) === included ? value : 0), 0);
      const ph = select(b.distribution, true), pc = select(b.distribution, false);
      const ah = select(b.priorDistribution, true), ac = select(b.priorDistribution, false);
      close(comparison.priorProbability, ah);
      close(comparison.posteriorProbability, ph);
      close(comparison.logBF, Math.log(ph / pc) - Math.log(ah / ac));
      assert.equal(comparison.kind, detail.kind);
      assert.equal(comparison.count, detail.count);
      assert.equal(comparison.eRegistered, false);
      assert.equal(comparison.logEValue, null);
      assert.equal(comparison.logThreshold, null);
      assert.equal(comparison.modelPass, false);
    }
    close(result.detail.sensitivityComparisons[0].logBF, result.detail.logBF);
    assert.equal(result.familySize, 27);
    const skipped = analyze({rows: inputRows, detail, includeSensitivity: false});
    assert.deepEqual(plain(skipped.detail.sensitivityComparisons), []);
  }
});

test('conditional detail across every band and exact boundary matches enumeration', () => {
  for (const id of ['456', '56', '6']) for (const count of [0, 1, 3]) {
    const detail = {band: id, kind: 'exact', count}, ref = enumerate(fixture, {detail});
    const result = analyze({rows: rows(fixture), detail, includeSensitivity: false});
    result.detail.rows.forEach((r, i) => vectorClose(r.conditionalQ, ref.conditional[i]));
    const settings = id === '456' ? [3, 4, 5] : id === '56' ? [4, 5] : [5];
    close(result.detail.rows.reduce((total, r) => total + settings.reduce((p, s) => p + r.conditionalQ[s], 0), 0), count);
  }
});

test('unregistered arbitrary count detail cannot reuse principal declaration threshold', () => {
  const result = analyze({rows: neutral(6), detail: {band: '456', kind: 'atLeast', count: 4}, includeSensitivity: false});
  assert.equal(result.detail.eRegistered, false);
  assert.equal(result.detail.logEValue, null);
  assert.equal(result.detail.logThreshold, null);
  assert.equal(result.detail.modelPass, false);
  const certain = analyze({rows: neutral(1), detail: {band: '6', kind: 'atLeast', count: 0}, includeSensitivity: false});
  assert.equal(certain.detail.logBF, null);
  assert.equal(certain.detail.comparisonReason, 'prior-degenerate');
  close(certain.detail.posteriorProbability, 1);
});

test('zero support of the null produces infinite evidence without enabling strong output', () => {
  const result = analyze({rows: rows([[-Infinity, -Infinity, -Infinity, -Infinity, -Infinity, 0]]), detail: {band: '6', kind: 'exact', count: 1}});
  const e = event(result, '6', 'all');
  assert.equal(e.logNullMaximum, -Infinity);
  assert.equal(e.logEValue, Infinity);
  assert.equal(e.strongEnabled, false);
  vectorClose(result.detail.rows[0].conditionalQ, [0, 0, 0, 0, 0, 1]);
  const noNaN = value => {
    if (typeof value === 'number') assert.equal(Number.isNaN(value), false);
    else if (value && typeof value === 'object') for (const x of Object.values(value)) noNaN(x);
  };
  noNaN(result);
});

test('per-row common shifts, row order and table labels do not change conclusions', () => {
  const a = analyze({rows: rows(fixture)});
  const b = analyze({rows: rows(fixture.map((r, i) => r.map(x => x + 1e6 * (i + 1)))).reverse().map((r, i) => ({...r, tableNo: `${999 - i}`}))});
  a.bands.forEach((x, i) => {
    vectorClose(x.distribution, b.bands[i].distribution, 1e-9);
    x.events.forEach((e, j) => { close(e.logBF, b.bands[i].events[j].logBF, 1e-9); close(e.logEValue, b.bands[i].events[j].logEValue, 1e-9); });
  });
});

test('bonus logs override combined logs and remain immutable', () => {
  const r = rows(fixture).map(x => ({...x, bonusLogs: Array(6).fill(0)}));
  const frozen = JSON.stringify(r), result = analyze({rows: r, includeSensitivity: false});
  vectorClose(band(result, '456').distribution, Array(4).fill(.25));
  assert.equal(JSON.stringify(r), frozen);
});

test('impossible exact event is held with explicit zero support and no NaN', () => {
  const result = analyze({rows: rows([[0, -Infinity, -Infinity, -Infinity, -Infinity, -Infinity]]), detail: {band: '456', kind: 'exact', count: 1}});
  assert.equal(result.ok, true);
  assert.equal(result.detail.posteriorProbability, 0);
  assert.equal(result.detail.conditionalAvailable, false);
  assert.equal(result.detail.reason, 'event-zero-support');
  assert.equal(result.detail.rows[0].conditionalQ, null);
  assert.equal(result.detail.modelPass, false);
});

test('strong evidence keeps complementary log masses instead of subtracting rounded one', () => {
  const result = analyze({rows: rows(Array.from({length: 3}, () => [-1000, -1000, -1000, -1000, -1000, 0]))});
  const e = event(result, '6', 'all');
  assert.equal(e.posteriorProbability, 1);
  assert.ok(Number.isFinite(e.logBF));
  assert.ok(e.logBF > 900);
  assert.ok(e.logPosteriorComplement < -900);
  assert.equal(e.strongEnabled, false);
});

test('malformed and unsupported inputs fail with reasons rather than throwing or coercing', () => {
  for (const input of [null, {}, {rows: []}, {rows: neutral(121)}, {rows: [{logs: [0, 1]}]}, {rows: [{logs: [0, 0, 0, 0, 0, NaN]}]},
    {rows: [{logs: Array(6).fill(-Infinity)}]}, {rows: [{logs: ['0', 0, 0, 0, 0, 0]}]}, {rows: neutral(1), familySize: 0},
    {rows: neutral(1), alpha: 1}, {rows: neutral(2), detail: {band: 'bad', kind: 'exact', count: 1}},
    {rows: neutral(2), detail: {band: '456', kind: 'exact', count: 2.5}}]) {
    const result = analyze(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.equal(typeof result.reason, 'string');
    assert.equal(result.strongEnabled, false);
  }
});

test('n=120 remains normalized and supports exact conditional detail', () => {
  const start = performance.now();
  const logs = Array.from({length: 120}, (_, i) => Array.from({length: 6}, (_, s) => -((i * 13 + s * 7) % 29) / 9));
  const result = analyze({rows: rows(logs), detail: {band: '56', kind: 'exact', count: 55}});
  assert.equal(result.ok, true);
  for (const b of result.bands) { close(b.distribution.reduce((a, x) => a + x, 0), 1); assert.equal(b.distribution.length, 121); }
  close(result.detail.rows.reduce((sum, r) => sum + r.conditionalQ[4] + r.conditionalQ[5], 0), 55, 1e-8);
  console.log(`n120 sensitivity+detail ${Math.round(performance.now() - start)}ms`);
});

console.log(`store-day-allocation: ${passed}/${passed} passed`);
