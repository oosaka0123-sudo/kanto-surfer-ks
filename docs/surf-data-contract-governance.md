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

## Degraded output

Adapters must degrade explicitly rather than fabricate values.

1. Missing optional data is omitted, not guessed and not replaced with fake zeroes.
2. If spot identity is known but reliable surf data is unavailable, keep only safe identity fields and use `validation_status=unavailable`.
3. Unsafe `wave`, `score`, and `rank` values must be omitted.
4. If some expected spots are unavailable while others remain usable, top-level `status` must not be `validated`; use `partial` where appropriate.
5. If no safe regional result exists, use top-level `status=unavailable`.
6. `null` is not a substitute for an omitted optional field unless a later schema explicitly permits it.

## Versioning and deprecation

- Breaking changes require a new major version.
- Backward-compatible optional additions require minor-version review.
- A new major version must not silently replace the previous major version.
- The previous major version remains supported until both regional systems have a documented migration path and a minimum 30-day deprecation window has elapsed, unless the project owner explicitly approves an emergency exception.
- Producers must never claim a schema version they have not validated against.

## Change gate

Before a contract change is merged:

1. validate the JSON Schema;
2. run conformance fixtures in CI;
3. confirm a Kanto fixture still validates;
4. confirm a Kansai-compatible fixture still validates;
5. confirm intentionally invalid fixtures still fail;
6. check that no region-specific scoring or validation concept leaked into the shared layer;
7. classify the change as patch/minor/major compatibility impact.

The Kansai fixture is only a compatibility proxy until a real read-only Kansai adapter exists. It must never be described as live Kansai runtime output.

## Producer enforcement

A producer claiming `surf-data-contract/1.0` must pass the shared validator before its output is promoted to a published feed.

When the Kanto exporter is implemented, its publish flow must invoke the same validator on generated output. A future Kansai adapter must do the same before exposing any shared feed.

## Shared-core rule

Do not extract a common runtime merely because two repositories contain superficially similar code. Shared runtime code becomes a candidate only after both regional implementations have stable real-world behavior and the duplicated abstraction has been demonstrated rather than assumed.
