# darwinbox-fde-qa

Full-stack AI data Q&A web app.

## Backend

Python 3.11, FastAPI, served with uvicorn.

### Run with Docker (recommended)

```bash
docker compose up --build
```

The API is then available at http://localhost:8000, with live reload on
changes to `backend/app`.

### Run without Docker

```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Frontend

TBD.
