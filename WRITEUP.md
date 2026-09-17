# truthtable — approach, key decisions, next steps

**Scope.** Upload one or more CSV/Excel files, ask analytical questions in plain
English, get a correct answer. I treated *correct* as the hard part: an LLM
answers every question fluently whether or not the data supports it, so most of
my effort went into making wrong answers impossible or visible, rather than into
adding features.

## Approach

The central decision: **the LLM never computes anything.** It only translates a
question into a DuckDB `SELECT`. DuckDB executes that query against the uploaded
data, and a second call turns the already-computed rows into a sentence, under
explicit instructions not to recompute or add outside numbers. Every figure a
user sees came from a query engine, not a language model — and the query is shown
in the UI, so any answer can be checked.

Files are cleaned on ingest (snake_case columns, currency symbols stripped, dates
inferred) and registered as DuckDB tables; the model receives the schema, sample
rows, suggested join keys and recent history.

## Key decisions

**Text-to-SQL rather than a code-writing agent.** SQL is constrained and
auditable, and I can validate it before it runs. Generated Python would be more
capable and far harder to trust or sandbox.

**DuckDB, in-process.** No database server to deploy, reads pandas DataFrames
natively, and gives real joins, aggregations and date functions. This is what
makes "the LLM doesn't do arithmetic" practical rather than aspirational.

**Groq running `openai/gpt-oss-120b`, temperature 0.** Open-weight per the brief;
Groq's latency keeps a chat loop usable. Swappable via env var.

**Refusing beats guessing — the decision I'd most want to discuss.** My first
version answered everything. I gave it `sales.csv` (`store_id, date, revenue`)
and `weather.csv` (`city, date, temperature`) — two files whose *only* shared
column is `date` — and asked for revenue on warm days. It wrote
`JOIN weather USING (date)`. The query ran without error and returned confident
per-store totals that were **silently wrong**: every store row matched every
city's weather row for that date, inflating revenue through duplicate matches.
Nothing in the output looked broken. There is in fact no correct answer, because
nothing in the data links a store to a city. So I changed the contract: a join
column must be a genuine shared *identifier*, not an incidental shared attribute,
otherwise return `CANNOT_ANSWER`. It now replies *"no reliable join between
weather and sales (date not a unique identifier for linking stores to cities)"*,
shown in the UI as a deliberate **"Declined to answer"** card. I then confirmed
it hadn't become over-cautious: it still performs a two-hop join across three
tables and two file formats.

**Guardrails on generated SQL.** `SELECT`/`WITH` only, a keyword blocklist, an
automatic row cap. The UI shows the *post-validation* query — what actually ran.
Join candidates, inferred by comparing column names across files (this is how
`orders.cust_id` gets linked to `customers.customer_id`), are displayed too, so
the model's assumptions are visible rather than hidden.

**Accuracy is measured, not assumed.** `eval_questions.py` runs a fixed question
set — totals, averages, filters, a cross-file join, a month-level trend, a period
comparison, and one unanswerable question — grading the **computed number**
against values calculated independently in pandas, so a fluent-but-wrong answer
fails. It passes 8/8, and is what let me change prompts without risking silent
regressions.

**Deliberate cuts.** Sessions are in-memory; a restart loses them, so the UI
detects that and starts a fresh session with an explanation instead of dying on a
404. No auth, no persistence, no streaming. I'd rather ship something narrow that
is verifiably correct.

## What I'd build next

1. **Persist sessions** (SQLite or Redis) so a refresh or redeploy doesn't lose
   uploaded data — the main blocker to real use.
2. **Clarify instead of refusing.** Ambiguity currently returns `CANNOT_ANSWER`;
   better is "did you mean X or Y?", remembered for the session.
3. **Let users confirm or correct inferred joins**, feeding that back into the
   prompt — turning a heuristic into stated intent.
4. **Grow the eval set and run it in CI**, since it is the only thing that makes
   prompt changes safe.
