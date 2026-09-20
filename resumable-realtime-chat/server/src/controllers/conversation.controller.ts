import { Request, Response } from 'express';
import { conversationService } from '../services/conversation.service.js';

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

            const result = await conversationService.createMessageAndRun(
                conversationId as string,
                content.trim()
            );

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
}

export const conversationController = new ConversationController();
