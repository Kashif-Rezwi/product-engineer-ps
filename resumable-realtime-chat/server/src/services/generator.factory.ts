import { groqService } from './groq.service.js';
import { fakeGeneratorService } from './fake-generator.service.js';

// A response generator turns a prompt into an ordered stream of text chunks.
// The runner is agnostic to which implementation is behind it.
export type ResponseGenerator = (prompt: string) => AsyncGenerator<string, void, unknown>;

// GENERATOR=fake forces the fake generator; a missing GROQ_API_KEY also falls
// back to it so the full experience works without provider credentials.
export function streamGeneratedText(prompt: string): AsyncGenerator<string, void, unknown> {
    const useFake = process.env.GENERATOR === 'fake' || !process.env.GROQ_API_KEY;
    return useFake
        ? fakeGeneratorService.streamCompletion(prompt)
        : groqService.streamCompletion(prompt);
}