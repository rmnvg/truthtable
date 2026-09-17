from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.ingestion import describe_schema, load_file_to_tables, register_tables, suggest_join_hints
from app.llm import generate_sql, suggest_chart, summarize_answer
from app.query_engine import run_query
from app.session import create_session, get_session

_HISTORY_LINES = 6

app = FastAPI(title="Darwinbox FDE Q&A")

# Permissive CORS for prototyping only — tighten before production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/session")
def create_session_endpoint():
    session_id = create_session()
    return {"session_id": session_id}


@app.post("/upload")
async def upload_files(session_id: str = Form(...), files: list[UploadFile] = File(...)):
    try:
        session = get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    added: list[str] = []
    for file in files:
        content = await file.read()
        try:
            tables = load_file_to_tables(file.filename, content)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        register_tables(session.connection, tables)
        session.tables.extend(tables.keys())
        added.extend(tables.keys())

    return {"tables": session.tables, "added": added}


@app.post("/ask")
async def ask_question(session_id: str = Form(...), question: str = Form(...)):
    try:
        session = get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

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
        return {"answer": reason, "sql": None, "columns": [], "rows": [], "chart": None}

    try:
        columns, rows = run_query(session.connection, sql)
    except Exception as exc:
        retry_sql = generate_sql(question, schema_description, history=history, prior_error=str(exc))
        if retry_sql.startswith("CANNOT_ANSWER"):
            raise HTTPException(status_code=422, detail=retry_sql) from exc
        try:
            columns, rows = run_query(session.connection, retry_sql)
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

    return {"answer": answer, "sql": sql, "columns": columns, "rows": rows, "chart": chart}
