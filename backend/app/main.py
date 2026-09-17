from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.session import create_session

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
