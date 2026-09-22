import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/redis.service.js', () => ({
    redisService: {
        readEvents: vi.fn(),
        appendEvents: vi.fn()
    }
}));
vi.mock('../src/services/conversation.service.js', () => ({
    conversationService: {
        getRunById: vi.fn()
    }
}));

import { streamService } from '../src/services/stream.service.js';
import { redisService } from '../src/services/redis.service.js';
import { conversationService } from '../src/services/conversation.service.js';
import type { Response } from 'express';
import type { StreamEntry } from '../src/services/redis.service.js';

// Protocol-level tests for the SSE delivery loop: ordered delivery (AC1),
// replay after a cursor (AC2), replay/live overlap without duplication
// (AC3), and rehydration of an expired stream from the durable history (AC4).
describe('StreamService.streamRunToClient', () => {
    function createFakeRes() {
        const frames: string[] = [];
        return {
            frames,
            res: {
                setHeader: vi.fn(),
                flushHeaders: vi.fn(),
                write: vi.fn((chunk: string) => {
                    frames.push(chunk);
                    return true;
                }),
                end: vi.fn()
            } as unknown as Response
        };
    }

    function parseFrames(frames: string[]) {
        return frames
            .filter((f) => !f.startsWith(':'))
            .map((frame) => {
                const id = frame.match(/^id: (.+)$/m)?.[1] ?? null;
                const data = frame.match(/^data: (.+)$/m)?.[1] ?? 'null';
                return { id, event: JSON.parse(data) };
            });
    }

    const chunk = (position: number, id: string): StreamEntry => ({
        id,
        event: { type: 'text_chunk', position, text: `chunk_${position} ` }
    });
    const terminal = (id: string, position = 3): StreamEntry => ({
        id,
        event: { type: 'completed', position }
    });

    beforeEach(() => {
        vi.mocked(redisService.readEvents).mockReset();
        vi.mocked(redisService.appendEvents).mockReset();
        vi.mocked(conversationService.getRunById).mockReset();
    });

    it('delivers live events in server-defined order and closes on the terminal event (AC1)', async () => {
        const { res, frames } = createFakeRes();
        vi.mocked(redisService.readEvents)
            .mockResolvedValueOnce([]) // replay: nothing yet
            .mockResolvedValueOnce([chunk(0, '1-0'), chunk(1, '1-1')]) // live batch 1
            .mockResolvedValueOnce([chunk(2, '1-2'), terminal('1-3')]); // live batch 2 + terminal

        await streamService.streamRunToClient('run1', '0-0', res, () => true);

        const events = parseFrames(frames);
        expect(events.map((e) => e.event.type)).toEqual(['text_chunk', 'text_chunk', 'text_chunk', 'completed']);
        expect(events.map((e) => e.event.position)).toEqual([0, 1, 2, 3]);
        expect(events.map((e) => e.id)).toEqual(['1-0', '1-1', '1-2', '1-3']);
        expect(vi.mocked(res.end)).toHaveBeenCalledTimes(1);
        // A live run must never be "rehydrated" from the database
        expect(redisService.appendEvents).not.toHaveBeenCalled();
    });

    it('replays events after the cursor first, then continues live (AC2)', async () => {
        const { res, frames } = createFakeRes();
        vi.mocked(redisService.readEvents)
            .mockResolvedValueOnce([chunk(1, '1-1'), chunk(2, '1-2')]) // replay after cursor 1-0
            .mockResolvedValueOnce([terminal('1-3')]); // live

        await streamService.streamRunToClient('run1', '1-0', res, () => true);

        // The first read must use the client-provided cursor — not 0-0
        expect(redisService.readEvents).toHaveBeenNthCalledWith(1, 'run1', '1-0', 0);

        const events = parseFrames(frames);
        expect(events.map((e) => e.event.position)).toEqual([1, 2, 3]);
        expect(events.map((e) => e.id)).toEqual(['1-1', '1-2', '1-3']);
        expect(vi.mocked(res.end)).toHaveBeenCalledTimes(1);
    });

    it('merges overlapping replay and live delivery into one ordered sequence without duplicates (AC3)', async () => {
        const { res, frames } = createFakeRes();
        // Client reconnects at cursor 1-2 while the run is still producing:
        // replay returns 3..4 (produced while offline), live returns 5..6.
        vi.mocked(redisService.readEvents)
            .mockResolvedValueOnce([chunk(3, '1-3'), chunk(4, '1-4')])
            .mockResolvedValueOnce([chunk(5, '1-5'), chunk(6, '1-6'), terminal('1-7', 7)]);

        await streamService.streamRunToClient('run1', '1-2', res, () => true);

        const events = parseFrames(frames);
        expect(events.map((e) => e.event.position)).toEqual([3, 4, 5, 6, 7]);
        expect(events.map((e) => e.id)).toEqual(['1-3', '1-4', '1-5', '1-6', '1-7']);

        const ids = events.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length); // no duplicate logical events
    });

    it('rehydrates an expired Redis stream from the durable traceLog for a terminal run (AC4 / Redis TTL)', async () => {
        const { res, frames } = createFakeRes();
        const history = [
            { type: 'text_chunk', position: 0, text: 'chunk_0 ' },
            { type: 'completed', position: 1 }
        ];
        vi.mocked(conversationService.getRunById).mockResolvedValue({
            id: 'run1', status: 'COMPLETED', traceLog: history
        } as never);
        vi.mocked(redisService.readEvents)
            .mockResolvedValueOnce([]) // Redis stream expired
            .mockResolvedValueOnce([
                { id: '10-0', event: history[0] },
                { id: '10-1', event: history[1] }
            ]);

        await streamService.streamRunToClient('run1', '0-0', res, () => true);

        expect(redisService.appendEvents).toHaveBeenCalledWith('run1', history);
        const events = parseFrames(frames);
        expect(events.map((e) => e.event.type)).toEqual(['text_chunk', 'completed']);
        expect(events.map((e) => e.id)).toEqual(['10-0', '10-1']);
        expect(vi.mocked(res.end)).toHaveBeenCalledTimes(1);
    });

    it('rehydrates an expired stream for a FAILED run and closes on its failed event', async () => {
        const { res, frames } = createFakeRes();
        const history = [
            { type: 'text_chunk', position: 0, text: 'chunk_0 ' },
            { type: 'failed', message: 'provider exploded' }
        ];
        vi.mocked(conversationService.getRunById).mockResolvedValue({
            id: 'run1', status: 'FAILED', traceLog: history
        } as never);
        vi.mocked(redisService.readEvents)
            .mockResolvedValueOnce([]) // Redis stream expired
            .mockResolvedValueOnce([
                { id: '10-0', event: history[0] },
                { id: '10-1', event: history[1] }
            ]);

        await streamService.streamRunToClient('run1', '0-0', res, () => true);

        expect(redisService.appendEvents).toHaveBeenCalledWith('run1', history);
        const events = parseFrames(frames);
        expect(events.map((e) => e.event.type)).toEqual(['text_chunk', 'failed']);
        expect(vi.mocked(res.end)).toHaveBeenCalledTimes(1);
    });

    it('heartbeats while idle and drains + closes once the run is terminal in the database', async () => {
        const { res, frames } = createFakeRes();
        vi.mocked(redisService.readEvents)
            .mockResolvedValueOnce([]) // initial replay
            .mockResolvedValueOnce([]) // BLOCK window times out
            .mockResolvedValueOnce([terminal('2-9')]); // trailing drain
        vi.mocked(conversationService.getRunById).mockResolvedValue({
            id: 'run1', status: 'COMPLETED'
        } as never);

        await streamService.streamRunToClient('run1', '0-0', res, () => true);

        expect(frames).toContain(': heartbeat\n\n');
        const events = parseFrames(frames);
        expect(events.at(-1)?.event.type).toBe('completed');
        expect(vi.mocked(res.end)).toHaveBeenCalledTimes(1);
    });

    it('stops delivering when the client disconnects mid-batch', async () => {
        const { res, frames } = createFakeRes();
        vi.mocked(redisService.readEvents).mockResolvedValue([chunk(0, '1-0'), chunk(1, '1-1')]);

        // Client is only "connected" until the first frame is written
        await streamService.streamRunToClient('run1', '0-0', res, () => frames.length === 0);

        expect(frames.length).toBe(1);
        expect(vi.mocked(res.end)).not.toHaveBeenCalled();
    });
});