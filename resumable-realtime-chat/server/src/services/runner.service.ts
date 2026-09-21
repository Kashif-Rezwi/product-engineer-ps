import { groqService } from './groq.service.js';
import { conversationService } from './conversation.service.js';
import { redisService } from './redis.service.js';
import { RunEvent } from '../types/events.js';

export class RunnerService {
    async executeRun(runId: string, conversationId: string, prompt: string): Promise<void> {
        // 1. Mark RUNNING in database
        const run = await conversationService.markRunRunning(runId);
        if (!run) {
            console.error(`[RunnerService] Run ${runId} could not be transitioned to RUNNING`);
            return;
        }

        const traceLog: RunEvent[] = [];
        let position = 0;

        try {
            // 2. Consume stream and emit to Redis
            for await (const textChunk of groqService.streamCompletion(prompt)) {
                const event: RunEvent = {
                    type: 'text_chunk',
                    position,
                    text: textChunk
                };

                traceLog.push(event);
                await redisService.emitEvent(runId, event); // Persist to Redis stream
                position++;
            }

            // 3. Mark COMPLETED
            const completedEvent: RunEvent = {
                type: 'completed',
                position
            };
            traceLog.push(completedEvent);
            await redisService.emitEvent(runId, completedEvent); // Emit completed to Redis

            await conversationService.markRunCompleted(runId, traceLog);
            console.log(`[RunnerService] Run ${runId} persisted as COMPLETED with ${position} chunks`);
        } catch (error: any) {
            // 4. Mark FAILED
            const failedEvent: RunEvent = {
                type: 'failed',
                message: error.message || 'Unknown generation error'
            };
            traceLog.push(failedEvent);
            await redisService.emitEvent(runId, failedEvent); // Emit failure to Redis

            await conversationService.markRunFailed(runId, error.message, traceLog);
            console.error(`[RunnerService] Run ${runId} failed:`, error);
        }
    }
}

export const runnerService = new RunnerService();
