from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from app.ingestion import (
    describe_schema,
    find_join_candidates,
    load_file_to_tables,
    register_tables,
    suggest_join_hints,
)
from app.llm import generate_sql, suggest_chart, summarize_answer
from app.query_engine import run_query
from app.session import Session, create_session, get_session

_HISTORY_LINES = 6
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

app = FastAPI(title="truthtable")

# Permissive CORS for prototyping only — tighten before production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_session(session_id: str) -> Session:
    try:
        return get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/session")
def create_session_endpoint():
    session_id = create_session()
    return {"session_id": session_id}


@app.get("/session/{session_id}")
def get_session_endpoint(session_id: str):
    """Lets the client check whether a stored session still exists server-side —
    sessions live in memory, so a restart invalidates them."""
    session = _require_session(session_id)
    return {
        "session_id": session_id,
        "tables": session.tables,
        "join_hints": find_join_candidates(session.connection, session.tables),
    }


@app.post("/upload")
async def upload_files(session_id: str = Form(...), files: list[UploadFile] = File(...)):
    session = _require_session(session_id)

    added: list[str] = []
    for file in files:
        content = await file.read()
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"'{file.filename}' exceeds the "
                    f"{MAX_UPLOAD_BYTES // (1024 * 1024)}MB upload limit."
                ),
            )

        try:
            tables = await run_in_threadpool(load_file_to_tables, file.filename, content)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        await run_in_threadpool(register_tables, session.connection, tables)

        # Re-uploading a file replaces the table in DuckDB, so the name must not
        # be appended twice — a duplicated name would describe the same table
        # twice to the model and produce bogus self-join hints.
        for name in tables:
            if name not in session.tables:
                session.tables.append(name)
        added.extend(tables.keys())

    return {
        "tables": session.tables,
        "added": added,
        "join_hints": find_join_candidates(session.connection, session.tables),
    }


# Deliberately `def`, not `async def`: the Groq SDK calls below are synchronous,
# and running them on the event loop would block every other request.
@app.post("/ask")
def ask_question(session_id: str = Form(...), question: str = Form(...)):
    session = _require_session(session_id)

    if not session.tables:
        raise HTTPException(
            status_code=400, detail="No tables have been uploaded for this session yet."
        )

    schema_description = describe_schema(session.connection, session.tables)
    join_hints = suggest_join_hints(session.connection, session.tables)
    if join_hints:
        schema_description = f"{schema_description}\n\n{join_hints}"

    history = "\n".join(session.history[-_HISTORY_LINES:])

    sql = generate_sql(question, schema_description, history=history)

    if sql.startswith("CANNOT_ANSWER"):
        reason = sql.split(":", 1)[1].strip() if ":" in sql else sql
        session.history.append(f"Q: {question}")
        session.history.append(f"A: {reason}")
        return {
            "status": "cannot_answer",
            "answer": reason,
            "sql": None,
            "executed_sql": None,
            "retried": False,
            "columns": [],
            "rows": [],
            "chart": None,
        }

    retried = False
    try:
        columns, rows, executed_sql = run_query(session.connection, sql)
    except Exception as exc:
        retried = True
        retry_sql = generate_sql(
            question, schema_description, history=history, prior_error=str(exc)
        )
        if retry_sql.startswith("CANNOT_ANSWER"):
            raise HTTPException(status_code=422, detail=retry_sql) from exc
        try:
            columns, rows, executed_sql = run_query(session.connection, retry_sql)
        except Exception as retry_exc:
            raise HTTPException(status_code=422, detail=str(retry_exc)) from retry_exc
        sql = retry_sql

    chart = None
    answer = "The query ran successfully but returned no rows."
    if rows:
        chart = suggest_chart(question, sql, columns)
        answer = summarize_answer(question, columns, [tuple(row.values()) for row in rows])

    session.history.append(f"Q: {question}")
    session.history.append(f"A: {answer}")

    return {
        "status": "answered",
        "answer": answer,
        "sql": sql,
        "executed_sql": executed_sql,
        "retried": retried,
        "columns": columns,
        "rows": rows,
        "chart": chart,
    }
