import { Redis } from 'ioredis';
import { RunEvent } from '../types/events.js';

export interface StreamEntry {
    id: string;
    event: RunEvent;
}

const STREAM_TTL_SECONDS = 24 * 60 * 60;

export class RedisService {
    // A BLOCKING XREAD parks its connection server-side, so blocking reads use
    // a dedicated duplicate connection — writes must never queue behind them.
    private readonly client: Redis;
    private readonly blockingClient: Redis;

    constructor() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const options = {
            maxRetriesPerRequest: 3,
            retryStrategy: (times: number) => Math.min(times * 100, 2000)
        };

        this.client = new Redis(redisUrl, options);
        this.blockingClient = this.client.duplicate();

        this.client.on('error', (err) => {
            console.error('[RedisService] Connection error:', err.message);
        });
        this.blockingClient.on('error', (err) => {
            console.error('[RedisService] Blocking connection error:', err.message);
        });
    }

    private streamKey(runId: string): string {
        return `conv:events:${runId}`;
    }

    // XADD + EXPIRE in one pipeline; the returned entry ID doubles as the SSE
    // id / resume cursor, and the 24h TTL bounds expired streams.
    async emitEvent(runId: string, event: RunEvent): Promise<string> {
        const streamKey = this.streamKey(runId);
        const results = await this.client
            .pipeline()
            .xadd(streamKey, '*', 'event', JSON.stringify(event))
            .expire(streamKey, STREAM_TTL_SECONDS)
            .exec();

        const [xaddError, entryId] = (results?.[0] ?? [null, null]) as [Error | null, string | null];
        if (xaddError || !entryId) {
            throw new Error(`Failed to append event to stream ${streamKey}: ${xaddError?.message ?? 'no entry id'}`);
        }
        return entryId;
    }

    // Reads events after afterId; blockMs > 0 blocks for live events on the dedicated connection.
    async readEvents(
        runId: string,
        afterId: string = '0-0',
        blockMs: number = 2000
    ): Promise<StreamEntry[]> {
        const streamKey = this.streamKey(runId);
        const client = blockMs > 0 ? this.blockingClient : this.client;

        const results = blockMs > 0
            ? await client.xread('BLOCK', blockMs, 'STREAMS', streamKey, afterId)
            : await client.xread('STREAMS', streamKey, afterId);

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

    // Rebuilds an expired stream from the durable traceLog so reconnections share one cursor space.
    async appendEvents(runId: string, events: RunEvent[]): Promise<void> {
        for (const event of events) {
            await this.emitEvent(runId, event);
        }
    }
}

export const redisService = new RedisService();
