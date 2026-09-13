"""Export the live OpenAPI schema to a committed JSON file.

design-doc.md §11.1: "Generate and commit an OpenAPI schema." Run with:

    uv run python scripts/export_openapi.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_REPO_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_DIR))

from app.main import app  # noqa: E402

OUTPUT_PATH = _REPO_DIR / "openapi.json"


def main() -> None:
    schema = app.openapi()
    OUTPUT_PATH.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
