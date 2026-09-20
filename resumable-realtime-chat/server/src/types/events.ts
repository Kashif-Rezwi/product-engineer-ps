export type RunEventType = 'text_chunk' | 'completed' | 'failed';

export interface TextChunkEvent {
    type: 'text_chunk';
    position: number;
    text: string;
}

export interface CompletedEvent {
    type: 'completed';
    position: number;
}

export interface FailedEvent {
    type: 'failed';
    message: string;
}

export type RunEvent = TextChunkEvent | CompletedEvent | FailedEvent;
