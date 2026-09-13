#!/usr/bin/env python3
import copy
import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "schemas" / "surf-data-contract-v1.schema.json"
FIXTURES = ROOT / "tests" / "fixtures" / "surf-data-contract" / "v1"


def load(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def main() -> int:
    schema = load(SCHEMA)
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())

    for name in ("valid-kanto.json", "valid-kansai-minimal.json"):
        document = load(FIXTURES / name)
        errors = list(validator.iter_errors(document))
        if errors:
            for err in errors:
                print(f"UNEXPECTED INVALID {name}: {err.message}")
            return 1
        print(f"EXPECTED VALID {name}")

    negative = copy.deepcopy(load(FIXTURES / "valid-kanto.json"))
    del negative["spots"][0]["validation_status"]
    if not list(validator.iter_errors(negative)):
        print("ERROR: schema accepted spot without validation_status")
        return 1

    print("EXPECTED INVALID synthetic missing-validation-status case")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
