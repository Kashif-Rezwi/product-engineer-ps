import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { streamGeneratedText } from '../src/services/generator.factory.js';

// The factory decides which generator backs a run: GENERATOR=fake (or a
// missing GROQ_API_KEY) selects the deterministic fake generator used by
// tests, the benchmark, and the documented demo path.
describe('generator factory', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        delete process.env.GENERATOR;
        delete process.env.GROQ_API_KEY;
        process.env.FAKE_GENERATOR_CHUNKS = '3';
        process.env.FAKE_GENERATOR_DELAY_MS = '0';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('selects the fake generator when GENERATOR=fake', async () => {
        process.env.GENERATOR = 'fake';
        process.env.GROQ_API_KEY = 'some-key'; // explicitly overridden

        let first = '';
        for await (const chunk of streamGeneratedText('p')) {
            first = chunk;
            break;
        }
        expect(first).toBe('chunk_0 ');
    });

    it('falls back to the fake generator when no GROQ_API_KEY is configured', async () => {
        let first = '';
        for await (const chunk of streamGeneratedText('p')) {
            first = chunk;
            break;
        }
        expect(first).toBe('chunk_0 ');
    });
});