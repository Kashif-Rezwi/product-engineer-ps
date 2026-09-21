import { prisma as db } from '../db/prisma.js';
import { redisService } from './redis.service.js';
import { RunEvent, FailedEvent } from '../types/events.js';

export class RecoveryService {
    // Finds runs stuck in RUNNING or QUEUED status from a previous server crash
    // and transitions them to FAILED in both PostgreSQL and Redis.
    async reconcileInterruptedRuns(): Promise<number> {
        try {
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

                // Append terminal failed event to the existing history
                traceLog.push(failedEvent);

                // 1. Mark FAILED in PostgreSQL
                await db.run.update({
                    where: { id: run.id },
                    data: {
                        status: 'FAILED',
                        error: errorMessage,
                        traceLog: traceLog as any
                    }
                });

                // 2. Emit terminal failed event to Redis stream
                try {
                    await redisService.emitEvent(run.id, failedEvent);
                } catch (redisErr: any) {
                    console.warn(`[RecoveryService] Could not emit to Redis for run ${run.id}:`, redisErr.message);
                }

                console.log(`[RecoveryService] Reconciled run ${run.id} ➔ FAILED`);
            }

            return interruptedRuns.length;
        } catch (error) {
            console.error('[RecoveryService] Error during startup reconciliation:', error);
            throw error;
        }
    }
}

export const recoveryService = new RecoveryService();
