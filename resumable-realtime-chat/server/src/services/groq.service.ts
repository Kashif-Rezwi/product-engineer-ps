import Groq from 'groq-sdk';

const DEFAULT_MODEL = 'openai/gpt-oss-20b';

export class GroqService {
    private groq: Groq | null = null;
    private model = process.env.GROQ_MODEL || DEFAULT_MODEL;

    constructor() {
        const apiKey = process.env.GROQ_API_KEY;
        this.groq = apiKey ? new Groq({ apiKey }) : null;
    }

    // Errors are deliberately not swallowed: a failed provider call must reach
    // the runner so the run is marked FAILED with partial history preserved (AC5).
    async *streamCompletion(prompt: string): AsyncGenerator<string, void, unknown> {
        if (!this.groq) throw new Error('GROQ_API_KEY not set');

        const stream = await this.groq.chat.completions.create({
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a concise, helpful assistant.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            stream: true,
            temperature: 0.7,
            reasoning_effort: 'low',
            max_completion_tokens: 2048,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) yield content;
        }
    }
}

export const groqService = new GroqService();
