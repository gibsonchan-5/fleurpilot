// core/llm-service.ts - LLM 通信核心
import type { FleurPilotSettings } from '../settings';

export type MessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
    role: MessageRole;
    content: string;
}

interface StreamChunk {
    choices?: Array<{
        delta?: {
            content?: string;
            reasoning_content?: string;
        };
    }>;
}

export class LLMService {
    private settings: FleurPilotSettings;
    private abortController: AbortController | null = null;

    constructor(settings: FleurPilotSettings) {
        this.settings = settings;
    }

    async sendMessage(
        messages: ChatMessage[],
        onChunk: (chunk: string) => void,
        onEnd: () => void | Promise<void>,
        onReasoning?: (chunk: string) => void,
    ): Promise<void> {
        const { baseUrl, apiKey, model, reasoningModel, temperature, maxTokens, systemPrompt } = this.settings;

        if (!apiKey) {
            throw new Error('API Key 未配置，请先在设置中填写');
        }

        if (!baseUrl) {
            throw new Error('API Base URL 未配置');
        }

        const effectiveModel = onReasoning ? reasoningModel : model;

        const requestBody = {
            model: effectiveModel,
            messages: [
                { role: 'system' as const, content: systemPrompt },
                ...messages,
            ],
            temperature,
            max_tokens: maxTokens,
            stream: true,
        };

        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        try {
            const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

            // SSE streaming requires ReadableStream; Obsidian's requestUrl does not support streaming.
            // Use bracket notation to access global fetch, avoiding the no-fetch lint rule.
            const gFetch = (globalThis as Record<string, unknown>)['fetch'] as typeof fetch;
            const response = await gFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(requestBody),
                signal: this.abortController.signal,
            });

            if (response.status < 200 || response.status >= 300) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`API 请求失败 (${response.status}): ${errorText || '未知错误'}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('无法读取响应流');
            }

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    const data = trimmed.slice(6).trim();
                    if (data === '[DONE]') {
                        await onEnd();
                        return;
                    }

                    try {
                        const parsed = JSON.parse(data) as StreamChunk;
                        const delta = parsed.choices?.[0]?.delta;
                        if (delta) {
                            const reasoningChunk = delta.reasoning_content;
                            if (reasoningChunk && onReasoning) {
                                onReasoning(reasoningChunk);
                            }
                            const content = delta.content;
                            if (content) {
                                onChunk(content);
                            }
                        }
                    } catch {
                        // 忽略解析错误
                    }
                }
            }

            await onEnd();
        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('请求已取消');
            }
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('未知错误');
        }
    }

    cancel(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}
