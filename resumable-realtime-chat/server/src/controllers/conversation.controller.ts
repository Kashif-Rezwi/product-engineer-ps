import { Request, Response } from 'express';
import { conversationService } from '../services/conversation.service.js';
import { runnerService } from '../services/runner.service.js';
import { RunEvent } from '../types/events.js';

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
    // Streams events for a run using Server-Sent Events (SSE)
    async streamRun(req: Request, res: Response): Promise<void> {
        try {
            const { id: conversationId, runId } = req.params;

            const run = await conversationService.getRunById(runId as string);
            if (!run || run.conversationId !== conversationId) {
                res.status(404).json({ error: 'Run not found' });
                return;
            }

            // Set required SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no'); // Prevents proxy buffering
            res.flushHeaders();

            // Helper to write a compliant SSE frame
            const sendEvent = (event: RunEvent) => {
                const id = 'position' in event ? event.position : 'terminal';
                res.write(`id: ${id}\ndata: ${JSON.stringify(event)}\n\n`);
            };

            // 1. If run is already finished, replay full trace from DB and close
            if (run.status === 'COMPLETED' || run.status === 'FAILED') {
                const history = (run.traceLog as unknown as RunEvent[]) || [];
                for (const event of history) {
                    sendEvent(event);
                }
                res.end();
                return;
            }

            // 2. If run is in-progress, replay any chunks already persisted
            const sentPositions = new Set<number>();
            const existingEvents = (run.traceLog as unknown as RunEvent[]) || [];
            for (const event of existingEvents) {
                if ('position' in event) sentPositions.add(event.position);
                sendEvent(event);
            }

            // 3. Heartbeat comment every 15s
            const heartbeatInterval = setInterval(() => {
                res.write(': heartbeat\n\n');
            }, 15000);

            // 4. Live event listener
            const onRunEvent = (event: RunEvent) => {
                if ('position' in event && sentPositions.has(event.position)) return; // Avoid duplicates if already sent from existing
                if ('position' in event) sentPositions.add(event.position);

                sendEvent(event);

                if (event.type === 'completed' || event.type === 'failed') {
                    cleanup();
                    res.end();
                }
            };

            const cleanup = () => {
                clearInterval(heartbeatInterval);
                runnerService.off(`run:${runId}`, onRunEvent);
            };

            runnerService.on(`run:${runId}`, onRunEvent);

            // Cleanup if client closes connection abruptly
            req.on('close', cleanup);
        } catch (error) {
            console.error('[ConversationController.streamRun] Error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to establish stream' });
            }
        }
    }
}

export const conversationController = new ConversationController();
