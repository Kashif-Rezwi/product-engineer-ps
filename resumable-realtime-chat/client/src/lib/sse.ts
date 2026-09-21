import { RunEvent, ParsedSSEMessage } from './types';

/**
 * Parses a ReadableStreamDefaultReader<Uint8Array> emitting SSE events.
 *
 * Handles:
 * - TCP chunk boundary fragmentation (lines split across network reads)
 * - CRLF and LF line endings
 * - Multi-line data fields
 * - SSE comment frames (`: heartbeat`) — ignored
 * - `id:` extraction for Last-Event-ID cursor tracking
 */
export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (msg: ParsedSSEMessage) => void,
  signal?: AbortSignal
): Promise<void> {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Normalize CRLF to LF
      buffer = buffer.replace(/\r\n/g, '\n');

      // SSE frames are delimited by double newlines
      let boundaryIndex: number;
      while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);
        parseSSEFrame(frame, onEvent);
      }
    }

    // Flush any trailing content (edge case: stream ends without final \n\n)
    if (buffer.trim().length > 0) {
      parseSSEFrame(buffer, onEvent);
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSSEFrame(
  frame: string,
  onEvent: (msg: ParsedSSEMessage) => void
): void {
  const lines = frame.split('\n');
  let currentId = '';
  const dataLines: string[] = [];

  for (const line of lines) {
    // Ignore SSE comment lines (e.g. ": heartbeat") and blank lines
    if (line.startsWith(':') || line.trim() === '') continue;

    if (line.startsWith('id:')) {
      const raw = line.slice(3);
      currentId = raw.startsWith(' ') ? raw.slice(1) : raw;
    } else if (line.startsWith('data:')) {
      const raw = line.slice(5);
      dataLines.push(raw.startsWith(' ') ? raw.slice(1) : raw);
    }
  }

  if (dataLines.length === 0) return;

  const rawJson = dataLines.join('\n');
  try {
    const parsedEvent = JSON.parse(rawJson) as RunEvent;
    onEvent({ id: currentId, event: parsedEvent });
  } catch {
    console.warn('[SSE] Failed to parse frame:', rawJson);
  }
}
