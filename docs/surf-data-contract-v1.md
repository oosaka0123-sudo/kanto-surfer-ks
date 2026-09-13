# SURF DATA CONTRACT v1

## Purpose

This contract defines the shared **output shape** used to exchange surf-condition data between regional systems such as Kansai Surfer and Kanto Surfer.

It deliberately does **not** define how each region calculates wave size, score, wind quality, or spot-specific corrections.

The rule is:

- common input/output vocabulary where practical;
- region-specific forecast and scoring logic;
- no forced migration of the existing Kansai production code;
- no invented values merely to satisfy the contract.

## Architecture decision

For v1, Kansai and Kanto remain independent applications/repositories.

```text
Kansai Engine  ── Kansai Adapter ──┐
                                   ├── SURF DATA CONTRACT v1
Kanto Engine   ── Kanto Adapter  ──┘
```

A future shared `surf-core` may be extracted only after behavior has been proven stable in multiple regions. v1 is therefore a **data contract, not a shared runtime**.

## Versioning

Every document must contain:

```json
"schema_version": "surf-data-contract/1.0"
```

Breaking changes require a new major version. Additive optional fields may be introduced within v1 only when existing consumers continue to validate.

## Top-level fields

Required:

- `schema_version` — exact contract version.
- `region` — stable regional identifier, currently `kansai` or `kanto`.
- `generated_at` — ISO 8601 timestamp with timezone.
- `product` — output type: `current`, `today`, `tomorrow`, or `forecast`.
- `status` — `validated`, `provisional`, `partial`, or `unavailable`.
- `spots` — array of spot records.

Optional:

- `forecast_for` — ISO 8601 timestamp representing the main forecast time.
- `source_updated_at` — most recent source-data timestamp.
- `notes` — machine-safe operational note; not a substitute for missing data.

## Spot identity

Each spot must contain:

- `id` — stable ASCII identifier used by APIs/apps.
- `name` — public Japanese display name.
- `area` — regional grouping such as `湘南`, `千葉北`, `和歌山`.

`id` must remain stable after publication. Display-name changes must not silently change the identifier.

## Wave block

`wave` is optional until a region has a validated value. When present it may contain:

- `size_label` — public display text such as `ヒザ〜モモ`.
- `min_cm` / `max_cm` — normalized centimetre range where the regional engine can support it reliably.
- `height_m` — model/derived numeric value when useful; it must not be presented as observed breaking-wave size unless it actually is.

Do not infer a fake centimetre range solely from a Japanese size label if that mapping has not been approved for the region.

## Wind block

`wind` may contain:

- `direction_deg` — meteorological direction in degrees.
- `direction_label` — display label such as `北東`.
- `speed_ms` — 10 m wind speed in m/s.
- `gust_ms` — gust in m/s when available.
- `quality` — optional regional interpretation: `offshore`, `cross_offshore`, `side`, `cross_onshore`, `onshore`, `variable`, or `unknown`.

The same raw wind may have different `quality` at different spots because beach orientation and local geography remain regional/spot logic.

## Swell block

`swell` may contain:

- `height_m`
- `period_s`
- `direction_deg`

These are model/ocean-state values and must not be confused with public breaking-wave size.

## Score and rank

`score` and `rank` are optional.

A regional system must not emit either value until its own validation policy allows public use.

- `score`: integer 0–100.
- `rank`: integer 1 or greater.

The contract does not require identical scoring formulas between Kansai and Kanto.

## Validation / confidence

Each spot must contain `validation_status`:

- `validated` — region's publication gate passed.
- `provisional` — usable internally/preview but not fully validated.
- `pending` — validation incomplete.
- `unavailable` — reliable output cannot currently be produced.

Optional `confidence`:

- `high`
- `medium`
- `low`
- `unknown`

For Kanto v1, `validation_status=validated` must not bypass the existing three-part gate (`api_integrity`, `observation_alignment`, `spot_context`).

For Kansai, adopting this field later must not require rewriting its production forecast engine first; the adapter may initially expose only values already considered safe for publication.

## Source metadata

Optional `source` describes provenance without copying third-party content:

```json
{
  "provider": "open-meteo",
  "model_time": "2026-09-13T13:00:00+09:00",
  "observed_at": "2026-09-13T12:55:00+09:00"
}
```

Third-party paid surf reports, images, live-camera frames, or proprietary scores must not be embedded or redistributed through this contract unless separately licensed.

## Example

```json
{
  "schema_version": "surf-data-contract/1.0",
  "region": "kanto",
  "generated_at": "2026-09-13T13:00:00+09:00",
  "product": "today",
  "status": "provisional",
  "forecast_for": "2026-09-13T13:00:00+09:00",
  "spots": [
    {
      "id": "kugenuma",
      "name": "鵠沼",
      "area": "湘南",
      "wave": {
        "size_label": "ヒザ〜モモ"
      },
      "wind": {
        "direction_deg": 45,
        "direction_label": "北東",
        "speed_ms": 4.2,
        "quality": "offshore"
      },
      "swell": {
        "height_m": 0.8,
        "period_s": 7.5,
        "direction_deg": 145
      },
      "score": 25,
      "rank": 1,
      "validation_status": "provisional",
      "confidence": "medium"
    }
  ]
}
```

The values above are schema examples only. They are not a live forecast and must not be copied into runtime output.

## Adapter rule

Each regional adapter is responsible for translating its existing internal representation into this contract.

The adapter must:

1. never modify source forecast/scoring logic merely to satisfy field names;
2. omit optional values that are not safely available;
3. preserve regional spot identifiers through an explicit mapping table;
4. fail validation rather than fabricate required values;
5. keep runtime secrets and private data out of exported JSON.

## Rollout sequence

1. Keep Kansai production unchanged.
2. Use this contract first in Kanto preview/export tooling.
3. Validate real Kanto output against the JSON Schema.
4. Add a read-only Kansai adapter later without changing Kansai scoring logic.
5. Compare both regional outputs and consumer requirements.
6. Extract truly duplicated, proven code into a shared core only after the two-region trial.

## Non-goals for v1

- one universal wave-size correction formula;
- one universal score formula;
- moving Kansai production directories;
- sharing cron/runtime credentials;
- merging repositories;
- automatically deploying either production site.
