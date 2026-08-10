// core/llm-service.ts - LLM 通信核心
import { requestUrl, RequestUrlParam } from 'obsidian';
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
        onEnd: () => void,
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

            const params: RequestUrlParam = {
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(requestBody),
                throw: false,
            };

            const response = await requestUrl(params);

            if (response.status < 200 || response.status >= 300) {
                const errorText = response.text || `HTTP ${response.status}`;
                throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
            }

            // 尝试流式解析
            const text = response.text;
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') {
                        onEnd();
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

            onEnd();
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
