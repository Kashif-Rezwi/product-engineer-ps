import { Conversation, UserMessage, Run } from '../types/conversation.js';
import crypto from 'node:crypto';

// In-memory store for Phase 1
const conversations = new Map<string, Conversation>();

export class ConversationService {
    // Creates a new empty conversation
    async createConversation(): Promise<Conversation> {
        const conversationId = `conv_${crypto.randomUUID()}`;
        const newConv: Conversation = {
            id: conversationId,
            createdAt: new Date().toISOString(),
            messages: []
        };

        conversations.set(conversationId, newConv);
        return newConv;
    }

    // Appends a user message to a conversation and creates an associated Run in QUEUED status
    async createMessageAndRun(
        conversationId: string,
        content: string
    ): Promise<{ message: UserMessage; run: Run }> {
        const conv = conversations.get(conversationId);
        if (!conv) {
            throw new Error('CONVERSATION_NOT_FOUND');
        }

        const messageId = `msg_${crypto.randomUUID()}`;
        const runId = `run_${crypto.randomUUID()}`;
        const now = new Date().toISOString();

        const run: Run = {
            id: runId,
            conversationId,
            userMessageId: messageId,
            status: 'QUEUED',
            createdAt: now,
            updatedAt: now
        };

        const message: UserMessage = {
            id: messageId,
            conversationId,
            role: 'user',
            content,
            createdAt: now,
            run
        };

        conv.messages.push(message);
        return { message, run };
    }

    // Retrieves conversation history by ID
    async getConversationById(conversationId: string): Promise<Conversation | null> {
        return conversations.get(conversationId) || null;
    }
}

export const conversationService = new ConversationService();
