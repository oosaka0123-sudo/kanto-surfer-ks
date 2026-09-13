# SURF DATA CONTRACT v1

## Purpose

This contract defines the shared published-data boundary between regional surf systems such as Kansai Surfer and Kanto Surfer.
It defines data shape and semantics, not regional forecasting, scoring, validation gates, or deployment internals.

Core rule:

- Kansai and Kanto remain independent applications for v1.
- Regional wave-size corrections, wind interpretation, score logic, and publication gates stay regional.
- Optional values are omitted when they cannot be produced safely.
- No producer may invent a value only to satisfy the contract.

```text
Kansai Engine -> Kansai Adapter --+
                                  +-> SURF DATA CONTRACT v1
Kanto Engine  -> Kanto Adapter  --+
```

A shared runtime/core may be extracted later only after the governance eligibility conditions are met.

## Version

Every payload must contain `"schema_version": "surf-data-contract/1.0"`.
Breaking changes require a new major version. Backward-compatible additions require compatibility review.

## Top-level fields

Required:

- `schema_version`
- `region`: currently `kansai` or `kanto`
- `generated_at`: RFC 3339 / ISO 8601 date-time with explicit timezone
- `product`: `current`, `today`, `tomorrow`, or `forecast`
- `status`: `validated`, `provisional`, `partial`, or `unavailable`
- `spots`

Optional:

- `forecast_for`: main forecast time
- `source_updated_at`: newest source-data timestamp
- `valid_until`: after this time consumers should treat the payload as stale unless refreshed
- `degradation_reasons`: generic machine-readable reason codes; required when status is `partial` or `unavailable`
- `notes`: operational note, never a substitute for missing data

Allowed generic degradation reasons:

- `SOURCE_UNAVAILABLE`
- `SOURCE_STALE`
- `VALIDATION_INCOMPLETE`
- `PARTIAL_SPOT_COVERAGE`
- `ADAPTER_ERROR`
- `UNKNOWN`

Regional gate names must not leak into this shared list.

## Spot identity and status

Every spot contains `id`, `name`, `area`, and `validation_status`.
`id` is a stable ASCII API identifier and must not silently change with display-name changes.

Spot `validation_status` is one of:

- `validated`
- `provisional`
- `pending`
- `unavailable`

An `unavailable` spot must include generic `degradation_reasons`.
Optional `confidence` is `high`, `medium`, `low`, or `unknown` and never overrides validation status.

## Wave

`wave` is the public breaking-wave representation.

Allowed fields:

- `size_label`: public display text such as `ヒザ〜モモ`
- `min_cm` / `max_cm`: numeric breaking-wave range only when the regional engine can support it reliably

Model or ocean-state height must not be placed in `wave`.
Do not derive fake centimetre ranges from Japanese body-size labels unless the regional mapping has been approved.

## Wind

`wind` may contain:

- `direction_deg_from`: meteorological degrees clockwise from true north, describing where wind comes from
- `direction_label`
- `speed_ms`: 10 m wind speed in m/s
- `gust_ms`
- `quality`: `offshore`, `cross_offshore`, `side`, `cross_onshore`, `onshore`, `variable`, or `unknown`

Wind quality remains spot-specific regional logic.

## Swell

`swell` describes model/ocean-state swell, not breaking-wave face size.

Allowed fields:

- `significant_height_m`: significant swell height in metres
- `period_s`: swell period in seconds
- `direction_deg_from`: degrees clockwise from true north, describing where swell comes from

## Score and rank

`score` and `rank` are optional.
A region must not emit them until its own publication policy allows public use.
The contract does not require Kansai and Kanto to use the same scoring formula.

## Validation policy

Kanto may keep internal gates such as `api_integrity`, `observation_alignment`, and `spot_context`.
Those gate names are implementation details and are not required of Kansai.

For Kansai, a future adapter must expose only values already considered safe by the existing Kansai operation.
Adding the adapter must not require rewriting the production forecast engine first.

## Source metadata

Optional `source` may contain `provider`, `model_time`, and `observed_at`.
Third-party paid reports, images, camera frames, or proprietary scores must not be redistributed unless separately licensed.

## Example

```json
{
  "schema_version": "surf-data-contract/1.0",
  "region": "kanto",
  "generated_at": "2026-09-13T13:00:00+09:00",
  "product": "today",
  "status": "provisional",
  "spots": [
    {
      "id": "kugenuma",
      "name": "鵠沼",
      "area": "湘南",
      "wave": {"size_label": "ヒザ〜モモ"},
      "wind": {
        "direction_deg_from": 45,
        "direction_label": "北東",
        "speed_ms": 4.2,
        "quality": "offshore"
      },
      "swell": {
        "significant_height_m": 0.8,
        "period_s": 7.5,
        "direction_deg_from": 145
      },
      "validation_status": "provisional",
      "confidence": "medium"
    }
  ]
}
```

The example is schema-only and is not a live forecast.

## Adapter rules

A regional adapter must:

1. translate existing safe output without changing regional forecast/scoring logic;
2. omit unsafe optional values rather than inventing them;
3. preserve stable spot IDs through an explicit mapping;
4. fail validation rather than fabricate required values;
5. keep credentials and private data out of exported JSON.

## Rollout

1. Keep Kansai production unchanged.
2. Use the contract first in Kanto preview/export tooling.
3. Validate generated Kanto output against the JSON Schema in CI.
4. Add a read-only Kansai adapter later.
5. Compare consumer behavior across both regions.
6. Extract shared runtime code only after the governance eligibility conditions are met.

## Non-goals

- one universal wave-size correction formula
- one universal score formula
- moving Kansai production directories
- changing Kansai cron behavior to satisfy v1
- sharing runtime credentials
- merging repositories now
- automatically deploying either production site
