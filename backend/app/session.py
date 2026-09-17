import uuid
from dataclasses import dataclass, field

import duckdb


@dataclass
class Session:
    connection: duckdb.DuckDBPyConnection
    tables: list[str] = field(default_factory=list)
    history: list[str] = field(default_factory=list)


_sessions: dict[str, Session] = {}


def create_session() -> str:
    session_id = str(uuid.uuid4())
    _sessions[session_id] = Session(connection=duckdb.connect(":memory:"))
    return session_id


def get_session(session_id: str) -> Session:
    session = _sessions.get(session_id)
    if session is None:
        raise KeyError(f"No session found with id '{session_id}'")
    return session
