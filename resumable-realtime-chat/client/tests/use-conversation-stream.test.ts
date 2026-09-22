import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConversationStream } from '../src/lib/use-conversation-stream';

// Phase 9 client contract tests: Last-Event-ID on reconnect, event-ID dedup,
// bounded retries, and abort-on-unmount — all with fake timers (no real waits).
function sseResponse(frames: string, status = 200) {
    return new Response(frames, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

const frame = (id: string, data: string) => `id: ${id}\ndata: ${data}\n\n`;
const chunk = (id: string, position: number, text: string) =>
    frame(id, JSON.stringify({ type: 'text_chunk', position, text }));
const completed = (id: string, position: number) =>
    frame(id, JSON.stringify({ type: 'completed', position }));

async function startStream(result: { current: ReturnType<typeof useConversationStream> }) {
    await act(async () => {
        result.current.startStream('conv1', 'run1');
    });
}

describe('useConversationStream (reconnect + dedup contract)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('reconnects with Last-Event-ID and resumes without gaps or duplicates (AC2/AC3)', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(sseResponse(chunk('1-0', 0, 'Hello ') + chunk('1-1', 1, 'stream')))
            .mockResolvedValueOnce(sseResponse(chunk('1-2', 2, '!') + completed('1-3', 3)));
        vi.stubGlobal('fetch', fetchMock);

        const { result } = renderHook(() => useConversationStream());
        await startStream(result);

        // The mid-stream drop (no terminal event) flipped the state to reconnecting
        expect(result.current.status).toBe('reconnecting');
        expect(result.current.reconnectAttempt).toBe(1);
        expect(result.current.text).toBe('Hello stream');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
        });

        const [url, init] = fetchMock.mock.calls[1];
        expect((init as RequestInit).headers).toMatchObject({ 'Last-Event-ID': '1-1' });
        expect(url as string).toContain('?cursor=1-1');

        expect(result.current.status).toBe('completed');
        expect(result.current.text).toBe('Hello stream!');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('renders a duplicate event id at most once (dedup test)', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(sseResponse(chunk('1-0', 0, 'a')))
            .mockResolvedValueOnce(
                sseResponse(chunk('1-0', 0, 'a') + chunk('1-1', 1, 'b') + completed('1-2', 2))
            );
        vi.stubGlobal('fetch', fetchMock);

        const { result } = renderHook(() => useConversationStream());
        await startStream(result);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
        });

        expect(result.current.text).toBe('ab');
        expect(result.current.status).toBe('completed');
    });

    it('fails after the bounded retry attempts without real waits', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        vi.stubGlobal('fetch', fetchMock);

        const { result } = renderHook(() => useConversationStream());
        await startStream(result);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(500);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });

        expect(fetchMock).toHaveBeenCalledTimes(4); // initial + 3 bounded retries
        expect(result.current.status).toBe('failed');
        expect(result.current.error).toMatch(/3 reconnection attempts/);
    });

    it('does not retry an explicit 400 INVALID_CURSOR response', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({ error: 'INVALID_CURSOR', message: 'Last-Event-ID must match Redis stream format' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
        );
        vi.stubGlobal('fetch', fetchMock);

        const { result } = renderHook(() => useConversationStream());
        await startStream(result);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.current.status).toBe('failed');
        expect(result.current.error).toMatch(/Redis stream format/);
    });

    it('aborts the in-flight request on unmount', async () => {
        const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(() => {}));
        vi.stubGlobal('fetch', fetchMock);

        const { result, unmount } = renderHook(() => useConversationStream());
        await startStream(result);

        const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal;
        expect(signal?.aborted).toBe(false);

        unmount();
        expect(signal?.aborted).toBe(true);
    });
});
