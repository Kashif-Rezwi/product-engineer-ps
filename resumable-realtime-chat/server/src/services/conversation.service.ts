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

    // Creates a UserMessage and a Run in QUEUED status
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

    // Transitions run from QUEUED to RUNNING
    async markRunRunning(runId: string) {
        const run = await prismaClient.run.findUnique({ where: { id: runId } });
        if (!run || run.status !== 'QUEUED') return null;
        return prismaClient.run.update({
            where: { id: runId },
            data: { status: 'RUNNING' }
        });
    }

    // Status-guarded completion: only transitions RUNNING -> COMPLETED
    // Prevents overriding an already terminal run.
    async markRunCompleted(runId: string, traceLog: RunEvent[]) {
        const run = await prismaClient.run.findUnique({ where: { id: runId } });
        if (!run || run.status !== 'RUNNING') {
            console.warn(`[ConversationService] Ignored completion for non-running run: ${runId}`);
            return null;
        }
        return prismaClient.run.update({
            where: { id: runId },
            data: {
                status: 'COMPLETED',
                traceLog: traceLog as any
            }
        });
    }

    // Status-guarded failure: marks run as FAILED
    async markRunFailed(runId: string, error: string, traceLog: RunEvent[]) {
        const run = await prismaClient.run.findUnique({ where: { id: runId } });
        if (!run || run.status === 'COMPLETED' || run.status === 'FAILED') {
            return null;
        }
        return prismaClient.run.update({
            where: { id: runId },
            data: {
                status: 'FAILED',
                error,
                traceLog: traceLog as any
            }
        });
    }
}

export const conversationService = new ConversationService();
