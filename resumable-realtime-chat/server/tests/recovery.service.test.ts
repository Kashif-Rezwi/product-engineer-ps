import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma.js', () => ({
    prisma: {
        run: {
            findMany: vi.fn()
        }
    }
}));
vi.mock('../src/services/conversation.service.js', () => ({
    conversationService: {
        markRunFailed: vi.fn()
    }
}));
vi.mock('../src/services/redis.service.js', () => ({
    redisService: {
        emitEvent: vi.fn()
    }
}));

import { recoveryService } from '../src/services/recovery.service.js';
import { prisma } from '../src/db/prisma.js';
import { conversationService } from '../src/services/conversation.service.js';
import { redisService } from '../src/services/redis.service.js';

// AC4 restart policy: runs left QUEUED/RUNNING by a previous process become
// FAILED with their durable history preserved and a terminal failed event
// appended — never silently resurrected as a new run.
describe('RecoveryService.reconcileInterruptedRuns', () => {
    beforeEach(() => {
        vi.mocked(prisma.run.findMany).mockReset();
        vi.mocked(conversationService.markRunFailed).mockReset();
        vi.mocked(redisService.emitEvent).mockReset();
    });

    it('marks an interrupted RUNNING run FAILED, preserving and extending its history', async () => {
        const existingHistory = [
            { type: 'text_chunk', position: 0, text: 'partial ' },
            { type: 'text_chunk', position: 1, text: 'output' }
        ];
        vi.mocked(prisma.run.findMany).mockResolvedValue([
            { id: 'run1', status: 'RUNNING', traceLog: [...existingHistory] }
        ] as never);
        vi.mocked(conversationService.markRunFailed).mockResolvedValue(true);

        const count = await recoveryService.reconcileInterruptedRuns();

        expect(count).toBe(1);
        const [runId, error, traceLog] = vi.mocked(conversationService.markRunFailed).mock.calls[0];
        expect(runId).toBe('run1');
        expect(error).toBe('Run interrupted by server restart');
        expect(traceLog).toEqual([
            ...existingHistory,
            { type: 'failed', message: 'Run interrupted by server restart' }
        ]);
        expect(redisService.emitEvent).toHaveBeenCalledWith('run1', {
            type: 'failed',
            message: 'Run interrupted by server restart'
        });
    });

    it('handles a QUEUED run with no history yet', async () => {
        vi.mocked(prisma.run.findMany).mockResolvedValue([
            { id: 'run2', status: 'QUEUED', traceLog: null }
        ] as never);
        vi.mocked(conversationService.markRunFailed).mockResolvedValue(true);

        await recoveryService.reconcileInterruptedRuns();

        const [, , traceLog] = vi.mocked(conversationService.markRunFailed).mock.calls[0];
        expect(traceLog).toEqual([{ type: 'failed', message: 'Run interrupted by server restart' }]);
    });

    it('does nothing when there are no interrupted runs', async () => {
        vi.mocked(prisma.run.findMany).mockResolvedValue([] as never);

        await expect(recoveryService.reconcileInterruptedRuns()).resolves.toBe(0);
        expect(conversationService.markRunFailed).not.toHaveBeenCalled();
        expect(redisService.emitEvent).not.toHaveBeenCalled();
    });

    it('does not emit a failed event if the run turned out to be already terminal', async () => {
        vi.mocked(prisma.run.findMany).mockResolvedValue([
            { id: 'run3', status: 'RUNNING', traceLog: null }
        ] as never);
        vi.mocked(conversationService.markRunFailed).mockResolvedValue(false); // raced to terminal

        await recoveryService.reconcileInterruptedRuns();

        expect(redisService.emitEvent).not.toHaveBeenCalled();
    });
});