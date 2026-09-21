import { Request, Response } from 'express';
import { conversationService } from '../services/conversation.service.js';
import { runnerService } from '../services/runner.service.js';
import { redisService } from '../services/redis.service.js';
import { streamService } from '../services/stream.service.js';

export class ConversationController {
    // POST /conversations
    async create(req: Request, res: Response): Promise<void> {
        try {
            const conversation = await conversationService.createConversation();
            res.status(201).json(conversation);
        } catch (error) {
            console.error('[ConversationController.create] Error:', error);
            res.status(500).json({ error: 'Failed to create conversation' });
        }
    }

    // POST /conversations/:id/messages
    async createMessage(req: Request, res: Response): Promise<void> {
        try {
            const { id: conversationId } = req.params;
            const { content } = req.body;

            if (!content || typeof content !== 'string' || content.trim().length === 0) {
                res.status(400).json({ error: 'Message content cannot be empty' });
                return;
            }

            // Create message and run
            const result = await conversationService.createMessageAndRun(
                conversationId as string,
                content.trim()
            );

            // Fire background run
            runnerService.executeRun(result.run.id, conversationId as string, content.trim()).catch((err) => {
                console.error('[Background Run Execution Error]', err);
            });

            res.status(201).json({
                messageId: result.message.id,
                runId: result.run.id,
                status: result.run.status,
                conversationId
            });
        } catch (error: any) {
            if (error.message === 'CONVERSATION_NOT_FOUND') {
                res.status(404).json({ error: 'Conversation not found' });
                return;
            }
            console.error('[ConversationController.createMessage] Error:', error);
            res.status(500).json({ error: 'Failed to create message' });
        }
    }

    // GET /conversations/:id
    async getById(req: Request, res: Response): Promise<void> {
        try {
            const { id: conversationId } = req.params;
            const conversation = await conversationService.getConversationById(conversationId as string);

            if (!conversation) {
                res.status(404).json({ error: 'Conversation not found' });
                return;
            }

            res.status(200).json(conversation);
        } catch (error) {
            console.error('[ConversationController.getById] Error:', error);
            res.status(500).json({ error: 'Failed to fetch conversation' });
        }
    }

    // GET /conversations/:id/runs/:runId/stream
    // Streams run events from Redis Stream with Last-Event-ID reconnection support
    async streamRun(req: Request, res: Response): Promise<void> {
        try {
            const { id: conversationId, runId } = req.params;
            const run = await conversationService.getRunById(runId as string);
            if (!run || run.conversationId !== conversationId) {
                res.status(404).json({ error: 'Run not found' });
                return;
            }
            // Extract cursor from header or query param
            const headerCursor = req.headers['last-event-id'];
            const queryCursor = req.query.cursor as string | undefined;
            const rawCursor = (typeof headerCursor === 'string' ? headerCursor : queryCursor) || '0-0';
            // Validate cursor format per Problem Requirement AC6
            if (!redisService.isValidStreamId(rawCursor)) {
                res.status(400).json({
                    error: 'INVALID_CURSOR',
                    message: 'Last-Event-ID must match Redis stream format (e.g. 1726123456789-0) or 0-0'
                });
                return;
            }
            let clientConnected = true;
            req.on('close', () => {
                clientConnected = false;
            });
            await streamService.streamRunToClient(
                runId as string,
                rawCursor,
                res,
                () => clientConnected
            );
        } catch (error) {
            console.error('[ConversationController.streamRun] Error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to establish stream' });
            }
        }
    }
}

export const conversationController = new ConversationController();
