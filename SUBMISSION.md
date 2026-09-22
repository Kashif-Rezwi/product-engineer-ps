# Product Engineering Challenge Submission

## Candidate

- **Name:** Kashif Rezwi
- **Email:** kashifrezwi850@gmail.com
- **GitHub:** https://kashif-rezwi.github.io/
- **Selected problem:** Problem 1: Resumable Realtime Conversation
- **Demo video:** https://drive.google.com/drive/folders/15OVsWNLlF_QAAIezfBftUnLwzccLNDMw?usp=sharing

## Run the project

Prerequisites: Node.js 20+, Docker (for PostgreSQL and Redis), optionally a
Groq API key — the app falls back to a deterministic fake generator without
one, so no credentials are required to run it.

```text
cd resumable-realtime-chat

# 1. Start PostgreSQL (port 5433) and Redis (port 6379)
docker compose up -d

# 2. Server
cd server
npm install
cp .env.example .env            # fill in GROQ_API_KEY (optional)
npx prisma migrate deploy       # apply the database schema
npm run dev                     # http://localhost:3001

# 3. Client (new terminal)
cd ../client
npm install
npm run dev                     # http://localhost:3000
```

Environment variables: `PORT`, `CLIENT_URL`, `DATABASE_URL`, `REDIS_URL`,
`GROQ_API_KEY` (optional), `GENERATOR` (`fake` forces the deterministic fake
generator), plus fake-generator tuning (`FAKE_GENERATOR_CHUNKS`,
`FAKE_GENERATOR_DELAY_MS`, `FAKE_GENERATOR_FAIL_AFTER`) and
`GENERATOR_IDLE_TIMEOUT_MS`. No secret values are committed; `.env` is
git-ignored and `.env.example` documents every variable.

**Successful scenario:** open the client, start a conversation, send a
message — the reply streams token-by-token and the connection badge shows
connected → completed.

**Failure / recovery scenarios (reproduce manually):**

- *Missed-event recovery (AC2/AC3):* while a reply is streaming, toggle
  DevTools → Network → Offline, then Online. The client reconnects with its
  `Last-Event-ID` cursor and continues exactly where it stopped — no repeated
  text, no gaps.
- *Generation failure (AC5):* run the server with
  `GENERATOR=fake FAKE_GENERATOR_FAIL_AFTER=12 npm run dev` and send a
  message. The run emits 12 chunks, then a `failed` event; the run is FAILED
  in the database with its partial history preserved and never later becomes
  completed.
- *Service restart (AC4):* kill the server mid-stream (`Ctrl+C`), restart it
  and reload the conversation. The interrupted run is reconciled to FAILED
  ("Run interrupted by server restart") and the persisted history is still
  visible.

## Run the tests

```text
# server — 45 deterministic tests: no paid model API, no long sleeps
cd server
npm test

# client — 17 deterministic tests: SSE parser, stream reducer, reconnect/dedup
cd client
npm test
```

The client suite covers the frontend contracts: SSE frames split across TCP
chunk boundaries parse identically, the reconnect request carries the
`Last-Event-ID` cursor, a duplicate event id renders at most once, retries are
bounded (3 attempts, fake timers — no real waits), and unmount aborts the
in-flight request.

The verification benchmark runs against the live stack with the fake
generator:

```text
# terminal 1
cd resumable-realtime-chat/server
GENERATOR=fake npm run dev

# terminal 2
cd resumable-realtime-chat/server
npm run benchmark
```

## Acceptance scenarios and verification

All six acceptance scenarios are implemented:

- **AC1 ordered live stream** — events are delivered in server-defined order
  (Redis stream entry IDs) and the stream closes on the terminal event.
- **AC2 missed-event recovery** — reconnects replay strictly after the
  client's cursor; the first `XREAD` uses the provided `Last-Event-ID`, never
  `0-0`.
- **AC3 replay/live overlap** — replay and live delivery are the same Redis
  stream, so they merge into one ordered sequence; the client deduplicates
  by stream ID and by chunk position.
- **AC4 service restart** — durable state (Postgres) survives restarts; runs
  left QUEUED/RUNNING by the previous process are explicitly reconciled to
  FAILED with a terminal `failed` event. The in-progress generator does not
  resume; that policy is documented here.
- **AC5 generation failure** — provider errors propagate to the runner, which
  marks the run FAILED, keeps the partial history inspectable, and the
  atomic status guard makes FAILED a terminal state (it can never later
  become completed).
- **AC6 unknown/stale cursor** — `Last-Event-ID` values that are not Redis
  stream entry IDs are rejected with an explicit `400 INVALID_CURSOR`; an
  expired stream (Redis 24h TTL) is transparently rebuilt from the durable
  history in Postgres.

**Verification benchmark** (steps under "Run the tests"). Observed result on
the submitted code:

```text
[benchmark] interrupted after 12 events (cursor=1790097985583-0)
[benchmark] reconnected from cursor, received 24 more events
[benchmark] total events received : 36 (unique ids: 36)
[benchmark] text chunks          : 35/35
[benchmark] duplicate events      : 0
[benchmark] missing events        : 0
[benchmark] text matches expected : true
[benchmark] terminal event        : completed
[benchmark] final run state (db)  : COMPLETED
PASS — zero missing, zero duplicate events; run completed.
```

One run produces 35 ordered text events (≥ the required 30), the stream is
interrupted once mid-generation and reconnects from the cursor, and the
reconstructed reply contains zero missing and zero duplicate events with the
run's final state COMPLETED.

The failure scenario demonstrated in the video is reproducible with the
`GENERATOR=fake FAKE_GENERATOR_FAIL_AFTER=12` server described above: 12
chunks stream, then the client visibly transitions to the failed state and
the run is FAILED in the database with its partial history preserved.

## Architecture and data flow

```text
+----------------------------------------------------------------------+
|  CLIENT  -  Next.js + React (http://localhost:3000)                  |
|                                                                      |
|  useConversationStream     SSE fetch; reconnects with Last-Event-ID  |
|         |                                                            |
|         v                                                            |
|  parseSSEStream            frame reassembly (any TCP split parses)   |
|         |                                                            |
|         v                                                            |
|  streamReducer             dedup by event id + chunk position        |
|         |                                                            |
|         v                                                            |
|  Zustand store             -> rendered conversation                  |
+-------+-----------------------------------------------------^--------+
        |                                                     |
        |                            SSE frames (id = cursor)
        | POST /conversations/:id/messages -> 201 { runId }   |
        | GET /conversations/:id/runs/:runId/stream           |
        |   (sends the Last-Event-ID header on reconnect)     |
        v                                                     |
+-------+-----------------------------------------------------+--------+
|  SERVER  -  Express + TypeScript (http://localhost:3001)             |
|                                                                      |
|  ConversationController                                              |
|    POST createMessage -> tx (UserMessage + Run QUEUED), fires runner |
|    GET  streamRun -> StreamService (SSE replay + live loop)          |
|                                                                      |
|  RunnerService (background) -> GeneratorFactory (Groq | Fake)        |
|  RecoveryService (startup: reconcile interrupted runs)               |
+-----------+---------------------------------+------------------------+
            |                                 |
            | writes: XADD + EXPIRE pipelined | status + traceLog
            | reads: XREAD BLOCK after the    | written at termination
            |   cursor (never 0-0)            | startup: recovery marks
            |                                 |  interrupted runs FAILED
            v                                 v
  +---------+------------------------+    +---+-----------------------+
  | REDIS  -  transient event log    |    | POSTGRES  -  durable state|
  | one stream per run:              |    | Conversation/UserMessage  |
  |   conv:events:{runId} (24h TTL)  |    | Run: status + traceLog    |
  | entry ID = SSE id = resume cursor|    | (survives restarts)       |
  +---^------------------------------+    +-------+-------------------+
      |                                           |
      |                                           |
      +--- rehydrated from Run.traceLog (AC6) ----+
```

Three layers with distinct responsibilities:

- **PostgreSQL (durable):** `Conversation`, `UserMessage`, `Run`. The run owns
  its status (QUEUED/RUNNING/COMPLETED/FAILED) and its `traceLog` — the
  ordered event history persisted on termination. This is what survives
  restarts and Redis expiry.
- **Redis Streams (transient delivery log):** one stream per run
  (`conv:events:{runId}`). The runner appends every event; SSE connections
  read from the client's cursor. Stream entry IDs double as SSE `id:` values
  and resume cursors. A 24h TTL bounds storage.
- **SSE delivery:** replay and live events are the same stream, so a
  reconnecting client simply continues reading after its cursor — one
  ordered sequence, no separate replay protocol.

### Event flow: live delivery and resumption

How the pieces interact for one message — the same interrupt + reconnect
the verification benchmark automates (AC2 / AC3 overlap dedup included):

```text
  Client              Server (SSE loop)      Redis (conv:events:{runId})     RunnerService
    |                         |                           |                       |
    |----(1) POST message----->                           |                       |
    <------201 { runId }------|                           |                       |
    |                         |-----------(2) fire runner (background)------------>
    |                         |                           <---XADD chunk_0 ...----|
    |---(3) GET .../stream---->                           |                       |
    |                         |------XREAD after 0-0------>                       |
    <------------------id:...-0 (replay)------------------|                       |
    |                         |-----XREAD BLOCK loop------>                       |
    <------------------id:...-11 (live)-------------------|                       |
    X connection drops        |                           <---XADD chunk_12 ...---|
    |---(4) GET .../stream---->                           |                       |
    | Last-Event-ID: ...-11   |                           |                       |
    |                         |----XREAD after ...-11----->                       |
    <---------------id:...-12..18 (replay)----------------|                       |
    <----------------id:...-19..34 (live)-----------------|                       |
    <----------------id:...-34: completed-----------------|                       |
    |                         |(5) terminal: stream closes|                       |
    |                         |                           |                       |

  (1) POST creates the message + run (QUEUED) in Postgres; 201 returns runId
  (2) the runner is fired in the background - generation starts immediately
  (3) replay XREAD after 0-0, then the live XREAD BLOCK loop streams frames
      until the connection drops mid-stream
  (4) reconnect: cursor validated (unknown -> 400, AC6); XREAD strictly after
      the cursor, never 0-0 (AC2); overlap deduped by event id + position (AC3)
  (5) the completed event closes the stream; the run becomes COMPLETED and
      traceLog is persisted to Postgres
```

Services: `conversation.service` (durable state + atomic status guards),
`runner.service` (generation orchestration, idle timeout, traceLog
collection), `redis.service` (event log; dedicated connection for blocking
reads), `stream.service` (SSE loop, expired-stream rehydration, heartbeats),
`recovery.service` (startup reconciliation), and `groq.service` /
`fake-generator.service` behind a small generator factory.

### Run lifecycle and failure states

Every status change is a single atomic guarded UPDATE — the property that
makes failure handling race-free:

```text
 createMessage() - transactional: UserMessage + Run
                          |
                          v
                    +----------+
                    |  QUEUED  |
                    +-----+----+
                          | RunnerService.executeRun -
                          | guard: UPDATE ... SET status='RUNNING' WHERE status='QUEUED'
                          | (rows = 0 -> lost the race -> exit)
                          v
                    +----------+
                    |  RUNNING |
                    +-----+----+
          +---------------+-----------------+
          | last chunk appended:            | generator error / idle timeout
          | XADD completed                  | startup recovery: RUNNING -> FAILED
          |                                 | (interrupted runs: partial history kept)
          v                                 v
    +-----------+                      +---------+
    | COMPLETED |                      |  FAILED | XADD failed (terminal event);
    +-----------+                      +---------+ traceLog keeps the partial history

  FAILED is forever - every transition is a single atomic
  UPDATE ... WHERE status = 'QUEUED' / 'RUNNING', so COMPLETED and
  FAILED rows can never change again: a failed run can never
  later appear completed (AC4 / AC5).
```

## Technology choices

- **SSE over WebSockets:** replies are unidirectional server→client, SSE
  rides plain HTTP, and the spec's `Last-Event-ID` header maps directly onto
  Redis stream entry IDs. WebSockets would add a second protocol for no
  required capability.
- **Redis Streams over DB polling:** `XREAD BLOCK` wakes the connection the
  instant an event is appended — no polling loop — and entry IDs embed
  ordering. Blocking reads use a **dedicated connection** because a blocking
  command parks its connection server-side; sharing one connection made the
  runner's writes queue behind reads, stalling delivery in 2-second bursts
  (fixed and covered by a regression test).
- **Postgres/Prisma:** transactional message+run creation and a durable
  JSONB traceLog — simple, inspectable, survives restarts.
- **Groq (optional):** a real model integration is optional per the brief;
  the server falls back to the deterministic fake generator when no key is
  configured, so every required behaviour is demonstrable offline.

## Important decisions

1. **The cursor is the delivery log position.** An event is a position-tagged
   text chunk (or a terminal marker); the cursor is the Redis stream entry ID
   of the last event seen. Redis owns ordering — the client never reorders;
   it deduplicates (by stream ID and by chunk position) and renders.
2. **Failed is forever.** Status transitions are single atomic
   `UPDATE ... WHERE status = ...` guards (QUEUED→RUNNING→COMPLETED, or
   →FAILED). A failed run can never later be marked completed — the core
   correctness property of AC5.
3. **One event log, not two protocols.** Replay-after-cursor and live
   delivery share one Redis read path; when a stream expires, it is
   rehydrated from the durable traceLog rather than maintaining a second
   replay format with synthetic cursor IDs.

## Assumptions and limitations

- No auth, multi-tenancy, cancellation, or message editing (explicitly out of
  scope in the brief).
- One active run per user message; the UI blocks a second run on the same
  message.
- The in-progress generator does **not** resume after a server restart;
  interrupted runs become FAILED — an explicit, documented policy; the
  durable history remains correct and inspectable.
- The DB run status is written immediately after the terminal event is
  appended, so the database can lag the event stream by milliseconds (the
  benchmark polls briefly for the terminal state).
- Message content is validated for presence/emptiness only; no length cap.
- Reconnect attempts are client-side, delayed (500ms/1s/2s) and bounded
  (3 attempts → explicit failed state).

## Production and scale

What the submitted code does today vs. what I would change first in
production:

- **History retention:** today the traceLog is a JSONB column on the run and
  Redis streams expire after 24h. In production I would move the traceLog to
  an append-only per-event table so history can be paginated, truncated by
  retention policy, and replayed without loading an entire run.
- **Run execution:** runs execute inside the API process today. At scale I
  would move generation to a separate worker consuming a queue, so API
  deploys never kill in-flight runs, and restart recovery would become
  claim-based rather than startup-based.
- **Ordering:** Redis is already the single sequencer, so API servers are
  stateless and could scale horizontally behind a load balancer today; what
  is missing is per-run connection routing if strict per-run ordering under
  concurrent writers ever mattered.
- **Client cursor older than retained history:** the server rehydrates from
  the durable log; if even that had expired, the correct response is an
  explicit "history unavailable — refetch the conversation" outcome, which
  the existing `400 INVALID_CURSOR` contract already models.

## AI usage

**Tools:** Cline (AI coding agent in VS Code) — the early phases ran with
GLM 5.3, the later review/test/documentation phases with Kimi K3. AI was used
as a collaborator, not an autopilot: I kept plan approval, final decisions,
manual testing, and every git commit in my own hands.

**How it contributed.** I started by brainstorming the assignment with Cline
and splitting the work into ten phases, each executed as a separate task with
the same loop: plan together → I review and approve the plan → AI implements
in act mode → I manually review and run the app myself before moving on, so I
always understood what was being built and could keep us heading in the
intended direction. Phases 1–6 built the server features one at a time.
Phase 7 built the frontend: I brainstormed the design using the Caygnus
landing page as the reference for style, color, and typography, planned a
deliberately restrained UI with the few subtle polish details I add to all my
projects, then had it implemented. Phase 8 was a thorough review, refactor and
a final touch-up of the frontend and backend, one after another. Phase 9
designed and built the test suites and the verification benchmark from the
acceptance requirements. Phase 10 produced this document, including the 
architecture diagrams.

**How I reviewed and tested the output.** Beyond my manual review and testing
after every phase, the phase-8 server review is a good example of the
workflow working as intended: it surfaced real defects — a shared Redis
connection serializing writes behind blocking reads (first token 4.1s →
710ms after the fix; root cause proven with a controlled ioredis experiment,
not speculation), swallowed provider errors, and a generator with no idle
bound. Every change was validated by running, not reading: 45/45 server
tests, 17/17 client tests, the verification benchmark (35/35 chunks, 0
missing, 0 duplicates), and live failure scenarios — reconnect replay,
provider failure, service restart, stale cursor — against the running stack.

## Credibility note

**Product:** the Workflow Builder in [Swipe Pages](https://swipepages.com/),
a production no-code landing-page and automation SaaS I worked on at Brand
Exponents Creatives (Oct 2023 – Aug 2025).

**Problem it solved.** Swipe Pages lets non-technical marketers build landing
pages and route form submissions into their marketing stack. The Workflow
Builder automates that: a form-submission trigger flows into actions such as
webhooks and third-party integrations (CRMs, email tools). When I took on
this area, the integration layer had duplicated logic across provider flows,
tightly coupled components, and no repeatable implementation path — every new
integration re-solved the same configuration, property-selection, and
field-mapping problems, which slowed catalog growth and made behavior
inconsistent.

**My contribution.** I refactored and extended the integration layer so
shared configuration, readable-property selection, field-mapping conversion,
and automatic matching became the common implementation path across provider
flows — including SendFox, ActiveCampaign, AWeber, Moosend, Salesflare, and
EngageBay. A central option-component registry and a validated node catalog
became the single extension point, while genuinely provider-specific behavior
(accounts, lists/tags/forms, authentication) stayed isolated and explicit. I
also contributed backend behavior for workflow creation, integration
handling, and field auto-generation, and handled failure states deliberately:
deleted or reconnected accounts, missing required mappings, external fields
that no longer exist, loading failures, and unsaved changes.

**Scale / operational complexity.** Configured workflows execute
asynchronously through background jobs, message queues, consumers, and
webhooks, so mapping decisions had to persist stable technical references the
runtime could rely on long after the UI session ended — this taught me to
treat configuration as a contract between a UI and an async executor. The
company's AppSumo launch onboarded roughly 4,000–5,000 users (approximate),
and in an ~18–20-person team developers handled user-reported issues and
urgent hotfixes directly, so production debugging and safe incremental fixes
were part of the job, not an afterthought.

**Difficult engineering decision.** Where to draw the abstraction boundary. I
could keep shipping one-off integrations quickly, or pause feature delivery
to make selection, mapping, and validation reusable first — while avoiding
over-abstraction that would make provider-specific cases painful. I chose a
reuse-first refactor with an explicit boundary: everything generic became
shared; genuine provider differences stayed explicit. Subsequent integrations
followed one predictable path instead of rediscovering scattered patterns,
and fixes to common behavior applied consistently.

**Evidence.** Public product: [swipepages.com](https://swipepages.com/).
Personal shipping evidence (public repositories):
[github.com/Kashif-Rezwi](https://github.com/Kashif-Rezwi).
