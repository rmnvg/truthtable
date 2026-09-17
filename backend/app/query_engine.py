import re

_FORBIDDEN_KEYWORDS = [
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "ALTER",
    "CREATE",
    "ATTACH",
    "COPY",
    "PRAGMA",
    "EXPORT",
    "IMPORT",
    "CALL",
]
_FORBIDDEN_RE = re.compile(r"\b(" + "|".join(_FORBIDDEN_KEYWORDS) + r")\b", re.IGNORECASE)
_STARTS_WITH_RE = re.compile(r"^(SELECT|WITH)\b", re.IGNORECASE)
_LIMIT_RE = re.compile(r"\bLIMIT\b", re.IGNORECASE)

_DEFAULT_LIMIT = 500


class UnsafeQueryError(Exception):
    pass


def validate_sql(sql: str) -> str:
    cleaned = sql.strip().rstrip(";").strip()

    if not _STARTS_WITH_RE.match(cleaned):
        raise UnsafeQueryError("Only SELECT or WITH queries are allowed.")

    forbidden = _FORBIDDEN_RE.search(cleaned)
    if forbidden:
        raise UnsafeQueryError(f"Query contains disallowed keyword: {forbidden.group(0)}")

    if not _LIMIT_RE.search(cleaned):
        cleaned = f"{cleaned} LIMIT {_DEFAULT_LIMIT}"

    return cleaned


def run_query(con, sql: str) -> tuple[list[str], list[dict], str]:
    """Returns (columns, rows, executed_sql). The executed SQL is the post-validation
    query — what actually ran, which is what the UI shows."""
    validated = validate_sql(sql)
    result = con.execute(validated)
    columns = [desc[0] for desc in result.description]
    rows = [dict(zip(columns, row)) for row in result.fetchall()]
    return columns, rows, validated
