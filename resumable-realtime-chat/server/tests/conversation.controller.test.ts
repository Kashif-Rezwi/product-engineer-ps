import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/conversation.service.js', () => ({
    conversationService: {
        getRunById: vi.fn(),
        createMessageAndRun: vi.fn()
    }
}));
vi.mock('../src/services/runner.service.js', () => ({
    runnerService: { executeRun: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('../src/services/stream.service.js', () => ({
    streamService: { streamRunToClient: vi.fn().mockResolvedValue(undefined) }
}));

import { conversationController } from '../src/controllers/conversation.controller.js';
import { conversationService } from '../src/services/conversation.service.js';
import { runnerService } from '../src/services/runner.service.js';
import { streamService } from '../src/services/stream.service.js';

function fakeRes() {
    const res: any = { headersSent: false };
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    res.setHeader = vi.fn();
    res.flushHeaders = vi.fn();
    res.write = vi.fn(() => true);
    res.end = vi.fn();
    return res;
}

const fakeReq = (overrides: Record<string, unknown> = {}) => ({
    params: { id: 'conv1', runId: 'run1' },
    headers: {},
    query: {},
    body: {},
    on: vi.fn(),
    ...overrides
});

beforeEach(() => {
    vi.mocked(conversationService.getRunById).mockReset();
    vi.mocked(conversationService.createMessageAndRun).mockReset();
    vi.mocked(runnerService.executeRun).mockReset().mockResolvedValue(undefined);
    vi.mocked(streamService.streamRunToClient).mockReset().mockResolvedValue(undefined);
});

// AC6 contract: an unknown or stale cursor must produce an explicit 400 response
// instead of silently missing data.
describe('ConversationController.streamRun', () => {
    it('replies 404 when the run does not exist', async () => {
        vi.mocked(conversationService.getRunById).mockResolvedValue(null);
        const res = fakeRes();

        await conversationController.streamRun(fakeReq() as any, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(streamService.streamRunToClient).not.toHaveBeenCalled();
    });

    it('replies 404 when the run belongs to a different conversation', async () => {
        vi.mocked(conversationService.getRunById)
            .mockResolvedValue({ id: 'run1', conversationId: 'other' } as never);
        const res = fakeRes();

        await conversationController.streamRun(fakeReq() as any, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(streamService.streamRunToClient).not.toHaveBeenCalled();
    });

    it('replies 400 INVALID_CURSOR for a malformed Last-Event-ID', async () => {
        vi.mocked(conversationService.getRunById)
            .mockResolvedValue({ id: 'run1', conversationId: 'conv1' } as never);
        const res = fakeRes();
        const req = fakeReq({ headers: { 'last-event-id': 'garbage' } });

        await conversationController.streamRun(req as any, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'INVALID_CURSOR' }));
        expect(streamService.streamRunToClient).not.toHaveBeenCalled();
    });

    it('streams from the validated Last-Event-ID header cursor', async () => {
        vi.mocked(conversationService.getRunById)
            .mockResolvedValue({ id: 'run1', conversationId: 'conv1' } as never);
        const res = fakeRes();
        const req = fakeReq({ headers: { 'last-event-id': '1726123456789-5' } });

        await conversationController.streamRun(req as any, res);

        expect(streamService.streamRunToClient)
            .toHaveBeenCalledWith('run1', '1726123456789-5', res, expect.any(Function));
    });

    it('falls back to the ?cursor= query param when the header is absent', async () => {
        vi.mocked(conversationService.getRunById)
            .mockResolvedValue({ id: 'run1', conversationId: 'conv1' } as never);
        const res = fakeRes();
        const req = fakeReq({ query: { cursor: '1726123456789-2' } });

        await conversationController.streamRun(req as any, res);

        expect(streamService.streamRunToClient)
            .toHaveBeenCalledWith('run1', '1726123456789-2', res, expect.any(Function));
    });

    it('defaults to 0-0 (replay from the start) when no cursor is provided', async () => {
        vi.mocked(conversationService.getRunById)
            .mockResolvedValue({ id: 'run1', conversationId: 'conv1' } as never);
        const res = fakeRes();

        await conversationController.streamRun(fakeReq() as any, res);

        expect(streamService.streamRunToClient)
            .toHaveBeenCalledWith('run1', '0-0', res, expect.any(Function));
    });
});

describe('ConversationController.createMessage', () => {
    it('replies 400 for empty or whitespace-only content', async () => {
        const res = fakeRes();
        const req = fakeReq({ body: { content: '   ' } });

        await conversationController.createMessage(req as any, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(conversationService.createMessageAndRun).not.toHaveBeenCalled();
    });

    it('creates the message + run, fires the background runner, and replies 201', async () => {
        vi.mocked(conversationService.createMessageAndRun).mockResolvedValue({
            message: { id: 'msg1' },
            run: { id: 'run1', status: 'QUEUED' }
        } as never);
        const res = fakeRes();
        const req = fakeReq({ body: { content: 'Hello' } });

        await conversationController.createMessage(req as any, res);

        expect(runnerService.executeRun).toHaveBeenCalledWith('run1', 'Hello');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            messageId: 'msg1',
            runId: 'run1',
            status: 'QUEUED',
            conversationId: 'conv1'
        }));
    });

    it('replies 404 when the conversation does not exist', async () => {
        vi.mocked(conversationService.createMessageAndRun)
            .mockRejectedValue(new Error('CONVERSATION_NOT_FOUND'));
        const res = fakeRes();
        const req = fakeReq({ body: { content: 'Hello' } });

        await conversationController.createMessage(req as any, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(runnerService.executeRun).not.toHaveBeenCalled();
    });
});
