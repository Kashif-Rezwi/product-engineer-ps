# PLAN — Problem 01: Resumable Realtime Conversation

## Goal

Build a chat app where users type prompts and get streaming AI-like replies.
The single hard requirement: **a reconnect must resume exactly where it left
off — no restart, no repeated text, no silent gaps.**

---

## Stack

| Layer       | Choice                          |
|-------------|---------------------------------|
| Backend     | Node.js + Express + TypeScript  |
| Database    | PostgreSQL via Prisma ORM       |
| Event store | Redis Streams (ioredis)         |
| Transport   | HTTP SSE with `Last-Event-ID`   |
| Frontend    | Next.js App Router + TypeScript |
| Auth        | None (out of scope)             |
| AI model    | Groq LLM (free available model via GROQ_API_KEY) |
| Deploy      | Local only via Docker Compose   |

---

## Directory Naming

Use **kebab-case** (`-`) for all directory and file names.

```
resumable-realtime-chat/
├── server/
├── client/
├── docker-compose.yml
└── PLAN.md
```

---

## Project Layout

```
server/
├── src/
│   ├── routes/
│   │   └── conversation.routes.ts   <-- URL mapping only
│   ├── controllers/
│   │   └── conversation.controller.ts  <-- req/res handling
│   ├── services/
│   │   ├── groq.service.ts          <-- Groq streaming inference (free available model)
│   │   ├── runner.service.ts        <-- orchestrates execution
│   │   ├── redis.service.ts         <-- XADD / XREAD
│   │   ├── stream.service.ts        <-- SSE loop
│   │   └── recovery.service.ts      <-- crash recovery on startup
│   ├── db/
│   │   └── prisma.ts                <-- singleton PrismaClient
│   ├── types/
│   │   └── events.ts                <-- RunEvent discriminated union
│   └── index.ts
├── prisma/
│   └── schema.prisma
└── package.json

client/
├── src/
│   ├── lib/
│   │   ├── sse.ts
│   │   ├── use-conversation-stream.ts
│   │   └── stream.reducer.ts
│   └── app/
│       └── page.tsx
└── package.json
```

---

## SSE Wire Format

Every event the server sends:

```
id: 1726123456789-0
data: {"type":"text_chunk","position":0,"text":"Hello "}

id: 1726123456789-1
data: {"type":"text_chunk","position":1,"text":"world "}

id: 1726123456789-35
data: {"type":"completed"}
```

The `id:` field = Redis Stream entry ID. On reconnect, the browser sends
`Last-Event-ID: 1726123456789-1` and the server calls
`XREAD STREAMS conv:events:{runId} 1726123456789-1`
which returns **only events after that point.**

---

## Event Types

```
RunEvent:
  text_chunk   ->  position: number, text: string
  completed    ->  position: number
  failed       ->  message: string

Heartbeat: raw SSE comment (": heartbeat") -- never stored in Redis
```

---

## Database Schema

**Conversation** — groups messages from one chat session.

**UserMessage** — one message sent by the user.

**Run** — one execution of the generator for a given user message.
A "Run" is what happens when the AI "runs" to answer a prompt.

```
Conversation
  id          cuid  PK
  createdAt   DateTime

UserMessage
  id             cuid  PK
  conversationId FK -> Conversation
  role           String  @default("user")
  content        Text
  createdAt      DateTime

Run
  id             cuid  PK
  conversationId FK -> Conversation
  userMessageId  FK -> UserMessage
  status         QUEUED | RUNNING | COMPLETED | FAILED
  traceLog       Json?   <-- ordered RunEvent[], persisted on terminal
  createdAt      DateTime
  updatedAt      DateTime
```

State machine -- only these transitions are valid:
```
QUEUED ──> RUNNING ──> COMPLETED
              │
              └──> FAILED
```

---

## Connection States (Frontend)

Exposing all 5 connection states required by Requirement #8 of the problem brief:

```
disconnected  -- initial state before sending, or when stream is closed / idle
connected     -- actively receiving SSE chunks from server (streaming)
reconnecting  -- network dropped; hook is retrying with Last-Event-ID cursor
completed     -- stream received terminal completed event; input unlocked
failed        -- retries exhausted, OR server sent a failed event
```

**Why these 5 states exist on the frontend:**
1. **Demo Visibility**: During the demo video, when the network is interrupted (e.g. Chrome DevTools Offline), the UI status badge visibly transitions: `connected` (green) ➔ `reconnecting (attempt 1/3)` (yellow) ➔ `connected` (green) ➔ `completed` (checkmark).
2. **Input Guarding**: Prevents user submission while in `connected` or `reconnecting` to avoid race conditions or duplicate runs.
3. **Stream Lifecycle**: Tears down listeners and aborts fetch when reaching terminal states (`completed` or `failed`).

---

## Reconnection Logic (The Core Feature)

```
CLIENT                                   SERVER / REDIS
  │                                            │
  │── GET /stream (first connect) ────────────>│ (afterId = '0-0')
  │<── streams chunks 0..14 ───────────────────│
  │                                            │
  x   [ NETWORK DROPS at chunk 14 ]            x
  │   Client stores: lastEventId = "1726...14" │
  │                                            │
  │── GET /stream (reconnect) ────────────────>│
  │   Header: Last-Event-ID: 1726...14         │ afterId = '1726...14'
  │                                            │ XREAD returns ONLY > 14
  │<── streams chunks 15..34, then completed ──│
  │                                            │
[ Result: 35 chunks total. Zero repeats. Zero gaps. ]
```

Fallback when Redis stream expired (24h TTL):
- Run is `COMPLETED` -> replay remaining events from `traceLog` in DB
- Run is `FAILED` -> send a single `failed` event and close

---

## LLM Integration (Groq)

The application uses Groq's official SDK (`groq-sdk`) with an available free model for realtime streaming completions.

- Configured via `GROQ_API_KEY` in `server/.env`
- Model: Any currently available free model on Groq
- The service streams token-by-token completions directly into `runner.service.ts`, which writes ordered events to Redis Streams and persists state to Postgres.

---
---

## PHASE 0 — Basic Server & Client Scaffold

```
[ Terminal 1 ]              [ Terminal 2 ]

  server/                     client/
  npm run dev                 npm run dev
       │                           │
       ▼                           ▼
  :3001/health -> ok          localhost:3000 loads
```

**Goal:** Both apps start cleanly. No DB, no Redis, no Docker yet.

- Initialize `server/` as a TypeScript npm project with Express installed
- Add a `GET /health` route that returns `{ status: "ok" }`
- Set up `tsconfig.json` and add a `dev` script using `tsx watch`
- Initialize `client/` as a Next.js TypeScript App Router project
- Confirm both run simultaneously without errors

**Checkpoint:** `curl localhost:3001/health` returns ok. `localhost:3000` loads.

> Hands off to Phase 1: We have two running apps. Now build the server structure.

---

## PHASE 1 — Routes, Controllers & Services Shell

```
Request flow:

  Route (URL mapping)
    --> Controller (parse req, send res)
      --> Service (business logic)
        --> (returns data)
```

**Goal:** Clean layered architecture with real routes. Returns mocked data — no DB yet.

- Create the routes file mounting two endpoints:
  - `POST /conversations` — creates a conversation
  - `POST /conversations/:id/messages` — creates a message and a run
  - `GET  /conversations/:id` — fetches conversation history
- Create the controller that handles `req` and `res` for each route
- Create a service that returns hardcoded/mocked responses (maps or fake IDs)
- Mount the router in `index.ts`

**Checkpoint (Insomnia/curl):** All 3 routes respond with correct shapes.
No DB required — mock data is fine at this stage.

> Hands off to Phase 2: Route structure is proven. Now wire in the generator.

---

## PHASE 2 — Groq Integration & Runner (In-Memory)

```
POST /conversations/:id/messages
  │
  ├──> Returns 201 { runId } immediately
  │
  └──> Fires async (no await): executeRun(runId)
         │
         ├── status -> RUNNING  (in-memory)
         ├── streams tokens from Groq API
         ├── status -> COMPLETED
         └── traceLog collected in memory
```

**Goal:** Background runner streams from Groq. Status and events tracked in memory.
No DB, no client streaming yet.

- Install `groq-sdk` in `server/`
- Implement `groq.service.ts`: calls Groq chat completion with `stream: true` using an available free model
- Implement `runner.service.ts` with `executeRun(runId)`:
  - Marks run as RUNNING (in-memory map)
  - Consumes the async token stream from `groq.service.ts`, collecting events into a trace array
  - On success: marks COMPLETED, stores trace in memory
  - On error: marks FAILED, stores error message
- Define the `RunEvent` types in `types/events.ts`
- Fire `executeRun` without `await` after returning the 201 response

**Checkpoint:** POST a message to `/conversations/:id/messages`, wait for generation to complete, inspect the in-memory run state. Should show `COMPLETED` with the generated response chunks in the trace.

> Hands off to Phase 3: Generator works. Now persist data to a real database.

---

## PHASE 3 — Database (Postgres + Prisma)

```
docker-compose.yml
  └── postgres:16-alpine
        │
        ▼
  DATABASE_URL in .env
        │
        ▼
  schema.prisma
  (Conversation, UserMessage, Run)
        │
        ▼
  npx prisma migrate dev
```

**Goal:** Replace all in-memory mocks with real Postgres persistence.

- Add Postgres to `docker-compose.yml` and run `docker compose up -d`
- Initialize Prisma, set `DATABASE_URL` in `.env`
- Define the schema: `Conversation`, `UserMessage`, `Run`
- Run `prisma migrate dev --name init`
- Create a singleton `PrismaClient` in `db/prisma.ts`
- Update the service to use Prisma for:
  - `createConversation`, `createUserMessage`, `createRun`
  - `markRunning`, `markCompleted`, `markFailed`, `saveTraceLog`
  - Status-guarded transitions: only allow `RUNNING -> COMPLETED` (not `COMPLETED -> anything`)

**Checkpoint:** POST a message, wait 3s, check in `psql`:
Run status = `COMPLETED`, traceLog column has all events.

> Hands off to Phase 4: Data is durable. Now stream it live over SSE.

---

## PHASE 4 — SSE Streaming (No Redis Yet)

```
[ runner.service ]
  yields chunks one by one
       │
       ▼ (directly piped)
[ stream handler ]
  writes SSE frames:
       │  id: <position>
       │  data: {"type":"text_chunk",...}
       ▼
[ browser ]
```

**Goal:** Live token-by-token streaming works end-to-end in the browser.
No Redis yet -- events go directly from the generator to the SSE response.

- Add SSE route: `GET /conversations/:convId/runs/:runId/stream`
- In the controller: set SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`)
- Stream events directly from the generator as SSE frames, using position as the `id:` field
- Handle client disconnect: stop the loop when `req` emits `close`
- Add a heartbeat comment every 15s to keep connections alive through proxies

**Checkpoint (Insomnia):** Connect to the stream endpoint.
Watch 35 chunks stream one by one, ending with `completed`.

> Hands off to Phase 5: Basic streaming works. Now make it reconnectable.

---

## PHASE 5 — Redis Streams & Reconnection (The Core Feature)

```
Before (Phase 4):     Generator ---> SSE (direct)
After  (Phase 5):     Generator ---> Redis Stream ---> SSE (from cursor)

The Redis Stream is the middle layer that makes reconnection possible.
```

**Goal:** Implement the full reconnection loop. This IS the assignment.

- Add Redis to `docker-compose.yml` and run `docker compose up -d`
- Implement `redis.service.ts`:
  - `emitEvent(runId, event)` -- appends to `conv:events:{runId}` via `XADD`, sets 24h TTL
  - `readEvents(runId, afterId)` -- reads entries after cursor via `XREAD BLOCK`
- Update `runner.service.ts` to emit each event to Redis in addition to collecting the trace
- Implement `stream.service.ts` as a XREAD loop that writes SSE frames from Redis entries
- The Redis Stream entry ID (e.g. `1726123456789-0`) becomes the SSE `id:` field
- In the SSE route controller:
  - Read `Last-Event-ID` header
  - Validate format (must match Redis stream ID pattern `\d+-\d+`)
  - Return `400` if provided but invalid
  - Pass validated cursor to `stream.service.ts` (defaults to `'0-0'` if absent)
- Fallback: if XREAD returns empty and Run is `COMPLETED`, replay from `traceLog` in DB

**Checkpoint (two terminals):**
```
Terminal 1: connect to SSE stream, cancel at chunk 14 (note the id: value)
Terminal 2: reconnect with "Last-Event-ID: <that id>"
Result: chunks 15..34 only, then completed. Zero duplicates.
```

> Hands off to Phase 6: Reconnection works. Now handle server crashes.

---

## PHASE 6 — Startup Crash Recovery

```
Server crashes with Run in RUNNING state
         │
         ▼
Server restarts
         │
         ├── recovery.service runs BEFORE app.listen()
         │
         ├── Finds all Runs where status = 'RUNNING'
         │
         ├── Marks them FAILED in DB
         │
         └── Emits a 'failed' event to their Redis streams

Client reconnects --> receives 'failed' --> shows error state
```

**Goal:** Runs interrupted by a crash are cleaned up before the server starts serving.

- Implement `recovery.service.ts` with a `reconcileInterruptedRuns()` function
- Call it with `await` in `index.ts` before `app.listen()`
- For each stuck RUNNING run: mark FAILED in DB + emit `failed` to Redis stream

**Checkpoint:** Start a stream, kill the server (Ctrl+C), restart.
Check DB: status = `FAILED`. Reconnect SSE: receives `failed` event.

> Hands off to Phase 7: Server is complete. Now build the frontend.

---

## PHASE 7 — Frontend

```
┌────────────────────────────────────────────────────────┐
│ Chat Page                                              │
├────────────────────────────────────────────────────────┤
│                                                        │
│  User: Explain recursion                               │
│                                                        │
│  Assistant: Recursion is when a function calls itself  │
│  to solve a smaller instance of the same problem... |  │
│                                                        │
│  ┌────────────────────────────────────────┐ ┌────────┐ │
│  │ Type a message...                      │ │  Send  │ │
│  └────────────────────────────────────────┘ └────────┘ │
└────────────────────────────────────────────────────────┘
```

**Goal:** Working chat UI with streaming text and reconnection badge.

- Implement `sse.ts` — SSE frame parser that handles chunk-split boundaries,
  extracts `id:` and `data:` fields correctly
- Implement `stream.reducer.ts` — manages the 5 states:
  `disconnected | connected | reconnecting | completed | failed`
  and accumulates text chunks for display
- Implement `use-conversation-stream.ts` hook:
  - Reads from SSE using `fetch` (not `EventSource`, since we need custom headers)
  - Sends `Last-Event-ID` header on every request
  - Deduplicates events by ID using a `Set`
  - On network failure: transitions to `reconnecting`, waits 500ms/1s/2s then retries (bounded 3 attempts)
  - Transitions to `completed` on terminal event; transitions to `failed` on error / retry exhaustion
  - Uses `AbortController` so cleanup works on unmount
- Implement `page.tsx` — the chat UI:
  - Creates a conversation on page load
  - Textarea + Send button (disabled during `connected` and `reconnecting`)
  - Shows conversation history
  - Shows streaming reply token by token
  - Shows connection status badge: `connected` (green) / `reconnecting (attempt X)` (yellow) / `completed` (checkmark) / `failed` (red banner)

**Checkpoint (Browser):**
```
1. Send a message -> watch words appear one by one
2. DevTools -> Network -> Offline (mid-stream)
3. DevTools -> Network -> Online
4. Text continues exactly where it stopped. Nothing repeated.
```

> Hands off to Phase 8: Full stack works. Polish and edge cases.

---

## PHASE 8 — Polish & Edge Cases

**Goal:** Handle every edge case a reviewer will probe.

- Configure CORS: allow `localhost:3000`, expose `Last-Event-ID` header
- Test stale cursor: send garbage as `Last-Event-ID` -> verify `400` response
- Test expired stream: reconnect after Redis TTL -> verify replay from `traceLog`
- Test multi-message: two messages in one conversation, each with its own stream
- Test failure state: trigger generator error partway through -> client shows "Connection lost"
- Clean up verbose console logs, add descriptive error messages

**Checkpoint:** All edge cases pass manually. No console errors in the browser.

> Hands off to Phase 9: Code is correct. Write tests to prove it.

---

## PHASE 9 — Tests & Deterministic Benchmark

**Goal:** Targeted tests and verification benchmark using an isolated deterministic fake generator.

> *Per the problem brief: "Tests must not call a paid model API and should not depend on arbitrary long sleeps."*  
> The fake generator lives strictly in test and benchmark scripts — completely separated from the app services.

Test Helper (`tests/helpers/fake-generator.ts`):
- Pure deterministic generator yielding 35 ordered chunks (`"chunk_0 "`, `"chunk_1 "`...) with configurable delay and error injection
- Used exclusively by automated tests and the verification script

Backend (Jest):
- `redis.service` -- XREAD is called with the correct cursor, not '0-0', on reconnect
- `runner.service` -- `markFailed` is called when generation fails mid-stream
- `recovery.service` -- RUNNING runs are marked FAILED on startup
- Terminal guard -- a second `markCompleted` call after COMPLETED is a no-op

Frontend (Vitest):
- `sse.ts` -- frames split across TCP chunks are parsed correctly
- `use-conversation-stream` -- `Last-Event-ID` header is sent on reconnect
- `use-conversation-stream` -- same event ID appears at most once in the output

Verification script (`scripts/verify-resumption.ts`):
- Uses the test fake generator to emit 35 ordered events
- POST message -> consume stream -> abort at chunk 10 -> reconnect with last ID
- Assert: exactly 35 unique chunks total with zero duplicates and zero gaps, final event = `completed`

**Checkpoint:** `npm test` passes in both `server/` and `client/`. Benchmark script prints PASS.

> Hands off to Phase 10: Everything verified. Submit.

---

## PHASE 10 — Submission

**Goal:** SUBMISSION.md complete, demo video recorded, repo clean.

- Copy `SUBMISSION_TEMPLATE.md` -> `SUBMISSION.md` and fill in:
  - Setup instructions (docker compose + npm commands)
  - Architecture: 3 layers (Postgres: durable / Redis Streams: transient event log / SSE: delivery)
  - Why SSE over WebSockets: unidirectional; `Last-Event-ID` is a native HTTP spec feature
  - Why Redis Streams over DB polling: stream IDs embed timestamp+sequence; `XREAD BLOCK` avoids polling
  - Restart semantics: in-progress runs become FAILED; history preserved in `traceLog`
  - What I would add next: auth, tool-call event types, real LLM via a swappable generator interface
- Record 2-3 min demo video:
  - Send a message, watch tokens stream in
  - DevTools offline -> online -> seamless resume
  - Kill + restart server -> client shows failure state
- Confirm `git status` is clean: no `.env`, no secrets, no junk files
- Push and submit
