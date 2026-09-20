import Groq from 'groq-sdk';

export class GroqService {
    private groq: Groq | null = null;
    private model = 'openai/gpt-oss-20b';

    constructor() {
        const apiKey = process.env.GROQ_API_KEY;
        this.groq = apiKey ? new Groq({ apiKey }) : null;
    }

    // Async generator that yields text chunks one by one
    async *streamCompletion(prompt: string): AsyncGenerator<string, void, unknown> {
        if (!this.groq) throw new Error('GROQ_API_KEY not set');

        try {
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
                max_completion_tokens: 2048
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) yield content;
            }
        } catch (err: any) {
            console.warn('[GroqService] API call failed', err.message);
        }
    }
}

export const groqService = new GroqService();
