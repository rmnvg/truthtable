"""Standalone accuracy eval for the Q&A pipeline against the sample data.

Not a pytest suite — it exercises the ingestion -> LLM -> query_engine
pipeline directly (no HTTP layer) and grades each answer by the *computed
numeric result*, not by the model's prose. Requires GROQ_API_KEY to be set
(it makes real LLM calls).

Run from the repo root, e.g. via Docker (mounts the whole repo so the
sample_data/-relative path resolution below works the same as it does
locally):

    docker run --rm --env-file .env \\
      -v "$(pwd):/workspace" -w /workspace \\
      darwinbox-fde-qa-backend python backend/tests/eval_questions.py

or locally with dependencies installed:

    GROQ_API_KEY=... python backend/tests/eval_questions.py
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import duckdb

from app.ingestion import describe_schema, load_file_to_tables, register_tables, suggest_join_hints
from app.llm import generate_sql
from app.query_engine import run_query

SAMPLE_DATA_DIR = Path(__file__).resolve().parents[2] / "sample_data"
SAMPLE_FILES = ["orders.csv", "customers.csv"]

CANNOT_ANSWER = "CANNOT_ANSWER"
TOLERANCE = 0.01

# Expected values were computed independently with pandas over sample_data/,
# not taken from a model response — see README.
CASES = [
    {
        "label": "Simple total",
        "question": "What is the total (sum) of all order amounts?",
        "expected": 59868.57,
    },
    {
        "label": "Average",
        "question": "What is the average order amount across all orders?",
        "expected": 299.3428,
    },
    {
        "label": "Filter",
        "question": "What is the sum of order amounts for orders with an amount greater than $500?",
        "expected": 7707.50,
    },
    {
        "label": "Count filter",
        "question": "How many orders are in the Software category?",
        "expected": 46,
    },
    {
        "label": "Cross-file join",
        "question": "What is the sum of order amounts for customers located in the West region?",
        "expected": 17047.16,
    },
    {
        "label": "Trend",
        "question": "What was the total revenue in June 2024?",
        "expected": 14231.68,
    },
    {
        "label": "Comparison",
        "question": (
            "How much more revenue was there in June 2024 than in January 2024? "
            "Return the difference as a single number."
        ),
        "expected": 8039.00,
    },
    {
        "label": "Unanswerable",
        "question": "What is the average customer satisfaction rating across all customers?",
        "expected": CANNOT_ANSWER,
    },
]


def load_sample_tables(con: duckdb.DuckDBPyConnection) -> list[str]:
    table_names = []
    for filename in SAMPLE_FILES:
        content = (SAMPLE_DATA_DIR / filename).read_bytes()
        tables = load_file_to_tables(filename, content)
        register_tables(con, tables)
        table_names.extend(tables.keys())
    return table_names


def answer_question(con: duckdb.DuckDBPyConnection, table_names: list[str], question: str):
    """Mirrors the /ask endpoint's logic: schema+hints -> generate_sql -> run_query,
    with one retry on execution failure."""
    schema_description = describe_schema(con, table_names)
    join_hints = suggest_join_hints(con, table_names)
    if join_hints:
        schema_description = f"{schema_description}\n\n{join_hints}"

    sql = generate_sql(question, schema_description)
    if sql.startswith(CANNOT_ANSWER):
        return CANNOT_ANSWER, sql, None, None

    try:
        columns, rows, _ = run_query(con, sql)
    except Exception as exc:
        retry_sql = generate_sql(question, schema_description, prior_error=str(exc))
        if retry_sql.startswith(CANNOT_ANSWER):
            return CANNOT_ANSWER, retry_sql, None, None
        columns, rows, _ = run_query(con, retry_sql)
        sql = retry_sql

    return "OK", sql, columns, rows


def first_numeric_value(columns: list[str], rows: list[dict]):
    if not rows:
        return None
    value = rows[0][columns[0]]
    return float(value) if value is not None else None


def run_eval() -> int:
    con = duckdb.connect(":memory:")
    table_names = load_sample_tables(con)

    passed = 0
    failed = 0

    for case in CASES:
        label, question, expected = case["label"], case["question"], case["expected"]

        try:
            status, sql, columns, rows = answer_question(con, table_names, question)
        except Exception as exc:
            print(f"[ERROR] {label}: {question!r} raised {exc!r}")
            failed += 1
            continue

        if expected == CANNOT_ANSWER:
            ok = status == CANNOT_ANSWER
            actual_display = sql
        elif status != "OK":
            ok = False
            actual_display = sql
        else:
            actual_value = first_numeric_value(columns, rows)
            ok = actual_value is not None and math.isclose(actual_value, expected, abs_tol=TOLERANCE)
            actual_display = actual_value

        result = "PASS" if ok else "FAIL"
        passed += ok
        failed += not ok

        print(f"[{result}] {label}: {question!r}")
        print(f"         expected={expected!r} actual={actual_display!r}")
        if not ok:
            print(f"         sql={sql!r}")

    print(f"\n{passed} passed, {failed} failed out of {len(CASES)}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(run_eval())
