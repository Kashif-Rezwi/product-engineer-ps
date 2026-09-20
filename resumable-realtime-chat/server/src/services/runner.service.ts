import { groqService } from './groq.service.js';
import { conversationService } from './conversation.service.js';
import { RunEvent } from '../types/events.js';

export class RunnerService {
    // Executes a run in the background with database persistence
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
            // 2. Consume stream
            for await (const textChunk of groqService.streamCompletion(prompt)) {
                const event: RunEvent = {
                    type: 'text_chunk',
                    position,
                    text: textChunk
                };

                traceLog.push(event);
                position++;
            }

            // 3. Mark COMPLETED
            const completedEvent: RunEvent = {
                type: 'completed',
                position
            };
            traceLog.push(completedEvent);

            await conversationService.markRunCompleted(runId, traceLog);
            console.log(`[RunnerService] Run ${runId} persisted as COMPLETED with ${position} chunks`);
        } catch (error: any) {
            // 4. Mark FAILED
            const failedEvent: RunEvent = {
                type: 'failed',
                message: error.message || 'Unknown generation error'
            };
            traceLog.push(failedEvent);

            await conversationService.markRunFailed(runId, error.message, traceLog);
            console.error(`[RunnerService] Run ${runId} failed:`, error);
        }
    }
}

export const runnerService = new RunnerService();
