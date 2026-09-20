import { groqService } from './groq.service.js';
import { conversationService } from './conversation.service.js';
import { RunEvent } from '../types/events.js';

export class RunnerService {
    // Executes a run in the background (asynchronous, detached execution)
    async executeRun(runId: string, conversationId: string, prompt: string): Promise<void> {
        const run = await conversationService.getRunById(runId);
        if (!run) {
            console.error(`[RunnerService] Run ${runId} not found`);
            return;
        }

        // 1. Mark RUNNING
        run.status = 'RUNNING';
        run.traceLog = [];
        run.updatedAt = new Date().toISOString();

        let position = 0;

        try {
            // 2. Consume stream
            for await (const textChunk of groqService.streamCompletion(prompt)) {
                const event: RunEvent = {
                    type: 'text_chunk',
                    position,
                    text: textChunk
                };

                run.traceLog.push(event);
                position++;
            }

            // 3. Mark COMPLETED
            const completedEvent: RunEvent = {
                type: 'completed',
                position
            };
            run.traceLog.push(completedEvent);
            run.status = 'COMPLETED';
            run.updatedAt = new Date().toISOString();
            console.log(`[RunnerService] Run ${runId} finished successfully with ${position} chunks`);
        } catch (error: any) {
            // 4. Mark FAILED
            const failedEvent: RunEvent = {
                type: 'failed',
                message: error.message || 'Unknown generation error'
            };
            run.traceLog.push(failedEvent);
            run.status = 'FAILED';
            run.error = error.message;
            run.updatedAt = new Date().toISOString();
            console.error(`[RunnerService] Run ${runId} failed:`, error);
        }
    }
}

export const runnerService = new RunnerService();
