import io

import pandas as pd
import pytest

from app.ingestion import clean_column_name, clean_dataframe, load_file_to_tables


def test_clean_column_name_basic():
    assert clean_column_name("Customer ID") == "customer_id"


def test_clean_column_name_strips_symbols_and_collapses_underscores():
    assert clean_column_name("Salary ($)") == "salary"
    assert clean_column_name("  100%   Done!!  ") == "_100_done"


def test_clean_dataframe_strips_currency_and_coerces_numeric():
    df = pd.DataFrame({"Amount": ["$1,200", "$2,400", "$3,600"]})
    cleaned = clean_dataframe(df)

    assert pd.api.types.is_numeric_dtype(cleaned["amount"])
    assert cleaned["amount"].tolist() == [1200.0, 2400.0, 3600.0]


def test_clean_dataframe_does_not_coerce_bare_month_names_to_dates():
    # dateutil fuzzy-parses "January" into a fabricated date (arbitrary day/year),
    # even though a bare month name carries no real date information.
    df = pd.DataFrame({"Month": ["January", "February", "March", "April"]})
    cleaned = clean_dataframe(df)

    assert not pd.api.types.is_datetime64_any_dtype(cleaned["month"])
    assert cleaned["month"].tolist() == ["January", "February", "March", "April"]


def test_clean_dataframe_still_coerces_real_dates():
    df = pd.DataFrame({"Order Date": ["2024-01-05", "2024-02-10", "2024-03-15"]})
    cleaned = clean_dataframe(df)

    assert pd.api.types.is_datetime64_any_dtype(cleaned["order_date"])


def test_load_file_to_tables_csv_round_trip_with_currency_column():
    csv_bytes = (
        b"Customer ID,Order Total\n"
        b'1,"$1,200"\n'
        b'2,"$2,400"\n'
        b'3,"$3,600"\n'
    )

    tables = load_file_to_tables("orders.csv", csv_bytes)

    assert list(tables.keys()) == ["orders"]
    df = tables["orders"]
    assert list(df.columns) == ["customer_id", "order_total"]
    assert pd.api.types.is_numeric_dtype(df["order_total"])
    assert df["order_total"].tolist() == [1200.0, 2400.0, 3600.0]


def test_load_file_to_tables_multi_sheet_excel_produces_multiple_tables():
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        pd.DataFrame({"A": [1, 2]}).to_excel(writer, sheet_name="Sheet1", index=False)
        pd.DataFrame({"B": [3, 4]}).to_excel(writer, sheet_name="Sheet2", index=False)

    tables = load_file_to_tables("report.xlsx", buffer.getvalue())

    assert set(tables.keys()) == {"report_sheet1", "report_sheet2"}
    assert tables["report_sheet1"]["a"].tolist() == [1, 2]
    assert tables["report_sheet2"]["b"].tolist() == [3, 4]


def test_load_file_to_tables_header_only_csv_produces_empty_table():
    csv_bytes = b"customer_id,order_total\n"

    tables = load_file_to_tables("empty_orders.csv", csv_bytes)

    assert list(tables.keys()) == ["empty_orders"]
    df = tables["empty_orders"]
    assert list(df.columns) == ["customer_id", "order_total"]
    assert len(df) == 0


def test_clean_dataframe_leaves_all_blank_column_untouched():
    df = pd.DataFrame({"id": [1, 2, 3], "notes": [None, None, None]})
    cleaned = clean_dataframe(df)

    assert cleaned["notes"].isna().all()


def test_load_file_to_tables_truly_empty_csv_raises_value_error():
    with pytest.raises(ValueError):
        load_file_to_tables("blank.csv", b"")


def test_load_file_to_tables_unsupported_extension_raises_value_error():
    with pytest.raises(ValueError):
        load_file_to_tables("notes.txt", b"hello")
