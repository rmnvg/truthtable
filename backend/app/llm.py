import os

from groq import Groq

DEFAULT_MODEL = "openai/gpt-oss-120b"
_TEMPERATURE = 0

_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is not None:
        return _client

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Get a free API key at "
            "https://console.groq.com and set it in your environment (or .env)."
        )

    _client = Groq(api_key=api_key)
    return _client


def _get_model() -> str:
    return os.environ.get("GROQ_MODEL", DEFAULT_MODEL)


def _chat(system_prompt: str, user_prompt: str) -> str:
    client = _get_client()
    response = client.chat.completions.create(
        model=_get_model(),
        temperature=_TEMPERATURE,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return response.choices[0].message.content.strip()


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[: -3]
        text = text.strip()
        if text.lower().startswith("sql\n"):
            text = text[4:].strip()
    return text.strip()


def generate_sql(
    question: str,
    schema_description: str,
    history: str = "",
    prior_error: str = "",
) -> str:
    system_prompt = (
        "You are a DuckDB SQL expert. Given a database schema and a question, "
        "respond with ONLY a single valid DuckDB SELECT query that answers the "
        "question. Do not include any explanation, comments, or markdown code "
        "fences — return the raw SQL only.\n\n"
        "Before joining two tables, check that the join column is actually an "
        "identifier or key linking the same real-world entity across both "
        "tables (e.g. a shared id, code, or name meant to reference the same "
        "thing). Do NOT join tables solely on a shared non-key attribute like a "
        "plain date, a category label, or any column that is not unique per "
        "entity — joining on such a column silently multiplies rows into an "
        "incorrect many-to-many result even though the query runs without "
        "error. If no table has a column that actually identifies the same "
        "entity as another table, do not invent a join between them.\n\n"
        "If the schema cannot answer the question, or if you are genuinely "
        "unsure which columns to join on, or if answering would require "
        "joining on a column that is not a real shared identifier, respond "
        "with exactly:\n"
        "CANNOT_ANSWER: <short reason, and if relevant, ask the user how the "
        "tables relate>\n"
        "instead of a query."
    )

    user_parts = [f"Schema:\n{schema_description}"]
    if history:
        user_parts.append(f"Conversation history:\n{history}")
    user_parts.append(f"Question: {question}")
    if prior_error:
        user_parts.append(
            "The previous query you generated failed with this error:\n"
            f"{prior_error}\n"
            "Return a corrected query."
        )

    raw = _chat(system_prompt, "\n\n".join(user_parts))
    return _strip_code_fences(raw)


def suggest_chart(question: str, sql: str, result_columns: list[str]) -> dict | None:
    system_prompt = (
        "You decide whether a chart would help visualize a query result. "
        "If a chart would help, respond with exactly one line in this format:\n"
        "<bar|line|pie>|<x_column>|<y_column>\n"
        "using the exact column names given. If no chart would help, respond "
        "with exactly: NONE\n"
        "Do not include any explanation."
    )
    user_prompt = (
        f"Question: {question}\n"
        f"SQL: {sql}\n"
        f"Result columns: {', '.join(result_columns)}"
    )

    raw = _chat(system_prompt, user_prompt).strip()
    if raw.upper() == "NONE":
        return None

    parts = raw.split("|")
    if len(parts) != 3:
        return None

    chart_type, x_column, y_column = (p.strip() for p in parts)
    if chart_type not in ("bar", "line", "pie"):
        return None
    if x_column not in result_columns or y_column not in result_columns:
        return None

    return {"type": chart_type, "x": x_column, "y": y_column}


def summarize_answer(question: str, columns: list[str], rows: list[tuple]) -> str:
    system_prompt = (
        "You are given the question and the already-correctly-computed query "
        "result. Write exactly one short sentence that answers the question, "
        "using only the values provided. Do not recompute, estimate, or bring "
        "in any numbers from outside the given result."
    )
    sample_rows = rows[:20]
    rows_text = "\n".join(str(dict(zip(columns, row))) for row in sample_rows)
    user_prompt = (
        f"Question: {question}\n"
        f"Columns: {', '.join(columns)}\n"
        f"Result rows:\n{rows_text}"
    )

    return _chat(system_prompt, user_prompt)
