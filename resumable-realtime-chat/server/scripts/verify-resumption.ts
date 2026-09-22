// Verification benchmark (Problem 1): interrupt an SSE stream mid-generation, reconnect from
// the Last-Event-ID cursor, and assert zero missing / zero duplicate events.
// Prereqs: docker compose up -d, server on GENERATOR=fake. Run: npm run benchmark.

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const EXPECTED_CHUNK_COUNT = 35; // default FAKE_GENERATOR_CHUNKS
const INTERRUPT_AFTER_EVENTS = 12;

interface StreamEvent {
    id: string;
    type: string;
    position?: number;
    text?: string;
    message?: string;
}

async function createConversation(): Promise<string> {
    const res = await fetch(`${API_BASE_URL}/conversations`, { method: 'POST' });
    if (!res.ok) throw new Error(`Failed to create conversation: HTTP ${res.status}`);
    const { id } = await res.json();
    return id;
}

async function startRun(conversationId: string): Promise<string> {
    const res = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Benchmark: stream the deterministic reply.' })
    });
    if (!res.ok) throw new Error(`Failed to start run: HTTP ${res.status}`);
    const { runId } = await res.json();
    return runId;
}

// Consumes an SSE stream, collecting events. Aborts mid-stream once
// `stopAfter` data events have been received (the "connection drop").
async function consumeStream(
    conversationId: string,
    runId: string,
    options: { lastEventId?: string; stopAfter?: number } = {}
): Promise<{ events: StreamEvent[]; lastEventId: string | null; interrupted: boolean }> {
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (options.lastEventId) headers['Last-Event-ID'] = options.lastEventId;

    const controller = new AbortController();
    const res = await fetch(
        `${API_BASE_URL}/conversations/${conversationId}/runs/${runId}/stream`,
        { headers, signal: controller.signal }
    );
    if (!res.ok || !res.body) throw new Error(`Stream request failed: HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const events: StreamEvent[] = [];
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let boundary: number;
            while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                const frame = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                if (frame.startsWith(':')) continue; // heartbeat

                const id = frame.match(/^id: (.+)$/m)?.[1] ?? '';
                const data = frame.match(/^data: (.+)$/m)?.[1];
                if (!data) continue;
                events.push({ id, ...JSON.parse(data) });

                // Simulated interruption: drop the connection mid-generation
                if (options.stopAfter && events.length >= options.stopAfter) {
                    controller.abort();
                    return { events, lastEventId: events.at(-1)!.id, interrupted: true };
                }
            }
        }
    } catch (err) {
        if ((err as Error).name !== 'AbortError') throw err;
    }

    return { events, lastEventId: events.at(-1)?.id ?? null, interrupted: false };
}

async function fetchFinalRunState(conversationId: string): Promise<string | undefined> {
    // The runner emits the terminal event to Redis before persisting the run's
    // terminal state, so the database can lag the event stream by a few
    // milliseconds. Poll briefly until the durable state catches up.
    for (let attempt = 0; attempt < 10; attempt++) {
        const res = await fetch(`${API_BASE_URL}/conversations/${conversationId}`);
        if (!res.ok) return undefined;
        const conversation = await res.json();
        const status: string | undefined = conversation.messages?.at(-1)?.runs?.[0]?.status;
        if (status === 'COMPLETED' || status === 'FAILED') return status;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return 'still RUNNING after 2s';
}

async function main(): Promise<void> {
    console.log(`[benchmark] target: ${API_BASE_URL}`);
    console.log(`[benchmark] expecting ${EXPECTED_CHUNK_COUNT} ordered events for one run`);

    const conversationId = await createConversation();
    const runId = await startRun(conversationId);
    console.log(`[benchmark] conversation=${conversationId} run=${runId}`);

    // Phase 1: connect, receive events, then drop the connection mid-generation
    const phase1 = await consumeStream(conversationId, runId, { stopAfter: INTERRUPT_AFTER_EVENTS });
    if (!phase1.interrupted) {
        throw new Error('Stream finished before the interruption point — run completed too fast (check FAKE_GENERATOR_DELAY_MS)');
    }
    console.log(`[benchmark] interrupted after ${phase1.events.length} events (cursor=${phase1.lastEventId})`);

    // Small delay so generation continues while the client is offline —
    // this is what forces the replay/live overlap on reconnect.
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Phase 2: reconnect with the Last-Event-ID cursor and drain to the end
    const phase2 = await consumeStream(conversationId, runId, { lastEventId: phase1.lastEventId! });
    console.log(`[benchmark] reconnected from cursor, received ${phase2.events.length} more events`);

    // Reconstruct the reply across both phases.
    const all = [...phase1.events, ...phase2.events];

    const uniqueIds = new Set(all.map((e) => e.id));
    const duplicates = all.length - uniqueIds.size;

    const chunks = all.filter((e) => e.type === 'text_chunk');
    const positions = chunks.map((e) => e.position!);
    const uniquePositions = new Set(positions);
    const missing: number[] = [];
    for (let i = 0; i < EXPECTED_CHUNK_COUNT; i++) {
        if (!uniquePositions.has(i)) missing.push(i);
    }

    const assembled = [...chunks]
        .sort((a, b) => a.position! - b.position!)
        .map((e) => e.text)
        .join('');
    const expectedText = Array.from(
        { length: EXPECTED_CHUNK_COUNT },
        (_, i) => `chunk_${i} `
    ).join('');

    const terminalEvent = all.find((e) => e.type === 'completed' || e.type === 'failed');
    const finalRunState = await fetchFinalRunState(conversationId);

    console.log('');
    console.log(`[benchmark] total events received : ${all.length} (unique ids: ${uniqueIds.size})`);
    console.log(`[benchmark] text chunks          : ${chunks.length}/${EXPECTED_CHUNK_COUNT}`);
    console.log(`[benchmark] duplicate events      : ${duplicates}`);
    console.log(`[benchmark] missing events        : ${missing.length}${missing.length ? ` (${missing.join(', ')})` : ''}`);
    console.log(`[benchmark] text matches expected : ${assembled === expectedText}`);
    console.log(`[benchmark] terminal event        : ${terminalEvent?.type ?? 'none'}`);
    console.log(`[benchmark] final run state (db)  : ${finalRunState ?? 'unknown'}`);
    console.log('');

    const pass =
        duplicates === 0 &&
        missing.length === 0 &&
        chunks.length === EXPECTED_CHUNK_COUNT &&
        assembled === expectedText &&
        terminalEvent?.type === 'completed' &&
        finalRunState === 'COMPLETED';

    console.log(pass ? 'PASS — zero missing, zero duplicate events; run completed.' : 'FAIL');
    process.exit(pass ? 0 : 1);
}

main().catch((err) => {
    console.error('[benchmark] FAILED:', err.message);
    process.exit(1);
});