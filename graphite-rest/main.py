"""Entry point kept at repo-convention location.

`uv run fastapi dev main.py` and `uv run uvicorn main:app --reload` both work
against this file. Actual app construction lives in `app/main.py`.
"""

from app.main import app  # noqa: F401  (re-exported for ASGI servers)


def main() -> None:
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()
