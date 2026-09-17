import duckdb
import pytest

from app.query_engine import UnsafeQueryError, run_query, validate_sql


def test_validate_sql_blocks_drop():
    with pytest.raises(UnsafeQueryError):
        validate_sql("DROP TABLE employees")


def test_validate_sql_blocks_smuggled_delete_in_select():
    with pytest.raises(UnsafeQueryError):
        validate_sql("SELECT * FROM employees; DELETE FROM employees")


def test_validate_sql_adds_limit_when_missing():
    result = validate_sql("SELECT * FROM employees")
    assert result == "SELECT * FROM employees LIMIT 500"


def test_validate_sql_keeps_existing_limit():
    result = validate_sql("SELECT * FROM employees LIMIT 10")
    assert result == "SELECT * FROM employees LIMIT 10"


def test_validate_sql_strips_trailing_semicolon():
    result = validate_sql("SELECT * FROM employees LIMIT 10;")
    assert result == "SELECT * FROM employees LIMIT 10"


def test_run_query_against_real_duckdb_table():
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE employees (id INTEGER, name VARCHAR, salary INTEGER)")
    con.execute(
        "INSERT INTO employees VALUES (1, 'Alice', 1000), (2, 'Bob', 2000)"
    )

    columns, rows = run_query(con, "SELECT id, name, salary FROM employees ORDER BY id")

    assert columns == ["id", "name", "salary"]
    assert rows == [
        {"id": 1, "name": "Alice", "salary": 1000},
        {"id": 2, "name": "Bob", "salary": 2000},
    ]
