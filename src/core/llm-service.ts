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
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private _isCancelled: boolean = false;

    constructor(settings: FleurPilotSettings) {
        this.settings = settings;
    }

    async sendMessage(
        messages: ChatMessage[],
        onChunk: (chunk: string) => void,
        onEnd: (cancelled: boolean) => void | Promise<void>,
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
        this._isCancelled = false;

        try {
            const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

            const response = await window.fetch(url, {
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
            this.reader = reader;

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    // 最后一个 chunk 可能还有数据，先处理再退出
                    if (value) {
                        buffer += decoder.decode(value, { stream: false });
                    }
                    // 处理缓冲区中残留的 SSE 行
                    const remainingLines = buffer.split('\n');
                    for (const line of remainingLines) {
                        const trimmed = line.trim();
                        if (!trimmed || !trimmed.startsWith('data: ')) continue;
                        const data = trimmed.slice(6).trim();
                        if (data === '[DONE]') continue;
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
                    break;
                }

                // 检查是否被取消（在 done 之后检查）
                if (this._isCancelled) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    const data = trimmed.slice(6).trim();
                    if (data === '[DONE]') {
                        await onEnd(false);
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

            // 处理循环退出后缓冲区中可能残留的最后一行
            if (buffer.trim() && buffer.trim().startsWith('data: ')) {
                const data = buffer.trim().slice(6).trim();
                if (data !== '[DONE]') {
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

            // 流结束：通知 onEnd 是否被取消
            await onEnd(this._isCancelled);
        } catch (error: unknown) {
            // AbortError: 如果是用户主动取消，走 onEnd(true) 路径
            if (this._isCancelled) {
                await onEnd(true);
                return;
            }
            if (error instanceof Error && error.name === 'AbortError') {
                await onEnd(true);
                return;
            }
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('未知错误');
        } finally {
            this.reader = null;
        }
    }

    cancel(): void {
        this._isCancelled = true;
        // cancel reader 会让正在 await 的 read() 返回 { done: true }
        if (this.reader) {
            this.reader.cancel().catch(() => {});
            // 注意：不要立即置 null，finally 中会清理
        }
        // abort 作为后备，确保 fetch 连接断开
        if (this.abortController) {
            this.abortController.abort();
        }
    }
    
    get isCancelled(): boolean {
        return this._isCancelled;
    }
}
