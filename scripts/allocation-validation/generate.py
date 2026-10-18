#!/usr/bin/env python3
"""Seeded exact multinomial observations; scores are streamed, never selected by outcomes."""
import hashlib
import itertools
import json
import sys
import time

import numpy as np

PROTOCOL = "allocation-fixed-exposure-simulation-v1"
DEV_BASE = "jugest-20261017-development-6fdaac33"
VALID_BASE = "jugest-20261017-validation-b8e7d042"
N_VALUES = [6, 12, 24, 58, 60, 120]
G_VALUES = [0, 500, 3000, 6000, 9000]
GRID_LAYOUTS = ["all1", "all3", "third4", "half4", "half-minus-one6", "all-but-one6", "all4", "all6", "mixed46"]
FAMILY_LAYOUTS = ["all3", "half-minus-one6", "third6", "half4", "all4", "all6", "mixed46", "prior-shared4"]
PHASES = [("development", DEV_BASE, 32, 2, 256), ("validation", VALID_BASE, 96, 8, 2048)]


def seed(base, scope):
    return int.from_bytes(hashlib.sha256((PROTOCOL+"|"+base+"|"+scope).encode()).digest()[:16], "big")


def emit(record):
    sys.stdout.write(json.dumps(record, separators=(",", ":"))+"\n")


def truth(layout, n, count, rng):
    result = np.full((count, n), 3, dtype=np.int16)
    for i in range(count):
        if layout == "all1":
            result[i].fill(1)
        elif layout == "all3":
            pass
        elif layout == "all4":
            result[i].fill(4)
        elif layout == "all6":
            result[i].fill(6)
        elif layout == "mixed46":
            result[i] = np.array([4]*(n//2)+[6]*(n-n//2))[rng.permutation(n)]
        elif layout == "prior-shared4":
            k = int(rng.integers(n+1))
            component = int(rng.integers(4))
            result[i] = rng.integers(1, 4, size=n)
            positions = rng.permutation(n)[:k]
            result[i, positions] = rng.integers(4, 7, size=k) if component == 0 else component+3
        else:
            if layout.startswith("third"):
                k = (n+2)//3
            elif layout == "half-minus-one6":
                k = (n+1)//2-1
            elif layout == "half4":
                k = (n+1)//2
            elif layout == "all-but-one6":
                k = n-1
            else:
                raise ValueError(layout)
            result[i, rng.permutation(n)[:k]] = 4 if layout.endswith("4") else 6
    return result


def observations(settings, games, probability_table, rng):
    pb = probability_table[settings-1, 0]
    pr = probability_table[settings-1, 1]
    bb = rng.binomial(games, pb)
    rb = rng.binomial(games-bb, pr/(1-pb))
    return bb, rb


def main():
    started = time.monotonic()
    tables = json.load(sys.stdin)["tables"]
    machines = list(tables)
    probabilities = {machine: np.array([[1/s["b"], 1/s["r"]] for s in table["settings"]]) for machine, table in tables.items()}
    generated = {"development": {"groups": 0, "rows": 0, "selectedGroups": 0}, "validation": {"groups": 0, "rows": 0, "selectedGroups": 0}}
    seeds = []
    fingerprint = hashlib.sha256()
    emit({"kind": "protocol", "protocol": PROTOCOL, "developmentSeedBase": DEV_BASE, "validationSeedBase": VALID_BASE,
          "nValues": N_VALUES, "gamesValues": G_VALUES, "gridLayouts": GRID_LAYOUTS, "familyLayouts": FAMILY_LAYOUTS,
          "phaseSampleSizes": [{"phase": p, "gridGeneratedPerCell": g, "gridScoredPerCell": s, "familyStoresPerLayout": f} for p, _, g, s, f in PHASES],
          "selection": "first predeclared rep indices; selected before observation generation", "generator": "NumPy PCG64DXSM; sequential conditional binomials exactly equal multinomial(G,pB,pR,1-pB-pR)",
          "familySize": 81, "alpha": .05})
    for phase, base, count, selected, _ in PHASES:
        for machine, n, games, layout in itertools.product(machines, N_VALUES, G_VALUES, GRID_LAYOUTS):
            key = f"{machine}/n{n}/G{games}/{layout}"
            truth_seed = seed(base, "grid/truth/"+key)
            observation_seed = seed(base, "grid/observations/"+key)
            settings = truth(layout, n, count, np.random.Generator(np.random.PCG64DXSM(truth_seed)))
            bb, rb = observations(settings, games, probabilities[machine], np.random.Generator(np.random.PCG64DXSM(observation_seed)))
            fingerprint.update(settings.tobytes()); fingerprint.update(bb.tobytes()); fingerprint.update(rb.tobytes())
            generated[phase]["groups"] += count
            generated[phase]["rows"] += count*n
            generated[phase]["selectedGroups"] += selected
            seeds.append({"phase": phase, "source": "grid", "cell": key, "truthSeed128": str(truth_seed), "observationSeed128": str(observation_seed), "generated": count, "selected": selected})
            for rep in range(selected):
                emit({"kind": "sample", "source": "grid", "phase": phase, "cell": key, "machine": machine, "n": n, "games": games, "layout": layout,
                      "rep": rep, "settings": settings[rep].tolist(), "bb": bb[rep].tolist(), "rb": rb[rep].tolist()})
    for phase, base, _, _, stores in PHASES:
        for layout in FAMILY_LAYOUTS:
            key = "family/n12/G6000/"+layout
            truth_seed = seed(base, "family/truth/"+key)
            observation_seed = seed(base, "family/observations/"+key)
            truth_rng = np.random.Generator(np.random.PCG64DXSM(truth_seed))
            observation_rng = np.random.Generator(np.random.PCG64DXSM(observation_seed))
            seeds.append({"phase": phase, "source": "family", "cell": key, "truthSeed128": str(truth_seed), "observationSeed128": str(observation_seed), "generatedStores": stores, "selectedStores": stores, "machinesPerStore": len(machines)})
            # One simulated store contains all nine supported machine groups;
            # its declaration family is fixed before any observations are seen.
            for store in range(stores):
                for machine in machines:
                    settings = truth(layout, 12, 1, truth_rng)
                    bb, rb = observations(settings, 6000, probabilities[machine], observation_rng)
                    fingerprint.update(settings.tobytes()); fingerprint.update(bb.tobytes()); fingerprint.update(rb.tobytes())
                    generated[phase]["groups"] += 1
                    generated[phase]["rows"] += 12
                    generated[phase]["selectedGroups"] += 1
                    emit({"kind": "sample", "source": "family", "phase": phase, "cell": f"{machine}/n12/G6000/{layout}", "store": store,
                          "familyCell": key, "machine": machine, "n": 12, "games": 6000, "layout": layout, "rep": store,
                          "settings": settings[0].tolist(), "bb": bb[0].tolist(), "rb": rb[0].tolist()})
    emit({"kind": "generation-complete", "generated": generated, "generationFingerprint": fingerprint.hexdigest(), "seedManifest": seeds,
          "seedDerivation": "unsigned big-endian first 128 bits of SHA256(protocol|phase-base|scope); truth/data scopes differ",
          "generationWallSeconds": time.monotonic()-started})


if __name__ == "__main__":
    main()
