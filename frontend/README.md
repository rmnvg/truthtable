# truthtable — frontend

Next.js (App Router) + TypeScript + Tailwind UI for the truthtable Q&A app.
It talks to the FastAPI backend over three endpoints (`/session`, `/upload`,
`/ask`) via the typed client in `lib/api.ts`.

```
app/page.tsx               Upload zone + chat interface (single client page)
components/ResultChart.tsx  Bar/line/pie rendering for chart-worthy answers
lib/api.ts                  Typed API client
lib/format.ts               Display formatting for result values
```

## Running

The backend must be running first (see the [root README](../README.md) for
setup, environment variables, and the eval script).

```bash
cp .env.local.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev
```

Then open http://localhost:3000.
