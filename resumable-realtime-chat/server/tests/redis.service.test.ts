import { describe, it, expect, vi } from 'vitest';

// Regression test: a BLOCKING XREAD parks its connection, so the runner's
// XADDs must never share it — otherwise chunks arrive in delayed bursts.
vi.mock('ioredis', () => {
    class MockRedis {
        xadd = vi.fn();
        xread = vi.fn();
        expire = vi.fn();
        on = vi.fn();
        duplicate = vi.fn(() => new MockRedis());
        pipeline = vi.fn(() => ({
            xadd: vi.fn().mockReturnThis(),
            expire: vi.fn().mockReturnThis(),
            exec: vi.fn()
        }));
    }
    return { Redis: MockRedis };
});

import { RedisService } from '../src/services/redis.service.js';

function connectionsOf(service: RedisService) {
    const svc = service as unknown as {
        client: { xadd: ReturnType<typeof vi.fn>; xread: ReturnType<typeof vi.fn>; pipeline: ReturnType<typeof vi.fn>; duplicate: ReturnType<typeof vi.fn> };
        blockingClient: { xread: ReturnType<typeof vi.fn> };
    };
    return svc;
}

describe('RedisService', () => {
    it('uses a dedicated duplicate connection for blocking reads', () => {
        const service = new RedisService();
        const { client, blockingClient } = connectionsOf(service);

        expect(blockingClient).toBeDefined();
        expect(blockingClient).not.toBe(client);
        expect(client.duplicate).toHaveBeenCalled();
    });

    it('appends an event with XADD and refreshes the TTL in one pipeline', async () => {
        const service = new RedisService();
        const { client } = connectionsOf(service);

        const pipeline = {
            xadd: vi.fn().mockReturnThis(),
            expire: vi.fn().mockReturnThis(),
            exec: vi.fn().mockResolvedValue([[null, '1726-0'], [null, 1]])
        };
        client.pipeline.mockReturnValue(pipeline);

        const event = { type: 'completed', position: 0 };
        const id = await service.emitEvent('run1', event);

        expect(id).toBe('1726-0');
        expect(pipeline.xadd).toHaveBeenCalledWith('conv:events:run1', '*', 'event', JSON.stringify(event));
        expect(pipeline.expire).toHaveBeenCalledWith('conv:events:run1', expect.any(Number));
    });

    it('propagates XADD failures instead of returning a missing cursor', async () => {
        const service = new RedisService();
        const { client } = connectionsOf(service);

        const pipeline = {
            xadd: vi.fn().mockReturnThis(),
            expire: vi.fn().mockReturnThis(),
            exec: vi.fn().mockResolvedValue([[new Error('write failed'), null]])
        };
        client.pipeline.mockReturnValue(pipeline);

        await expect(service.emitEvent('run1', { type: 'completed', position: 0 }))
            .rejects.toThrow(/write failed/);
    });

    it('reads with BLOCK on the blocking connection, and without BLOCK on the main connection', async () => {
        const service = new RedisService();
        const { client, blockingClient } = connectionsOf(service);
        client.xread.mockResolvedValue(null);
        (blockingClient as unknown as { xread: ReturnType<typeof vi.fn> }).xread.mockResolvedValue(null);

        await service.readEvents('run1', '5-0', 2000);
        expect((blockingClient as unknown as { xread: ReturnType<typeof vi.fn> }).xread)
            .toHaveBeenCalledWith('BLOCK', 2000, 'STREAMS', 'conv:events:run1', '5-0');
        expect(client.xread).not.toHaveBeenCalled();

        await service.readEvents('run1', '5-0', 0);
        expect(client.xread).toHaveBeenCalledWith('STREAMS', 'conv:events:run1', '5-0');
    });

    it('parses stream entries and skips malformed ones', async () => {
        const service = new RedisService();
        const { blockingClient } = connectionsOf(service);
        const event = { type: 'text_chunk', position: 3, text: 'hi' };

        (blockingClient as unknown as { xread: ReturnType<typeof vi.fn> }).xread.mockResolvedValue([
            ['conv:events:run1', [
                ['1-0', ['event', JSON.stringify(event)]],
                ['1-1', ['otherfield', 'not an event']]
            ]]
        ]);

        const entries = await service.readEvents('run1', '0-0', 2000);
        expect(entries).toEqual([{ id: '1-0', event }]);
    });

    it('returns [] when there are no events after the cursor', async () => {
        const service = new RedisService();
        const { blockingClient } = connectionsOf(service);
        (blockingClient as unknown as { xread: ReturnType<typeof vi.fn> }).xread.mockResolvedValue(null);
        expect(await service.readEvents('run1', '9-9', 2000)).toEqual([]);
    });

    it('appendEvents rewrites each durable event back into the stream', async () => {
        const service = new RedisService();
        const { client } = connectionsOf(service);

        const pipeline = {
            xadd: vi.fn().mockReturnThis(),
            expire: vi.fn().mockReturnThis(),
            exec: vi.fn()
                .mockResolvedValueOnce([[null, '100-0'], [null, 1]])
                .mockResolvedValueOnce([[null, '101-0'], [null, 1]])
        };
        client.pipeline.mockReturnValue(pipeline);

        await service.appendEvents('run1', [
            { type: 'text_chunk', position: 0, text: 'a' },
            { type: 'completed', position: 1 }
        ]);

        expect(pipeline.xadd).toHaveBeenCalledTimes(2);
        expect(pipeline.xadd).toHaveBeenNthCalledWith(
            1, 'conv:events:run1', '*', 'event', JSON.stringify({ type: 'text_chunk', position: 0, text: 'a' })
        );
    });
});