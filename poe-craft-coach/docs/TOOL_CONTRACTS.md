# Tool Contracts

All MCP tool responses follow this envelope:

```json
{
  "ok": true,
  "data": { "...tool specific" },
  "meta": {
    "league": "Settlers",
    "timingMs": 123,
    "sources": ["source identifiers"],
    "warnings": []
  }
}
```

## pob_tool
- **Input JSON Schema**: `packages/schemas/dist/index.json` (`PobToolInput`)
- **Output shape**:
  - `summary`: class, ascendancy, level, life/ES/ward/mana snapshot.
  - `metrics`: `dps`, `ehp`, `sustain` (numbers when available).
  - `pobXml`: raw decoded XML blob.
  - `warnings[]`: decoding issues.

## build_compare_tool
- **Input**: `pobA`, `pobB`, optional `budget` `{currency, amount}`.
- **Output**: `deltas` for DPS/EHP/layers, `prioritizedUpgrades[]`, `costedPlan[]`, `craftVsBuy` notes.

## craft_sim_tool
- **Input**: `base`, `ilvl`, `targetMods[]`, optional `method`, optional `budget`.
- **Output**: `expectedAttempts`, `expectedCost`, `stepPlan[]`, `failureBranches[]`, `alternates[]`.

## mod_lookup_tool
- **Input**: `base`, optional `tags[]`, optional `query` string.
- **Output**: `prefixes[]`, `suffixes[]`, `groups[]`, `conflicts[]`, `spawnWeights[]`, `special[]`.

## price_tool
- **Input**: `itemOrCurrency`, `league`, optional `source` (`ninja`, `watch`, `both`).
- **Output**: `latest` snapshot (`chaos`, `divine`, `source`, `asOf`, `payload`), plus optional `history7d`, `history30d` arrays.

## trade_search_tool
- **Input**: `league`, `filters` (mirrors Trade API JSON), optional `priceCeiling`.
- **Output**: `queryJson`, `results[] {name, price, link}`, `sources[]`.

## item_read_tool
- **Input**: Provide `clipboardText` (preferred) or `imagePath` (local file path).
- **Output**: `base`, `ilvl`, `mods[] {text, tier?, group?}`, `influenceFlags[]`, `fractured`, `veiled`.

## wiki_tool
- **Input**: `{ topic }`.
- **Output**: `explainer` text + `links[]` (canonical wiki URLs).

## search (generic)
- **Input**: `{ query }`.
- **Output**: `topWikiResult`, `ninja` payload (when available), `originalQuery` echo.

## fetch (generic)
- **Input**: `{ url, method?, json? }`.
- **Output**: Raw `body`, `status`, and `headers` from the HTTP request.

Refer to `packages/schemas/` for the authoritative Zod definitions and generated JSON schemas.
