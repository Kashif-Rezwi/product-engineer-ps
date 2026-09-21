import { Redis } from 'ioredis';
import { RunEvent } from '../types/events.js';

export interface StreamEntry {
    id: string;
    event: RunEvent;
}

export class RedisService {
    public client: Redis;

    constructor() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        this.client = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => Math.min(times * 100, 2000)
        });

        this.client.on('error', (err) => {
            console.error('[RedisService] Connection error:', err.message);
        });
    }

    // Appends an event to the run's Redis stream and returns the generated stream ID
    async emitEvent(runId: string, event: RunEvent): Promise<string> {
        const streamKey = `conv:events:${runId}`;
        const entryId = await this.client.xadd(
            streamKey,
            '*', // Auto-generate ID: <timestamp>-<sequence>
            'event',
            JSON.stringify(event)
        );

        if (!entryId) {
            throw new Error(`Failed to append event to stream ${streamKey}`);
        }

        // Keep stream alive for 24 hours (bounded TTL)
        await this.client.expire(streamKey, 86400);

        return entryId;
    }

    // Reads events after a specific cursor (afterId).
    // If blockMs > 0, waits up to blockMs milliseconds for live events to arrive.
    async readEvents(
        runId: string,
        afterId: string = '0-0',
        blockMs: number = 2000
    ): Promise<StreamEntry[]> {
        const streamKey = `conv:events:${runId}`;

        // XREAD [BLOCK ms] STREAMS key afterId
        const results = blockMs > 0
            ? await this.client.xread('BLOCK', blockMs, 'STREAMS', streamKey, afterId)
            : await this.client.xread('STREAMS', streamKey, afterId);

        if (!results || results.length === 0) {
            return [];
        }

        const entries: StreamEntry[] = [];
        const streamData = results[0][1]; // Array of [id, [field, value]]

        for (const [id, fields] of streamData) {
            const eventIndex = fields.indexOf('event');
            if (eventIndex !== -1 && fields[eventIndex + 1]) {
                const event = JSON.parse(fields[eventIndex + 1]) as RunEvent;
                entries.push({ id, event });
            }
        }

        return entries;
    }

    // Validates that a cursor matches the Redis Stream ID pattern (\d+-\d+) or '0-0'
    isValidStreamId(id: string): boolean {
        return id === '0-0' || /^\d+-\d+$/.test(id);
    }
}

export const redisService = new RedisService();
