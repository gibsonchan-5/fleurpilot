// core/llm-service.ts - LLM 通信核心
import { MagicBrushSettings } from '../settings';

/**
 * 消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * 对话消息
 */
export interface ChatMessage {
    role: MessageRole;
    content: string;
}

/**
 * LLM 服务 - 处理与模型的通信
 */
export class LLMService {
    private settings: MagicBrushSettings;
    private abortController: AbortController | null = null;

    constructor(settings: MagicBrushSettings) {
        this.settings = settings;
    }

    /**
     * 发送消息并处理流式响应
     * @param reasoningMode 是否为推理模式，会解析 reasoning_content
     */
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

        // 推理模式使用 reasoningModel，否则用默认 model
        const effectiveModel = onReasoning ? reasoningModel : model;

        // 构造请求体
        const requestBody = {
            model: effectiveModel,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages,
            ],
            temperature,
            max_tokens: maxTokens,
            stream: true,
        };

        // 取消之前的请求
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        try {
            const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(requestBody),
                signal: this.abortController.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API 请求失败 (${response.status}): ${errorText}`);
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
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();
                        if (data === '[DONE]') {
                            onEnd();
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta;
                            if (delta) {
                                // 推理内容（如 DeepSeek-R1 的 thinking）
                                const reasoningChunk = delta.reasoning_content;
                                if (reasoningChunk && onReasoning) {
                                    onReasoning(reasoningChunk);
                                }
                                // 正文内容
                                const content = delta.content;
                                if (content) {
                                    onChunk(content);
                                }
                            }
                        } catch (e) {
                            // 忽略解析错误
                        }
                    }
                }
            }

            onEnd();
        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw new Error('请求已取消');
            }
            throw error;
        }
    }

    /**
     * 取消当前请求
     */
    cancel(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}
