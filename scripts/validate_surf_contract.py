#!/usr/bin/env python3
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "schemas" / "surf-data-contract-v1.schema.json"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: validate_surf_contract.py FILE [FILE ...]", file=sys.stderr)
        return 2

    schema = load_json(SCHEMA_PATH)
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())

    failed = False
    for raw in sys.argv[1:]:
        path = Path(raw)
        if not path.is_absolute():
            path = ROOT / path
        document = load_json(path)
        errors = sorted(validator.iter_errors(document), key=lambda e: list(e.absolute_path))
        if errors:
            failed = True
            print(f"INVALID {path.relative_to(ROOT)}")
            for err in errors:
                location = ".".join(str(part) for part in err.absolute_path) or "$"
                print(f"  {location}: {err.message}")
        else:
            print(f"VALID {path.relative_to(ROOT)}")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
