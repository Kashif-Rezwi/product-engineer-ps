import { prisma as db } from '../db/prisma.js';
import { redisService } from './redis.service.js';
import { conversationService } from './conversation.service.js';
import { RunEvent, FailedEvent } from '../types/events.js';

export class RecoveryService {
    // AC4: runs left QUEUED/RUNNING by a previous process cannot be resumed —
    // mark them FAILED, preserve their durable history, and emit a terminal failed event.
    async reconcileInterruptedRuns(): Promise<number> {
        const interruptedRuns = await db.run.findMany({
            where: {
                status: { in: ['QUEUED', 'RUNNING'] }
            }
        });

        if (interruptedRuns.length === 0) {
            console.log('[RecoveryService] No interrupted runs found.');
            return 0;
        }

        console.log(`[RecoveryService] Reconciling ${interruptedRuns.length} interrupted run(s)...`);

        for (const run of interruptedRuns) {
            const errorMessage = 'Run interrupted by server restart';
            const traceLog = (run.traceLog as unknown as RunEvent[]) || [];

            const failedEvent: FailedEvent = {
                type: 'failed',
                message: errorMessage
            };
            traceLog.push(failedEvent);

            const marked = await conversationService.markRunFailed(run.id, errorMessage, traceLog);
            if (!marked) {
                console.warn(`[RecoveryService] Run ${run.id} was already terminal; left untouched`);
                continue;
            }

            try {
                await redisService.emitEvent(run.id, failedEvent);
            } catch (redisErr: any) {
                console.warn(`[RecoveryService] Could not emit to Redis for run ${run.id}:`, redisErr.message);
            }

            console.log(`[RecoveryService] Reconciled run ${run.id} -> FAILED`);
        }

        return interruptedRuns.length;
    }
}

export const recoveryService = new RecoveryService();
