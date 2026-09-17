from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.ingestion import load_file_to_tables, register_tables
from app.session import create_session, get_session

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
