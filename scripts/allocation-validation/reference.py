#!/usr/bin/env python3
"""Independent small-n configuration enumerator for store-day allocation.

This deliberately enumerates all 6**n assignments instead of using production
dynamic programming. Detection mixtures are separately normalized on the event.
JSON on stdin: {cases:[{name,logs:[[6],...],detail:{band,kind,count}}]}.
Nonfinite input/output is represented by the strings Infinity/-Infinity.
"""
import itertools
import json
import math
import sys
from decimal import Decimal, localcontext

NEG = -math.inf
BANDS = {"456": (3, 4, 5), "56": (4, 5), "6": (5,)}
BASELINES = {
    "low": (.70, .20, .10, 0, 0, 0),
    "middle": (.10, .20, .50, .15, .04, .01),
    "someHigh": (.50, .25, .15, .06, .03, .01),
}


def ladd(a, b):
    if a == NEG:
        return b
    if b == NEG:
        return a
    m = max(a, b)
    return m + math.log1p(math.exp(min(a, b) - m))


def lsum(xs):
    xs = list(xs)
    if not xs:
        return NEG
    m = max(xs)
    return NEG if m == NEG else m + math.log(math.fsum(math.exp(x-m) for x in xs))


def lp(x):
    return math.log(x) if x > 0 else NEG


def decode(x):
    if isinstance(x, dict):
        return {k: decode(v) for k, v in x.items()}
    if isinstance(x, list):
        return [decode(v) for v in x]
    if x == "-Infinity":
        return NEG
    if x == "Infinity":
        return math.inf
    return x


def encode(x):
    if isinstance(x, dict):
        return {k: encode(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [encode(v) for v in x]
    if isinstance(x, float) and not math.isfinite(x):
        return "-Infinity" if x < 0 else "Infinity" if x > 0 else "NaN"
    return x


def normalized_logs(logs):
    result = []
    shift = 0.
    for row in logs:
        if len(row) != 6 or any(math.isnan(x) or x == math.inf for x in row):
            raise ValueError("six finite-or-negative-infinite logs are required")
        m = max(row)
        if m == NEG:
            raise ValueError("row has zero support under every setting")
        result.append([x-m for x in row])
        shift += m
    return result, shift


def pi(n, kind):
    if kind == "flat":
        return [1/(n+1)]*(n+1)
    if kind == "binomial":
        return [math.comb(n, k)*.1**k*.9**(n-k) for k in range(n+1)]
    if kind == "beta-binomial":
        return [4*math.comb(n, k)*math.factorial(k)*math.factorial(n-k+3)/math.factorial(n+4)
                for k in range(n+1)]
    raise ValueError(kind)


def shared_prior(assignment, weights=(.25, .25, .25, .25),
                 low=(1/3, 1/3, 1/3), kind="flat"):
    n = len(assignment)
    k = sum(s >= 3 for s in assignment)
    low_part = math.prod(low[s] for s in assignment if s < 3)
    high = [s for s in assignment if s >= 3]
    mixed = weights[0] * (1/3)**k
    single = sum(weights[s-2] for s in (3, 4, 5) if all(t == s for t in high))
    return pi(n, kind)[k]/math.comb(n, k) * low_part * (mixed+single)


MODELS = {
    "shared4-flat": {},
    "independent-flat": {"weights": (1., 0., 0., 0.)},
    "mixed70-flat": {"weights": (.7, .1, .1, .1)},
    "shared4-binomial-0.1": {"kind": "binomial"},
    "shared4-beta-binomial-1-4": {"kind": "beta-binomial"},
    "shared4-low1": {"low": (.7, .2, .1)},
    "shared4-low3": {"low": (.1, .2, .7)},
    "high4-flat": {"weights": (.25, .5, .125, .125)},
    "high6-flat": {"weights": (.25, .125, .125, .5)},
}


def detection_prior(assignment, band, count):
    """Fixed predictive distribution from spec 6.3, not shared posterior prior."""
    n = len(assignment)
    inside = BANDS[band]
    outside = tuple(s for s in range(6) if s not in inside)
    high = [s for s in assignment if s in inside]
    k = len(high)
    if k < count:
        return 0.
    # Uniform count in t..n, uniform positions, uniform outside settings.
    count_position_low = 1/((n-count+1)*math.comb(n, k)) * (1/len(outside))**(n-k)
    if len(inside) == 1:
        high_probability = 1.
    else:
        components = [(1/len(inside))**k]
        components.extend(float(all(x == setting for x in high)) for setting in inside)
        high_probability = math.fsum(components)/(len(inside)+1)
    return count_position_low*high_probability


def summarize(assignments, logs, priors):
    n = len(logs)
    ll = [math.fsum(logs[i][s] for i, s in enumerate(a)) for a in assignments]
    lpw = [lp(p) for p in priors]
    lw = [p+l for p, l in zip(lpw, ll)]
    z = lsum(lw)
    prior_mass = math.fsum(priors)
    distributions, priord = {}, {}
    for band, inside in BANDS.items():
        counts = [sum(s in inside for s in a) for a in assignments]
        distributions[band] = [math.exp(lsum(w for w, c in zip(lw, counts) if c == k)-z)
                               if z != NEG else None for k in range(n+1)]
        priord[band] = [math.fsum(p for p, c in zip(priors, counts) if c == k) for k in range(n+1)]
    return ll, lw, z, distributions, priord, prior_mass


def decimal_456(logs, params):
    """Independent ordinary coefficient arithmetic, 65-digit Decimal."""
    n = len(logs)
    weights = params.get("weights", (.25, .25, .25, .25))
    low = params.get("low", (1/3, 1/3, 1/3))
    count_prior = pi(n, params.get("kind", "flat"))
    with localcontext() as context:
        context.prec = 65
        totals = [Decimal(0)]*(n+1)
        decimal_likelihoods = [[Decimal(str(x)).exp() if x != NEG else Decimal(0) for x in row] for row in logs]
        for component, weight in enumerate(weights):
            c = [Decimal(1)]
            for row in decimal_likelihoods:
                lo = sum(Decimal(str(low[s]))*row[s] for s in range(3))
                hi = sum(row[3:])/Decimal(3) if component == 0 else row[component+2]
                nxt = [Decimal(0)]*(len(c)+1)
                for k, coefficient in enumerate(c):
                    nxt[k] += coefficient*lo
                    nxt[k+1] += coefficient*hi
                c = nxt
            for k, coefficient in enumerate(c):
                totals[k] += Decimal(str(weight))*Decimal(str(count_prior[k]))*coefficient/Decimal(math.comb(n, k))
        z = sum(totals)
        return [float(v/z) for v in totals] if z else None


def event_result(assignments, ll, lw, priors, band, count, kind="atLeast", include_detection=True):
    inside = BANDS[band]
    counts = [sum(s in inside for s in a) for a in assignments]
    mask = [(c >= count if kind == "atLeast" else c == count) for c in counts]
    ah = math.fsum(p for p, keep in zip(priors, mask) if keep)
    ac = math.fsum(p for p, keep in zip(priors, mask) if not keep)
    zh = lsum(w for w, keep in zip(lw, mask) if keep)
    zc = lsum(w for w, keep in zip(lw, mask) if not keep)
    total = lsum((zh, zc))
    log_mh = zh-lp(ah) if ah else None
    log_mc = zc-lp(ac) if ac else None
    result = {"kind": kind, "count": count, "priorProbability": ah,
              "posteriorProbability": math.exp(zh-total) if total != NEG else None,
              "logBF": log_mh-log_mc if ah and ac and total != NEG else None,
              "logConditionalLikelihood": log_mh}
    if kind == "atLeast" and include_detection:
        null = max((l for l, c in zip(ll, counts) if c < count), default=NEG)
        log_q = lsum(lp(detection_prior(a, band, count))+l for a, l in zip(assignments, ll))
        result.update(logEValue=log_q-null if log_q != NEG or null != NEG else None,
                      logNullMaximum=null, logDetectionLikelihood=log_q,
                      detectionPriorMass=math.fsum(detection_prior(a, band, count) for a in assignments))
    return result, mask, zh


def enumerate_case(case):
    logs, shift = normalized_logs(case["logs"])
    n = len(logs)
    if not 1 <= n <= 6:
        raise ValueError("independent enumerator restricts n to 1..6")
    assignments = list(itertools.product(range(6), repeat=n))
    priors = [shared_prior(a) for a in assignments]
    ll, lw, z, distributions, priord, prior_mass = summarize(assignments, logs, priors)
    events = {}
    conditional = None
    for band in BANDS:
        events[band] = {}
        for event, count in (("all", n), ("half", (n+1)//2), ("third", (n+2)//3)):
            events[band][event] = event_result(assignments, ll, lw, priors, band, count)[0]
    detail = case.get("detail")
    if detail:
        event, mask, zh = event_result(assignments, ll, lw, priors, detail["band"], detail["count"], detail["kind"])
        conditional = {"event": event, "rows": []}
        for i in range(n):
            probs = [math.exp(lsum(w for a, w, keep in zip(assignments, lw, mask) if keep and a[i] == s)-zh)
                     if zh != NEG else None for s in range(6)]
            conditional["rows"].append(probs)
        conditional["neutralizedLogBF"] = []
        conditional["logBFInfluence"] = []
        for i in range(n):
            neutral_logs = [([0.]*6 if j == i else row) for j, row in enumerate(logs)]
            nll = [math.fsum(neutral_logs[j][s] for j, s in enumerate(a)) for a in assignments]
            nlw = [lp(p)+l for p, l in zip(priors, nll)]
            nb = event_result(assignments, nll, nlw, priors, detail["band"], detail["count"], detail["kind"])[0]["logBF"]
            conditional["neutralizedLogBF"].append(nb)
            influence = event["logBF"]-nb if event["logBF"] is not None and nb is not None else None
            conditional["logBFInfluence"].append(influence if influence is None or not math.isnan(influence) else None)
    scenarios = {}
    for key, weights in BASELINES.items():
        scenarios[key] = math.fsum(lsum(lp(w)+x for w, x in zip(weights, row)) for row in logs)
    sensitivities = {}
    decimal_max_error = 0.
    for key, params in MODELS.items():
        sp = [shared_prior(a, **params) for a in assignments]
        sll, slw, _, dist, prior_dist, mass = summarize(assignments, logs, sp)
        decimals = decimal_456(logs, params)
        if decimals is not None:
            decimal_max_error = max(decimal_max_error, max(abs(x-y) for x, y in zip(decimals, dist["456"])))
        sensitivity_events = {}
        for band in BANDS:
            sensitivity_events[band] = {}
            for event, count in (("all", n), ("half", (n+1)//2), ("third", (n+2)//3)):
                sensitivity_events[band][event] = event_result(
                    assignments, sll, slw, sp, band, count, include_detection=False)[0]
        sensitivity_detail = event_result(
            assignments, sll, slw, sp, detail["band"], detail["count"], detail["kind"], include_detection=False)[0] if detail else None
        sensitivities[key] = {"distribution": dist, "priorDistribution": prior_dist, "priorMass": mass,
                              "events": sensitivity_events, "detail": sensitivity_detail}
    fixed_count = []
    for k in range(n+1):
        # Independent explicit subset average of low/high setting mixtures.
        values = []
        for high_positions in itertools.combinations(range(n), k):
            positions = set(high_positions)
            values.append(math.fsum(lsum(row[s]-math.log(3) for s in (range(3, 6) if i in positions else range(3)))
                                    for i, row in enumerate(logs)))
        fixed_count.append(lsum(values)-math.log(math.comb(n, k)))
    return {"name": case["name"], "n": n, "assignments": len(assignments), "logScale": shift,
            "logMarginalNormalized": z, "priorMass": prior_mass, "distribution": distributions,
            "priorDistribution": priord, "events": events, "detail": conditional,
            "baselineLogLikelihoods": scenarios, "sensitivities": sensitivities,
            "fixedCountLogLikelihoods": fixed_count,
            "decimalCoefficientMaxError": decimal_max_error}


def main():
    payload = decode(json.load(sys.stdin))
    result = {"reference": "python-direct-6-setting-enumeration-v1", "cases": [enumerate_case(c) for c in payload["cases"]]}
    print(json.dumps(encode(result), separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
