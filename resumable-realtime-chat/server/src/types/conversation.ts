export type RunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type MessageRole = 'user' | 'assistant' | 'system';

export interface Run {
    id: string;
    conversationId: string;
    userMessageId: string;
    status: RunStatus;
    createdAt: string;
    updatedAt: string;
}

export interface UserMessage {
    id: string;
    conversationId: string;
    role: 'user';
    content: string;
    createdAt: string;
    run?: Run;
}

export interface Conversation {
    id: string;
    createdAt: string;
    messages: UserMessage[];
}
