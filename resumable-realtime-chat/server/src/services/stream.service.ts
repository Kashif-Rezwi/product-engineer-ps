import { Response } from 'express';
import { redisService, StreamEntry } from './redis.service.js';
import { conversationService } from './conversation.service.js';
import { RunEvent } from '../types/events.js';

const BLOCK_MS = 2000;

export class StreamService {
    // Streams a run's events as SSE starting after initialCursor. Replay and
    // live share one Redis stream, so delivery is a single ordered sequence.
    async streamRunToClient(
        runId: string,
        initialCursor: string,
        res: Response,
        isClientConnected: () => boolean
    ): Promise<void> {
        const cursor = { id: initialCursor };

        // Standard SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        // 1. Replay everything already persisted after the cursor
        let entries = await redisService.readEvents(runId, cursor.id, 0);

        // Stream expired (24h TTL) but the durable history in Postgres remains:
        // rebuild it so reconnections share one cursor space (client dedupes by position).
        if (entries.length === 0) {
            const run = await conversationService.getRunById(runId);
            const history = (run?.traceLog as unknown as RunEvent[] | null) ?? null;
            if (run && (run.status === 'COMPLETED' || run.status === 'FAILED') && history && history.length > 0) {
                await redisService.appendEvents(runId, history);
                entries = await redisService.readEvents(runId, cursor.id, 0);
            }
        }

        if (this.deliverEntries(entries, res, cursor, isClientConnected)) return;

        // 2. Live delivery loop — blocking reads on the dedicated Redis connection.
        while (isClientConnected()) {
            const liveEntries = await redisService.readEvents(runId, cursor.id, BLOCK_MS);

            if (liveEntries.length > 0) {
                if (this.deliverEntries(liveEntries, res, cursor, isClientConnected)) return;
                continue;
            }

            // Heartbeat to keep proxies and the client connection alive
            res.write(': heartbeat\n\n');

            // No events within the block window — if the run is terminal, drain and close.
            const run = await conversationService.getRunById(runId);
            if (run && (run.status === 'COMPLETED' || run.status === 'FAILED')) {
                const trailing = await redisService.readEvents(runId, cursor.id, 0);
                if (this.deliverEntries(trailing, res, cursor, () => true)) return;
                res.end();
                return;
            }
        }
    }

    // Writes SSE frames (id = stream entry ID = resume cursor) and advances the
    // cursor. Returns true when delivery must stop (terminal event or client left).
    private deliverEntries(
        entries: StreamEntry[],
        res: Response,
        cursor: { id: string },
        isClientConnected: () => boolean
    ): boolean {
        for (const entry of entries) {
            if (!isClientConnected()) return true;

            res.write(`id: ${entry.id}\ndata: ${JSON.stringify(entry.event)}\n\n`);
            cursor.id = entry.id;

            if (entry.event.type === 'completed' || entry.event.type === 'failed') {
                res.end();
                return true;
            }
        }
        return false;
    }
}

export const streamService = new StreamService();
