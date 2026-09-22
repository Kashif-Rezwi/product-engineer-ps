import { describe, it, expect } from 'vitest';
import { parseSSEStream } from '../src/lib/sse';
import type { ParsedSSEMessage } from '../src/lib/types';

// Builds a reader that yields the given raw strings as separate TCP chunks.
function readerFromChunks(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        }
    });
    return stream.getReader();
}

async function parse(chunks: string[]): Promise<ParsedSSEMessage[]> {
    const events: ParsedSSEMessage[] = [];
    await parseSSEStream(readerFromChunks(chunks), (msg) => events.push(msg));
    return events;
}

const STREAM_TEXT =
    'id: 1-0\ndata: {"type":"text_chunk","position":0,"text":"Hello "}\n\n' +
    'id: 1-1\ndata: {"type":"text_chunk","position":1,"text":"stream"}\n\n' +
    'id: 1-2\ndata: {"type":"completed","position":2}\n\n';

describe('parseSSEStream (SSE wire parser)', () => {
    it('parses complete frames with id and data', async () => {
        const events = await parse([STREAM_TEXT]);

        expect(events.map((e) => e.id)).toEqual(['1-0', '1-1', '1-2']);
        expect(events.map((e) => e.event.type)).toEqual(['text_chunk', 'text_chunk', 'completed']);
        expect(events[0].event).toEqual({ type: 'text_chunk', position: 0, text: 'Hello ' });
    });

    it('parses frames split at every TCP chunk boundary identically', async () => {
        const expected = await parse([STREAM_TEXT]);

        for (let i = 1; i < STREAM_TEXT.length; i++) {
            const events = await parse([STREAM_TEXT.slice(0, i), STREAM_TEXT.slice(i)]);
            expect(events, `split at byte ${i}`).toEqual(expected);
        }
    });

    it('normalizes CRLF line endings', async () => {
        const events = await parse([STREAM_TEXT.replace(/\n/g, '\r\n')]);
        expect(events.map((e) => e.id)).toEqual(['1-0', '1-1', '1-2']);
    });

    it('ignores heartbeat comments and accepts id without a space after the colon', async () => {
        const events = await parse([
            ': heartbeat\n\n',
            'id:5-0\ndata: {"type":"text_chunk","position":0,"text":"a"}\n\n'
        ]);
        expect(events).toEqual([{ id: '5-0', event: { type: 'text_chunk', position: 0, text: 'a' } }]);
    });

    it('flushes a trailing frame that ends without a final blank line', async () => {
        const events = await parse(['id: 9-0\ndata: {"type":"completed","position":0}']);
        expect(events).toEqual([{ id: '9-0', event: { type: 'completed', position: 0 } }]);
    });

    it('skips malformed JSON frames without crashing the parser', async () => {
        const events = await parse([
            'id: 1-0\ndata: {not json}\n\n',
            'id: 1-1\ndata: {"type":"completed","position":0}\n\n'
        ]);
        expect(events.map((e) => e.id)).toEqual(['1-1']);
    });
});
