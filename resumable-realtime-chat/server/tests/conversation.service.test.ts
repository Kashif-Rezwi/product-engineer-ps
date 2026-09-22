import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/prisma.js', () => ({
    prisma: {
        conversation: {
            findUnique: vi.fn()
        },
        $transaction: vi.fn(),
        run: {
            updateMany: vi.fn()
        }
    }
}));

import { conversationService } from '../src/services/conversation.service.js';
import { prisma } from '../src/db/prisma.js';

const updateMany = vi.mocked(prisma.run.updateMany);

// Atomic UPDATE ... WHERE status = ... keeps terminal states immutable: a
// FAILED run can never later be marked COMPLETED.
describe('ConversationService status guards', () => {
    beforeEach(() => {
        updateMany.mockReset();
    });

    it('transitions QUEUED -> RUNNING atomically', async () => {
        updateMany.mockResolvedValue({ count: 1 });

        await expect(conversationService.markRunRunning('run1')).resolves.toBe(true);
        expect(updateMany).toHaveBeenCalledWith({
            where: { id: 'run1', status: 'QUEUED' },
            data: { status: 'RUNNING' }
        });
    });

    it('refuses to start a run that is not QUEUED', async () => {
        updateMany.mockResolvedValue({ count: 0 });
        await expect(conversationService.markRunRunning('run1')).resolves.toBe(false);
    });

    it('only completes a RUNNING run', async () => {
        updateMany.mockResolvedValue({ count: 1 });
        const traceLog = [{ type: 'completed', position: 2 }];

        await expect(conversationService.markRunCompleted('run1', traceLog)).resolves.toBe(true);
        expect(updateMany).toHaveBeenCalledWith({
            where: { id: 'run1', status: 'RUNNING' },
            data: { status: 'COMPLETED', traceLog: expect.anything() }
        });
    });

    it('ignores a completion attempt on a non-running run (terminal guard)', async () => {
        updateMany.mockResolvedValue({ count: 0 });

        await expect(conversationService.markRunCompleted('run1', [])).resolves.toBe(false);
        expect(updateMany).toHaveBeenCalledWith({
            where: { id: 'run1', status: 'RUNNING' },
            data: expect.anything()
        });
    });

    it('fails a QUEUED or RUNNING run but never a terminal one', async () => {
        updateMany.mockResolvedValue({ count: 1 });

        await expect(
            conversationService.markRunFailed('run1', 'boom', [{ type: 'failed', message: 'boom' }])
        ).resolves.toBe(true);
        expect(updateMany).toHaveBeenCalledWith({
            where: { id: 'run1', status: { in: ['QUEUED', 'RUNNING'] } },
            data: { status: 'FAILED', error: 'boom', traceLog: expect.anything() }
        });

        updateMany.mockResolvedValue({ count: 0 });
        await expect(
            conversationService.markRunFailed('run1', 'boom', [])
        ).resolves.toBe(false);
    });
});

describe('ConversationService.createMessageAndRun', () => {
    it('throws a typed sentinel when the conversation does not exist', async () => {
        vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null);

        await expect(
            conversationService.createMessageAndRun('missing', 'hello')
        ).rejects.toThrow('CONVERSATION_NOT_FOUND');
    });

    it('creates the user message and a QUEUED run in one transaction', async () => {
        vi.mocked(prisma.conversation.findUnique).mockResolvedValue({ id: 'conv1' } as never);
        const tx = {
            userMessage: { create: vi.fn().mockResolvedValue({ id: 'msg1' }) },
            run: { create: vi.fn().mockResolvedValue({ id: 'run1', status: 'QUEUED' }) }
        };
        vi.mocked(prisma.$transaction).mockImplementation(async (fn: never) =>
            (fn as unknown as (t: typeof tx) => Promise<unknown>)(tx)
        );

        const result = await conversationService.createMessageAndRun('conv1', 'hello');

        expect(result.message).toEqual({ id: 'msg1' });
        expect(result.run).toEqual({ id: 'run1', status: 'QUEUED' });
        expect(tx.userMessage.create).toHaveBeenCalledWith({
            data: { conversationId: 'conv1', role: 'user', content: 'hello' }
        });
        expect(tx.run.create).toHaveBeenCalledWith({
            data: { conversationId: 'conv1', userMessageId: 'msg1', status: 'QUEUED' }
        });
    });
});