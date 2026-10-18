#!/usr/bin/env python3
"""Verify saved simulation evidence and summarize release limits without rescoring."""
import hashlib
import json
import math
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / "docs/development/store-day-allocation-20261017"


def wilson(success, total):
    if not total:
        return {"success": success, "total": total, "rate": None, "ci95": None}
    z = 1.959963984540054
    rate = success/total
    denominator = 1+z*z/total
    center = (rate+z*z/(2*total))/denominator
    radius = z*math.sqrt(rate*(1-rate)/total+z*z/(4*total*total))/denominator
    return {"success": success, "total": total, "rate": rate, "ci95": [max(0, center-radius), min(1, center+radius)]}


def rate(metric):
    if metric["total"] == 0:
        return "not a true claim"
    return f"{100*metric['rate']:.2f}% [{100*metric['ci95'][0]:.2f}%, {100*metric['ci95'][1]:.2f}%] ({metric['success']:,}/{metric['total']:,})"


def selected(report, layout):
    return [v for k, v in report["strata"].items()
            if k.startswith("validation|family|machine:") and k.endswith("layout:"+layout)]


def pooled_event(items, band, event, field):
    metrics = [item["bands"][band]["events"][event][field] for item in items]
    return wilson(sum(x["success"] for x in metrics), sum(x["total"] for x in metrics))


def main():
    numeric = json.loads((DIRECTORY/"numeric-validation.json").read_text())
    report_path = DIRECTORY/"simulation-validation.json"
    report = json.loads(report_path.read_text())
    seeds = json.loads((DIRECTORY/"simulation-seeds.json").read_text())
    assert numeric["status"] == "passed" and not numeric["failures"]
    for evidence in (numeric, report):
        for source, expected in evidence["sourceHashes"].items():
            actual = hashlib.sha256((ROOT/source).read_bytes()).hexdigest()
            assert actual == expected, f"Source mismatch: {source}"
    stream_ids = [entry[key] for entry in seeds["seeds"] for key in ("truthSeed128", "observationSeed128")]
    assert len(stream_ids) == len(set(stream_ids)) == seeds["uniqueRngStreams"]
    scored = sum(x.get("selected", x.get("selectedStores", 0)*x.get("machinesPerStore", 0)) for x in seeds["seeds"])
    generated = sum(x.get("generated", x.get("generatedStores", 0)*x.get("machinesPerStore", 0)) for x in seeds["seeds"])
    assert scored == report["scoredGroups"] == sum(x["groups"] for x in report["totalSummary"].values())
    assert generated == report["generatedGroups"]
    assert report["generationFingerprint"] == seeds["generationFingerprint"]
    assert report["strongEnabled"] is False and report["calibrationEnabled"] is False
    assert all(x["strongEnabledViolations"] == 0 for x in report["totalSummary"].values())

    calibration_items = selected(report, "prior-shared4")
    calibration = []
    for band in range(3):
        for event in range(3):
            observations = sum(item["groups"] for item in calibration_items)
            bins = []
            for i in range(10):
                source_bins = [item["bands"][band]["events"][event]["reliability"][i] for item in calibration_items]
                n = sum(x["n"] for x in source_bins)
                p = sum(x["n"]*(x["meanPosterior"] or 0) for x in source_bins)
                y = sum(round(x["n"]*(x["observedFraction"] or 0)) for x in source_bins)
                bins.append({"n": n, "meanPosterior": p/n if n else None, "observed": wilson(y, n)})
            ece = sum(x["n"]*abs(x["meanPosterior"]-x["observed"]["rate"]) for x in bins if x["n"])/observations
            brier = sum(item["groups"]*item["bands"][band]["events"][event]["posteriorBrier"] for item in calibration_items)/observations
            calibration.append({"band": ["456", "56", "6"][band], "event": ["all", "half", "third"][event],
                                "groups": observations, "Brier": brier, "ECE10Bins": ece, "bins": bins})
    summary = {"integrityVerified": True, "generatedGroups": generated, "scoredGroups": scored,
               "generatedRows": sum(x["rows"] for x in report["generated"].values()), "uniqueRngStreams": len(stream_ids),
               "familyFalsePositiveInterpretation": "The all6 family has no false principal claims possible: its zero is structural, not a null-calibration success. Other family layouts contain false claims.",
               "all6LayoutPower": [], "calibrationSharedPrior": calibration,
               "postprocessorHash": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    all6 = selected(report, "all6")
    for band in range(3):
        for event in range(3):
            summary["all6LayoutPower"].append({"band": ["456", "56", "6"][band], "event": ["all", "half", "third"][event],
                                              "power": pooled_event(all6, band, event, "power"), "misses": pooled_event(all6, band, event, "misses")})
    report["independentEvidenceSummary"] = summary
    # Retain every scored aggregate and reliability bin, but remove indentation
    # to keep review evidence substantially smaller in the repository.
    report_path.write_text(json.dumps(report, separators=(",", ":"), ensure_ascii=False)+"\n")

    markdown_path = DIRECTORY/"simulation-validation.md"
    text = markdown_path.read_text().split("\n## Additional release-gate measurements")[0]
    text = re.sub(r"(?m)^(\| all6 \| )[^|]+(\|.*)$", lambda match: match.group(1)+"not applicable; all claims true "+match.group(2), text, count=1)
    for before, after in [("all9", "all 9"), ("and9", "and 9"), ("and2,048", "and 2,048"), ("for8", "for 8"),
                          ("cell,32", "cell, 32"), ("first2", "first 2"), ("+8", "+ 8"), ("has9", "has 9"),
                          ("through27", "through 27"), ("are95%", "are 95%"), ("the456", "the 456"),
                          ("Central90%", "Central 90%"), ("all81", "all 81")]:
        text = text.replace(before, after)
    lines = ["", "## Additional release-gate measurements", "",
             "The source hashes, unique seed streams, manifest-selected sample totals, scored totals and generation fingerprint were independently rechecked by `scripts/allocation-validation/summarize.py`. All checks matched. The JSON retains every original aggregate and now includes this derived summary.", "",
             "The all-six family contains no false principal claims, so its zero false-positive count is structural. The all-setting3 and boundary family conditions supply meaningful false-claim checks; each observed zero false-positive stores in 2,048 independent validation stores, with 95% Wilson upper bound 0.1872% for that simulated condition.", "",
             "A simulated all-six store passing any weaker event does not mean all-six was detected. At n=12/G=6,000, the event-specific all-six-layout results are:", "",
             "| Band | Event | Model-pass power | Misses |", "|---|---|---|---|"]
    for item in summary["all6LayoutPower"]:
        lines.append(f"| {item['band']} | {item['event']} | {rate(item['power'])} | {rate(item['misses'])} |")
    lines.extend(["", "For true half-setting4 and all-setting4 layouts, all true 456 declarations had zero passes in 18,432 groups per layout. The miss rate is 100% [99.98%, 100%]. These results fail a practical power gate for strong-candidate release.", "",
                  "All 190,188 results kept `strongEnabled=false` exactly; this is a release switch, not a sampled success probability. Among validation groups, no principal model-pass occurred in:", "",
                  "| Cohort | No principal model-pass |", "|---|---|"])
    for key in ("validation|grid", "validation|family"):
        lines.append(f"| {key} | {rate(report['totalSummary'][key]['noPrincipalModelPass'])} |")
    lines.extend(["", "These are uncertainty/hold diagnostics within complete generated inputs. The simulation does not exercise source-provenance or unsupported-input holds.", "",
                  "Posterior calibration diagnostics from the separately sampled declared shared prior (18,432 validation groups) are:", "",
                  "| Band | Event | Brier score | 10-bin weighted absolute calibration gap |", "|---|---|---|---|"])
    for item in calibration:
        lines.append(f"| {item['band']} | {item['event']} | {item['Brier']:.5f} | {100*item['ECE10Bins']:.2f} percentage points |")
    lines.extend(["", "These diagnostics concern only the declared prior and fixed-exposure bonus model. They do not make posterior event frequencies valid under arbitrary fixed layouts: the true-one-third scenario's 78.44% posterior half overstatement is a direct example of the assumption dependence. Numerical correctness, model-internal error control and real-store accuracy remain separate conclusions.", "",
                  "Recheck integrity and regenerate this supplement without rescoring:", "", "```bash", "python3 scripts/allocation-validation/summarize.py", "```", ""])
    markdown_path.write_text(text.rstrip()+"\n"+"\n".join(lines))
    print(json.dumps({"integrityVerified": True, "generatedGroups": generated, "scoredGroups": scored,
                      "uniqueRngStreams": len(stream_ids), "numericComparisons": numeric["checks"],
                      "simulationJsonBytes": report_path.stat().st_size}, separators=(",", ":")))


if __name__ == "__main__":
    main()
