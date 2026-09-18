import io
import itertools
import re
import warnings
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd

_NUMERIC_STRIP_RE = re.compile(r"[$₹,%]")
_NON_WORD_RE = re.compile(r"[^\w]+")
_MULTI_UNDERSCORE_RE = re.compile(r"_+")
_HAS_DIGIT_RE = re.compile(r"\d")

_PARSE_THRESHOLD = 0.8
_JOIN_SIMILARITY_THRESHOLD = 0.6
_JOIN_ID_BONUS = 0.15


def clean_column_name(col: str) -> str:
    name = str(col).strip().lower()
    name = _NON_WORD_RE.sub("_", name)
    name = _MULTI_UNDERSCORE_RE.sub("_", name).strip("_")
    if not name:
        name = "col"
    if name[0].isdigit():
        name = f"_{name}"
    return name


def _dedupe_columns(names: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    result = []
    for name in names:
        if name not in seen:
            seen[name] = 0
            result.append(name)
        else:
            seen[name] += 1
            result.append(f"{name}_{seen[name]}")
    return result


def _clean_numeric_string(value):
    if pd.isna(value):
        return value
    return _NUMERIC_STRIP_RE.sub("", str(value)).strip()


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = _dedupe_columns([clean_column_name(c) for c in df.columns])

    for col in df.columns:
        series = df[col]
        if (
            pd.api.types.is_numeric_dtype(series)
            or pd.api.types.is_datetime64_any_dtype(series)
            or pd.api.types.is_bool_dtype(series)
        ):
            continue

        non_null = series.notna()
        non_null_count = non_null.sum()
        if non_null_count == 0:
            continue

        numeric = pd.to_numeric(series.map(_clean_numeric_string), errors="coerce")
        if (numeric.notna() & non_null).sum() / non_null_count > _PARSE_THRESHOLD:
            df[col] = numeric
            continue

        # A bare month/weekday name ("January", "Monday") has no digits at all,
        # but dateutil fuzzy-fills the missing day/year and "parses" it anyway —
        # so without this check, a plain "month" column of names silently turns
        # into fabricated dates. No real date format is digit-free.
        digit_ratio = series[non_null].map(lambda v: bool(_HAS_DIGIT_RE.search(str(v)))).mean()
        if digit_ratio <= _PARSE_THRESHOLD:
            continue

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            parsed_dates = pd.to_datetime(series, errors="coerce")
        if (parsed_dates.notna() & non_null).sum() / non_null_count > _PARSE_THRESHOLD:
            df[col] = parsed_dates

    return df


def load_file_to_tables(filename: str, content: bytes) -> dict[str, pd.DataFrame]:
    stem = Path(filename).stem
    ext = Path(filename).suffix.lower()

    raw_tables: dict[str, pd.DataFrame] = {}
    if ext == ".csv":
        try:
            raw_tables[stem] = pd.read_csv(io.BytesIO(content))
        except pd.errors.EmptyDataError as exc:
            raise ValueError(f"'{filename}' is empty and has no columns to read.") from exc
        except (pd.errors.ParserError, UnicodeDecodeError) as exc:
            raise ValueError(f"Could not parse '{filename}' as CSV: {exc}") from exc
    elif ext in (".xlsx", ".xls"):
        try:
            sheets = pd.read_excel(io.BytesIO(content), sheet_name=None)
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(f"Could not parse '{filename}' as Excel: {exc}") from exc

        if not sheets:
            raise ValueError(f"'{filename}' has no sheets to read.")

        if len(sheets) > 1:
            for sheet_name, df in sheets.items():
                raw_tables[f"{stem}_{sheet_name}"] = df
        else:
            (_, df), = sheets.items()
            raw_tables[stem] = df
    else:
        raise ValueError(
            f"Unsupported file extension '{ext}' for '{filename}'. "
            "Only .csv, .xlsx, and .xls are supported."
        )

    for name, df in raw_tables.items():
        if df.shape[1] == 0:
            raise ValueError(f"'{name}' in '{filename}' has no columns.")

    return {
        clean_column_name(name): clean_dataframe(df)
        for name, df in raw_tables.items()
    }


def register_tables(con, tables: dict[str, pd.DataFrame]) -> None:
    for name, df in tables.items():
        con.register("_ingest_tmp", df)
        try:
            con.execute(f'CREATE OR REPLACE TABLE "{name}" AS SELECT * FROM _ingest_tmp')
        finally:
            con.unregister("_ingest_tmp")


def describe_schema(con, table_names: list[str], sample_rows: int = 3) -> str:
    blocks = []
    for name in table_names:
        describe_df = con.execute(f'DESCRIBE "{name}"').df()
        columns_text = "\n".join(
            f"  - {row['column_name']} ({row['column_type']})"
            for _, row in describe_df.iterrows()
        )

        sample_df = con.execute(f'SELECT * FROM "{name}" LIMIT {sample_rows}').df()
        sample_text = sample_df.to_string(index=False) if not sample_df.empty else "(no rows)"

        blocks.append(
            f"Table: {name}\nColumns:\n{columns_text}\nSample rows:\n{sample_text}"
        )
    return "\n\n".join(blocks)


def find_join_candidates(con, table_names: list[str]) -> list[dict]:
    if len(table_names) < 2:
        return []

    table_columns = {
        name: list(con.execute(f'DESCRIBE "{name}"').df()["column_name"])
        for name in table_names
    }

    candidates: list[dict] = []
    for t1, t2 in itertools.combinations(table_names, 2):
        for c1 in table_columns[t1]:
            for c2 in table_columns[t2]:
                exact = c1 == c2
                score = 1.0 if exact else SequenceMatcher(None, c1, c2).ratio()
                if c1.endswith("id") and c2.endswith("id"):
                    score += _JOIN_ID_BONUS
                if exact or score > _JOIN_SIMILARITY_THRESHOLD:
                    candidates.append(
                        {
                            "left": f"{t1}.{c1}",
                            "right": f"{t2}.{c2}",
                            "score": round(score, 3),
                        }
                    )

    candidates.sort(key=lambda candidate: -candidate["score"])
    return candidates


def suggest_join_hints(con, table_names: list[str]) -> str:
    candidates = find_join_candidates(con, table_names)
    if not candidates:
        return ""

    lines = "\n".join(f"  - {c['left']} <-> {c['right']}" for c in candidates)
    return f"Possible join keys:\n{lines}"
