import { describe, it, expect } from 'vitest';
import { streamReducer, initialStreamState } from '../src/lib/stream.reducer';

const CHUNK_0 = { type: 'CHUNK_RECEIVED', id: '1-0', position: 0, text: 'Hello ' } as const;
const CHUNK_1 = { type: 'CHUNK_RECEIVED', id: '1-1', position: 1, text: 'world' } as const;

describe('streamReducer (client state machine + position-keyed dedup)', () => {
    it('resets to connected with the run id on CONNECT_START', () => {
        const state = streamReducer(initialStreamState, { type: 'CONNECT_START', runId: 'run1' });

        expect(state.status).toBe('connected');
        expect(state.runId).toBe('run1');
        expect(state.text).toBe('');
    });

    it('appends sequential chunks in arrival order (AC1)', () => {
        let state = streamReducer(initialStreamState, { type: 'CONNECT_START', runId: 'run1' });
        state = streamReducer(state, CHUNK_0);
        state = streamReducer(state, CHUNK_1);

        expect(state.text).toBe('Hello world');
        expect(state.lastEventId).toBe('1-1');
    });

    it('rebuilds position-ordered text when a replayed gap-fill arrives out of order (AC3)', () => {
        let state = streamReducer(initialStreamState, { type: 'CONNECT_START', runId: 'run1' });
        state = streamReducer(state, CHUNK_0);
        // Overlap replay delivers position 2 before position 1 — keep it, order it later.
        state = streamReducer(state, { type: 'CHUNK_RECEIVED', id: '1-2', position: 2, text: '!' });
        state = streamReducer(state, CHUNK_1);

        expect(state.text).toBe('Hello world!');
    });

    it('ignores a duplicate chunk at the same position (dedup)', () => {
        let state = streamReducer(initialStreamState, { type: 'CONNECT_START', runId: 'run1' });
        state = streamReducer(state, CHUNK_0);
        state = streamReducer(state, CHUNK_0); // replayed duplicate

        expect(state.text).toBe('Hello ');
        expect(state.lastEventId).toBe('1-0');
    });

    it('reaches completed and failed terminal states', () => {
        let state = streamReducer(initialStreamState, { type: 'CONNECT_START', runId: 'run1' });

        state = streamReducer(state, { type: 'STREAM_COMPLETED', id: '2-0' });
        expect(state.status).toBe('completed');

        state = streamReducer(state, { type: 'STREAM_FAILED', error: 'boom' });
        expect(state.status).toBe('failed');
        expect(state.error).toBe('boom');
    });

    it('tracks the reconnect attempt counter and recovers on the next chunk', () => {
        let state = streamReducer(initialStreamState, { type: 'CONNECT_START', runId: 'run1' });

        state = streamReducer(state, { type: 'RECONNECT_ATTEMPT', attempt: 1 });
        expect(state.status).toBe('reconnecting');
        expect(state.reconnectAttempt).toBe(1);

        state = streamReducer(state, CHUNK_0);
        expect(state.status).toBe('connected');
        expect(state.reconnectAttempt).toBe(0);
    });
});
