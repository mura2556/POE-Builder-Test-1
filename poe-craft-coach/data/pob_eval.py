#!/usr/bin/env python3
"""Evaluate Path of Building codes using pobapi."""
from __future__ import annotations

import json
import sys
import time
import types
from typing import Any, Dict, List, Tuple

import requests
import six

# Patch missing unstdlib.six compatibility expected by pobapi.
module = types.ModuleType("unstdlib.six")
for name in dir(six):
    if name.startswith("_"):
        continue
    setattr(module, name, getattr(six, name))
sys.modules["unstdlib.six"] = module
sys.modules["unstdlib.six.moves"] = six.moves

from lxml import etree  # type: ignore  # noqa: E402
from pobapi import api  # type: ignore  # noqa: E402

POBB_BASE = "https://pobb.in"
POBB_XML_SUFFIX = ".xml"
POBB_TXT_SUFFIX = ".txt"
HEADERS = {
    "User-Agent": "poe-craft-coach/0.1 (+https://github.com)"
}


class PobEvaluationError(RuntimeError):
    """Raised when an evaluation cannot be completed."""


def _read_input() -> Dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise PobEvaluationError("Missing input payload")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise PobEvaluationError(f"Invalid JSON payload: {exc}") from exc
    if "pob" not in payload or not isinstance(payload["pob"], str):
        raise PobEvaluationError("`pob` field must be provided as a string")
    return payload


def _resolve_pobb(id_: str) -> Tuple[bytes, str]:
    session = requests.Session()
    session.headers.update(HEADERS)
    sources: List[str] = []
    for suffix in (POBB_XML_SUFFIX, POBB_TXT_SUFFIX):
        url = f"{POBB_BASE}/{id_}{suffix}"
        resp = session.get(url, timeout=40)
        if resp.status_code == 200 and resp.content:
            sources.append(url)
            if suffix == POBB_TXT_SUFFIX:
                return api._fetch_xml_from_import_code(resp.text.strip()), sources[-1]
            return resp.content, sources[-1]
    raise PobEvaluationError(f"Unable to resolve pobb.in build {id_}")


def _load_build(pob: str) -> Tuple[api.PathOfBuildingAPI, str, List[str]]:
    cleaned = pob.strip()
    sources: List[str] = []
    if cleaned.startswith('<'):
        build = api.PathOfBuildingAPI(cleaned.encode('utf-8'))
        sources.append('xml')
        return build, 'xml', sources
    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        sources.append(cleaned)
        if "pobb.in" in cleaned:
            identifier = cleaned.rstrip("/").split("/")[-1]
            xml_bytes, source = _resolve_pobb(identifier)
            sources[-1] = source
            build = api.PathOfBuildingAPI(xml_bytes)
            return build, source, sources
        build = api.from_url(cleaned)
        return build, cleaned, sources
    cleaned = "".join(cleaned.split())
    build = api.from_import_code(cleaned)
    sources.append("import_code")
    return build, "import_code", sources


def _extract_player_stats(build: api.PathOfBuildingAPI) -> Dict[str, float]:
    stats: Dict[str, float] = {}
    for stat in build.xml.find("Build").findall("PlayerStat"):
        key = stat.get("stat")
        value = stat.get("value")
        if key and value is not None:
            try:
                stats[key] = float(value)
            except ValueError:
                continue
    return stats


def _coalesce(values: List[Any]) -> Any:
    for value in values:
        if value is None:
            continue
        if isinstance(value, (int, float)) and value == 0:
            continue
        return value
    return None


def evaluate(pob: str) -> Dict[str, Any]:
    start = time.perf_counter()
    build, source, sources = _load_build(pob)
    player_stats = _extract_player_stats(build)
    warnings: List[str] = []
    try:
        stats_obj = build.stats
    except Exception as exc:  # pragma: no cover - defensive
        warnings.append(f"Failed to map stats via pobapi: {exc}")
        stats_obj = type('StatsFallback', (), {})()

    life = player_stats.get("Life") or getattr(stats_obj, "life", None)
    energy_shield = player_stats.get("EnergyShield") or getattr(stats_obj, "energy_shield", None)
    ward = player_stats.get("Ward") or player_stats.get("WardTotal")

    dps_candidates = [
        player_stats.get("CombinedDPS"),
        player_stats.get("TotalDPS"),
        player_stats.get("TotalDPSwithPoison"),
        player_stats.get("AverageDamage"),
        getattr(stats_obj, "total_dps", None),
        getattr(stats_obj, "total_dps_with_poison", None),
        getattr(stats_obj, "total_dps_with_ignite", None),
        getattr(stats_obj, "average_damage", None),
    ]
    ehp = player_stats.get("TotalEHP")
    if ehp is None:
        ehp = sum(filter(None, [life, energy_shield, ward])) if any(
            value for value in [life, energy_shield, ward]
        ) else None

    sustain = _coalesce([
        player_stats.get("NetLifeRegen"),
        player_stats.get("NetEnergyShieldRegen"),
        getattr(stats_obj, "net_life_regen", None),
        getattr(stats_obj, "life_regen", None),
    ])

    metrics = {
        "dps": _coalesce(dps_candidates),
        "ehp": ehp,
        "sustain": sustain,
    }

    summary = {
        "className": build.class_name,
        "ascendancy": build.ascendancy_name,
        "level": build.level,
        "life": life,
        "energyShield": energy_shield,
        "ward": ward,
        "mana": player_stats.get("Mana") or getattr(stats_obj, "mana", None),
    }

    xml_text = etree.tostring(build.xml, encoding="unicode")

    result = {
        "summary": summary,
        "metrics": metrics,
        "pobXml": xml_text,
        "playerStats": player_stats,
        "warnings": warnings,
        "sources": sources,
        "timingMs": int((time.perf_counter() - start) * 1000),
        "primarySource": source,
    }
    return result


def main() -> None:
    try:
        payload = _read_input()
        result = evaluate(payload["pob"])
        print(json.dumps({"ok": True, "result": result}))
    except Exception as exc:  # pragma: no cover - script entrypoint
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    main()
