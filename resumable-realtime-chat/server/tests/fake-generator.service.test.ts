import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fakeGeneratorService } from '../src/services/fake-generator.service.js';

// The fake generator backs the required tests, the verification benchmark,
// and the documented demo path — it must be deterministic, offline, and
// inject failures on demand.
describe('FakeGeneratorService', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env.FAKE_GENERATOR_CHUNKS = '5';
        process.env.FAKE_GENERATOR_DELAY_MS = '0';
        delete process.env.FAKE_GENERATOR_FAIL_AFTER;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    async function collect(): Promise<string[]> {
        const chunks: string[] = [];
        for await (const chunk of fakeGeneratorService.streamCompletion('any prompt')) {
            chunks.push(chunk);
        }
        return chunks;
    }

    it('yields the configured number of ordered, deterministic chunks', async () => {
        expect(await collect()).toEqual([
            'chunk_0 ',
            'chunk_1 ',
            'chunk_2 ',
            'chunk_3 ',
            'chunk_4 '
        ]);
        // Deterministic: identical output on a second run
        expect(await collect()).toEqual(await collect());
    });

    it('throws after N chunks when failure injection is enabled', async () => {
        process.env.FAKE_GENERATOR_FAIL_AFTER = '2';

        const chunks: string[] = [];
        await expect(async () => {
            for await (const chunk of fakeGeneratorService.streamCompletion('p')) {
                chunks.push(chunk);
            }
        }).rejects.toThrow(/injected failure after 2 chunks/);

        // The two chunks emitted before the failure were already delivered —
        // partial output, exactly the AC5 scenario.
        expect(chunks).toEqual(['chunk_0 ', 'chunk_1 ']);
    });

    it('produces at least 30 events for the benchmark by default', async () => {
        delete process.env.FAKE_GENERATOR_CHUNKS; // fall back to default 35
        const chunks = await collect();
        expect(chunks.length).toBeGreaterThanOrEqual(30);
    });
});