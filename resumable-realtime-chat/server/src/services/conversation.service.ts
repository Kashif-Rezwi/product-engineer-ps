import { prisma as prismaClient } from '../db/prisma.js';
import type { Prisma } from '@prisma/client';
import { RunEvent } from '../types/events.js';

export class ConversationService {
    // Creates a new conversation in PostgreSQL
    async createConversation() {
        return prismaClient.conversation.create({
            data: {},
            include: {
                messages: true
            }
        });
    }

    // Creates a new user message and a corresponding run in one transaction so they can never diverge.
    async createMessageAndRun(conversationId: string, content: string) {
        const conv = await prismaClient.conversation.findUnique({
            where: { id: conversationId }
        });
        if (!conv) {
            throw new Error('CONVERSATION_NOT_FOUND');
        }
        return prismaClient.$transaction(async (tx: Prisma.TransactionClient) => {
            const message = await tx.userMessage.create({
                data: {
                    conversationId,
                    role: 'user',
                    content
                }
            });
            const run = await tx.run.create({
                data: {
                    conversationId,
                    userMessageId: message.id,
                    status: 'QUEUED'
                }
            });
            return { message, run };
        });
    }

    // Fetches conversation by ID with all messages and associated runs
    async getConversationById(conversationId: string) {
        return prismaClient.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        runs: {
                            orderBy: { createdAt: 'desc' },
                            take: 1
                        }
                    }
                }
            }
        });
    }

    // Retrieves a run by ID
    async getRunById(runId: string) {
        return prismaClient.run.findUnique({
            where: { id: runId }
        });
    }

    // Guarded single UPDATE ... WHERE status = ...: a run can never transition
    // from (or through) a terminal state, even if two writers race.

    // QUEUED -> RUNNING
    async markRunRunning(runId: string): Promise<boolean> {
        const { count } = await prismaClient.run.updateMany({
            where: { id: runId, status: 'QUEUED' },
            data: { status: 'RUNNING' }
        });
        return count === 1;
    }

    // RUNNING -> COMPLETED (persists the durable traceLog)
    async markRunCompleted(runId: string, traceLog: RunEvent[]): Promise<boolean> {
        const { count } = await prismaClient.run.updateMany({
            where: { id: runId, status: 'RUNNING' },
            data: {
                status: 'COMPLETED',
                traceLog: traceLog as unknown as Prisma.InputJsonValue
            }
        });
        if (count === 0) {
            console.warn(`[ConversationService] Ignored completion for non-running run: ${runId}`);
        }
        return count === 1;
    }

    // QUEUED/RUNNING -> FAILED (terminal)
    async markRunFailed(runId: string, error: string, traceLog: RunEvent[]): Promise<boolean> {
        const { count } = await prismaClient.run.updateMany({
            where: { id: runId, status: { in: ['QUEUED', 'RUNNING'] } },
            data: {
                status: 'FAILED',
                error,
                traceLog: traceLog as unknown as Prisma.InputJsonValue
            }
        });
        return count === 1;
    }
}

export const conversationService = new ConversationService();
