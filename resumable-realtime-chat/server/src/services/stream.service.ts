import { Response } from 'express';
import { redisService } from './redis.service.js';
import { conversationService } from './conversation.service.js';
import { RunEvent } from '../types/events.js';

export class StreamService {
    // Streams events to an HTTP response from a Redis cursor with SSE formatting
    async streamRunToClient(
        runId: string,
        initialCursor: string,
        res: Response,
        isClientConnected: () => boolean
    ): Promise<void> {
        let currentCursor = initialCursor;

        // Set standard SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        // 1. Check if Redis has any events for this run
        const initialEntries = await redisService.readEvents(runId, currentCursor, 0);

        // Fallback: If Redis stream is empty and Run is already COMPLETED in DB (e.g. after Redis TTL)
        if (initialEntries.length === 0 && currentCursor === '0-0') {
            const run = await conversationService.getRunById(runId);
            if (run && (run.status === 'COMPLETED' || run.status === 'FAILED')) {
                const history = (run.traceLog as unknown as RunEvent[]) || [];
                for (let i = 0; i < history.length; i++) {
                    const event = history[i];
                    res.write(`id: ${i}-0\ndata: ${JSON.stringify(event)}\n\n`);
                }
                res.end();
                return;
            }
        }

        // 2. Active streaming loop using Redis Streams
        while (isClientConnected()) {
            // Block up to 2000ms for new events
            const entries = await redisService.readEvents(runId, currentCursor, 2000);

            if (entries.length > 0) {
                for (const entry of entries) {
                    if (!isClientConnected()) return;

                    // SSE Frame: id is the Redis Stream ID
                    res.write(`id: ${entry.id}\ndata: ${JSON.stringify(entry.event)}\n\n`);
                    currentCursor = entry.id;

                    // If terminal event reached, end stream
                    if (entry.event.type === 'completed' || entry.event.type === 'failed') {
                        res.end();
                        return;
                    }
                }
            } else {
                // Heartbeat to keep connection alive during block timeouts
                res.write(': heartbeat\n\n');

                // Check if run completed while we were blocking
                const run = await conversationService.getRunById(runId);
                if (run && (run.status === 'COMPLETED' || run.status === 'FAILED')) {
                    // One final check to make sure no unread entries remain
                    const trailing = await redisService.readEvents(runId, currentCursor, 0);
                    for (const entry of trailing) {
                        res.write(`id: ${entry.id}\ndata: ${JSON.stringify(entry.event)}\n\n`);
                        currentCursor = entry.id;
                    }
                    res.end();
                    return;
                }
            }
        }
    }
}

export const streamService = new StreamService();
