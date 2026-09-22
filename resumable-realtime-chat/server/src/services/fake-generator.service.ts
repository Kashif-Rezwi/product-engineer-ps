// Deterministic offline generator (required by the brief) — backs tests, the
// benchmark, and the credential-free demo. FAKE_GENERATOR_CHUNKS / _DELAY_MS /
// _FAIL_AFTER are read per call so tests and scripts can inject scenarios.

const DEFAULT_CHUNK_COUNT = 35;
const DEFAULT_DELAY_MS = 40;

function intEnv(name: string, fallback: number): number {
    const parsed = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export class FakeGeneratorService {
    async *streamCompletion(_prompt: string): AsyncGenerator<string, void, unknown> {
        const chunkCount = intEnv('FAKE_GENERATOR_CHUNKS', DEFAULT_CHUNK_COUNT);
        const delayMs = intEnv('FAKE_GENERATOR_DELAY_MS', DEFAULT_DELAY_MS);
        const failAfterRaw = process.env.FAKE_GENERATOR_FAIL_AFTER;
        const failAfter = failAfterRaw === undefined
            ? undefined
            : Number.parseInt(failAfterRaw, 10);

        for (let i = 0; i < chunkCount; i++) {
            if (failAfter !== undefined && !Number.isNaN(failAfter) && i === failAfter) {
                throw new Error(`Fake generator injected failure after ${i} chunks`);
            }
            if (delayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
            yield `chunk_${i} `;
        }
    }
}

export const fakeGeneratorService = new FakeGeneratorService();