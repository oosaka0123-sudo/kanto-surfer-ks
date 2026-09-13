# SURF DATA CONTRACT — Governance

This document governs changes to `SURF DATA CONTRACT v1`.

## Neutrality

The shared contract defines published data shape, not regional forecast internals.
Kanto-specific gates such as `api_integrity`, `observation_alignment`, and `spot_context` remain Kanto implementation details. Kansai may use a different internal publication policy while still conforming to the shared contract.

## Contract-level status semantics

Schema conformance and surf-data publication approval are separate checks.

- `validated`: emitted public values are eligible for normal publication under the region's approved policy.
- `provisional`: usable for preview/testing but not fully publication-approved.
- `partial`: some expected output is safely available while some is unavailable or degraded.
- `unavailable`: no safe usable regional result can currently be produced.

For a spot:

- `validated`: emitted values are eligible for normal public use.
- `provisional`: preview/testing use only.
- `pending`: validation is incomplete; consumers must not treat the spot as confirmed.
- `unavailable`: reliable surf-condition output cannot currently be produced.

`confidence` is descriptive only and never overrides `validation_status`.

## Physical semantics

Field names must describe the physical quantity, not merely the source API label.

- Public breaking-wave size belongs in the `wave` block as a display label and/or a regionally validated breaking-wave range.
- Model significant wave or swell height must never be presented as breaking-wave face height.
- Swell height uses `significant_height_m`.
- Swell direction uses `direction_deg_from`: degrees clockwise from true north, describing the direction the swell comes from.
- Wind direction uses `direction_deg_from`: meteorological degrees clockwise from true north, describing the direction the wind comes from.
- Speeds use metres per second and marine heights use metres.
- Contract timestamps use RFC 3339 / ISO 8601 date-time strings with an explicit timezone offset. UTC is allowed but not mandatory.

If a source has different semantics, the adapter must translate only when the meaning is equivalent; otherwise the field is omitted.

## Degraded output

Adapters must degrade explicitly rather than fabricate values.

1. Missing optional data is omitted, not guessed and not replaced with fake zeroes.
2. If spot identity is known but reliable surf data is unavailable, keep only safe identity fields and use `validation_status=unavailable`.
3. Unsafe `wave`, `score`, and `rank` values must be omitted.
4. If some expected spots are unavailable while others remain usable, top-level `status` must not be `validated`; use `partial` where appropriate.
5. If no safe regional result exists, use top-level `status=unavailable`.
6. `null` is not a substitute for an omitted optional field unless a later schema explicitly permits it.
7. `degradation_reasons` is machine-readable and must use only the generic contract reason codes defined in the schema; regional gate names do not belong in the shared feed.

## Versioning and deprecation

- Breaking changes require a new major version.
- Backward-compatible optional additions require minor-version review.
- A new major version must not silently replace the previous major version.
- The previous major version remains supported until both regional systems have a documented migration path and a minimum **90-day** deprecation window has elapsed, unless the project owner explicitly approves an emergency exception.
- During a major-version migration, the old and new major versions must coexist long enough for every active regional producer and shared consumer to migrate safely.
- Producers must never claim a schema version they have not validated against.

## Change gate

Before a contract change is merged:

1. validate the JSON Schema;
2. run conformance fixtures in CI;
3. confirm a Kanto fixture still validates;
4. confirm a Kansai-compatible fixture still validates;
5. confirm a synthetic invalid document still fails;
6. check that no region-specific scoring or validation concept leaked into the shared layer;
7. classify the change as patch/minor/major compatibility impact;
8. confirm measurement semantics and units remain unambiguous.

The Kansai fixture is only a compatibility proxy until a real read-only Kansai adapter exists. It must never be described as live Kansai runtime output.

## Producer enforcement

A producer claiming `surf-data-contract/1.0` must pass the shared validator before its output is promoted to a published feed.

When the Kanto exporter is implemented, its publish flow must invoke the same validator on generated output. A future Kansai adapter must do the same before exposing any shared feed.

## Contract source-of-truth location

During Kanto bootstrap, the contract remains in this repository to avoid premature repository and release-management overhead.

Before a second production regional adapter goes live, review moving the contract/schema/fixtures to a neutral shared repository or versioned artifact registry. The migration must preserve version history and must not force a Kansai production refactor.

## Shared-core eligibility

Do not extract a common runtime merely because two repositories contain superficially similar code.

Shared runtime extraction becomes eligible only when all of the following are true:

1. both regional adapters conform to the same contract major version;
2. both have passed their conformance CI continuously in real operation;
3. there have been no breaking contract changes for at least 90 consecutive days;
4. at least one real shared consumer can read both regions without region-specific code forks beyond configuration;
5. the candidate duplicated module has equivalent responsibilities and failure semantics in both regions;
6. extraction can be staged without changing Kansai production paths, cron behavior, or deployment safety in the same step.

Geographic spot-to-spot parity is not required because Kansai and Kanto do not share the same surf spots.
