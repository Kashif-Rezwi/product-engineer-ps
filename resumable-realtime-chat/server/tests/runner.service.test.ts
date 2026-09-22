import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/services/conversation.service.js', () => ({
    conversationService: {
        markRunRunning: vi.fn(),
        markRunCompleted: vi.fn(),
        markRunFailed: vi.fn()
    }
}));
vi.mock('../src/services/redis.service.js', () => ({
    redisService: {
        emitEvent: vi.fn().mockResolvedValue('1-0')
    }
}));
vi.mock('../src/services/generator.factory.js', () => ({
    streamGeneratedText: vi.fn()
}));

import { runnerService } from '../src/services/runner.service.js';
import { conversationService } from '../src/services/conversation.service.js';
import { redisService } from '../src/services/redis.service.js';
import { streamGeneratedText } from '../src/services/generator.factory.js';

// Covers the runner contract: ordered event emission, terminal-state rules,
// partial-output failure (AC5), and the bounded idle timeout.
describe('RunnerService.executeRun', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.mocked(conversationService.markRunRunning).mockResolvedValue(true);
        vi.mocked(conversationService.markRunCompleted).mockReset();
        vi.mocked(conversationService.markRunFailed).mockReset();
        vi.mocked(redisService.emitEvent).mockClear();
        process.env.GENERATOR_IDLE_TIMEOUT_MS = '5000';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        vi.restoreAllMocks();
    });

    it('emits ordered text_chunk events, then a completed event, and marks the run COMPLETED', async () => {
        vi.mocked(streamGeneratedText).mockImplementation(
            async function* () { yield 'Hello '; yield 'world'; } as never
        );

        await runnerService.executeRun('run1', 'hi');

        const emitted = vi.mocked(redisService.emitEvent).mock.calls.map((call) => call[1]);
        expect(emitted).toEqual([
            { type: 'text_chunk', position: 0, text: 'Hello ' },
            { type: 'text_chunk', position: 1, text: 'world' },
            { type: 'completed', position: 2 }
        ]);

        const traceLog = vi.mocked(conversationService.markRunCompleted).mock.calls[0][1];
        expect(traceLog).toEqual([
            { type: 'text_chunk', position: 0, text: 'Hello ' },
            { type: 'text_chunk', position: 1, text: 'world' },
            { type: 'completed', position: 2 }
        ]);
        expect(conversationService.markRunFailed).not.toHaveBeenCalled();
    });

    it('does nothing when the run cannot transition to RUNNING', async () => {
        vi.mocked(conversationService.markRunRunning).mockResolvedValue(false);

        await runnerService.executeRun('run1', 'hi');

        expect(streamGeneratedText).not.toHaveBeenCalled();
        expect(redisService.emitEvent).not.toHaveBeenCalled();
    });

    it('marks the run FAILED with partial history when the generator fails mid-stream (AC5)', async () => {
        vi.mocked(streamGeneratedText).mockImplementation(
            async function* () {
                yield 'one ';
                yield 'two ';
                throw new Error('provider exploded');
            } as never
        );

        await runnerService.executeRun('run1', 'hi');

        // Failed run never completes
        expect(conversationService.markRunCompleted).not.toHaveBeenCalled();

        const [runId, error, traceLog] = vi.mocked(conversationService.markRunFailed).mock.calls[0];
        expect(runId).toBe('run1');
        expect(error).toBe('provider exploded');
        // Durable history: both partial chunks plus the terminal failed event
        expect(traceLog).toEqual([
            { type: 'text_chunk', position: 0, text: 'one ' },
            { type: 'text_chunk', position: 1, text: 'two ' },
            { type: 'failed', message: 'provider exploded' }
        ]);

        const lastEmitted = vi.mocked(redisService.emitEvent).mock.calls.at(-1)?.[1];
        expect(lastEmitted).toEqual({ type: 'failed', message: 'provider exploded' });
    });

    it('fails a stalled generator after the idle timeout instead of hanging forever', async () => {
        process.env.GENERATOR_IDLE_TIMEOUT_MS = '30';
        vi.mocked(streamGeneratedText).mockImplementation(
            async function* () {
                yield 'one ';
                // Stalls forever — no further chunk ever arrives
                await new Promise(() => {});
            } as never
        );

        await runnerService.executeRun('run1', 'hi');

        expect(conversationService.markRunCompleted).not.toHaveBeenCalled();
        const [runId, error, traceLog] = vi.mocked(conversationService.markRunFailed).mock.calls[0];
        expect(runId).toBe('run1');
        expect(error).toMatch(/stalled/i);
        expect(traceLog).toEqual([
            { type: 'text_chunk', position: 0, text: 'one ' },
            { type: 'failed', message: expect.stringMatching(/stalled/i) }
        ]);
    });
});