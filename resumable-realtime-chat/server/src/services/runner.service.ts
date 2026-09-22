import { conversationService } from './conversation.service.js';
import { redisService } from './redis.service.js';
import { streamGeneratedText } from './generator.factory.js';
import { RunEvent } from '../types/events.js';

const DEFAULT_IDLE_TIMEOUT_MS = 30_000;

// A stalled provider would leave the run RUNNING forever; the timeout throws
// instead so the run is failed with its partial history preserved.
async function nextChunkWithTimeout(
    iterator: AsyncGenerator<string, void, unknown>,
    timeoutMs: number
): Promise<string | null> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`Generator stalled: no chunk received within ${timeoutMs}ms`)),
            timeoutMs
        );
    });
    try {
        const result = await Promise.race([iterator.next(), timeout]);
        // Promise.race handles the losing promise, so the timeout can't cause an unhandled rejection.
        return result.done ? null : result.value;
    } finally {
        clearTimeout(timer);
    }
}

export class RunnerService {
    // One generated reply: stream chunks to Redis, collect the traceLog, persist the terminal state.
    async executeRun(runId: string, prompt: string): Promise<void> {
        // 1. Mark RUNNING in the database (atomic QUEUED -> RUNNING guard)
        const started = await conversationService.markRunRunning(runId);
        if (!started) {
            console.error(`[RunnerService] Run ${runId} could not be transitioned to RUNNING`);
            return;
        }

        const traceLog: RunEvent[] = [];
        let position = 0;
        const idleTimeoutMs = Number(process.env.GENERATOR_IDLE_TIMEOUT_MS) || DEFAULT_IDLE_TIMEOUT_MS;

        const iterator = streamGeneratedText(prompt)[Symbol.asyncIterator]();

        try {
            // 2. Consume the stream and emit each chunk to Redis
            while (true) {
                const textChunk = await nextChunkWithTimeout(iterator, idleTimeoutMs);
                if (textChunk === null) break;

                const event: RunEvent = {
                    type: 'text_chunk',
                    position,
                    text: textChunk
                };

                traceLog.push(event);
                await redisService.emitEvent(runId, event);
                position++;
            }

            // 3. Emit the terminal completed event and persist the durable history
            const completedEvent: RunEvent = {
                type: 'completed',
                position
            };
            traceLog.push(completedEvent);
            await redisService.emitEvent(runId, completedEvent);

            await conversationService.markRunCompleted(runId, traceLog);
            console.log(`[RunnerService] Run ${runId} persisted as COMPLETED with ${position} chunks`);
        } catch (error: any) {
            // 4. Emit the failed event before the DB write so clients learn of the failure immediately.
            const message = error?.message || 'Unknown generation error';
            const failedEvent: RunEvent = {
                type: 'failed',
                message
            };
            traceLog.push(failedEvent);
            await redisService.emitEvent(runId, failedEvent);

            await conversationService.markRunFailed(runId, message, traceLog);
            console.error(`[RunnerService] Run ${runId} failed:`, message);

            // Best effort cleanup: never awaited — a stalled provider must not block failure handling.
            void Promise.resolve(iterator.return?.()).catch(() => {});
        }
    }
}

export const runnerService = new RunnerService();
