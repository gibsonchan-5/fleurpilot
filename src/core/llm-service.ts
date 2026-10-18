// core/llm-service.ts - LLM 通信核心
import type { FleurPilotSettings } from '../settings';
import { isDashScopeEndpoint } from '../settings';

export type MessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
    role: MessageRole;
    content: string;
}

export interface SendOptions {
    /**
     * 本次请求允许使用联网检索。实际是否生效还要看档位与引擎：
     * settings.webSearchMode !== 'off' 且 baseUrl 指向 DashScope 兼容端点。
     */
    webSearch?: boolean;
    /** 检索参数导致请求失败并已降级重发时回调（reason 为状态码/错误摘要）。 */
    onSearchDegraded?: (reason: string) => void;
}

/** 检索生效时附加在系统提示词后的来源标注要求。 */
const WEB_SEARCH_SYSTEM_ADDENDUM = [
    '',
    '',
    '【联网检索】本次回答已开启联网检索。',
    '1. 使用了检索到的信息时，在相应句后用括号标注来源站点域名，例如（来源：baike.baidu.com）。',
    '2. 检索结果之间互相矛盾、或无法核实的细节，不要当作定论写出来，可直接说明存在不同说法。',
    '3. 检索到的内容与常识冲突时，以你能确证的事实为准，并注明该处未采用检索结果。',
].join('\n');

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
        opts?: SendOptions,
    ): Promise<void> {
        const { baseUrl, apiKey, model, reasoningModel, temperature, maxTokens, systemPrompt, webSearchMode } = this.settings;

        if (!apiKey) {
            throw new Error('API Key 未配置，请先在设置中填写');
        }

        if (!baseUrl) {
            throw new Error('API Base URL 未配置');
        }

        // 思考模型留空时回落主模型：data.json 里可能存过显式的 ''（loadSettings 浅合并会让它
        // 一直压过默认值），不兜底的话思考模式会拿空模型名发请求、必然报错。
        const effectiveModel = (onReasoning ? reasoningModel : model) || model;

        // 联网检索只有 DashScope 兼容端点能做（enable_search 是其专有扩展参数）。
        // 档位为 off、或引擎不支持时，请求体与未加此功能时逐字段相同。
        const searchUsable = opts?.webSearch === true
            && webSearchMode !== 'off'
            && isDashScopeEndpoint(baseUrl);

        const buildBody = (withSearch: boolean): Record<string, unknown> => {
            const body: Record<string, unknown> = {
                model: effectiveModel,
                messages: [
                    {
                        role: 'system' as const,
                        content: withSearch ? systemPrompt + WEB_SEARCH_SYSTEM_ADDENDUM : systemPrompt,
                    },
                    ...messages,
                ],
                temperature,
                max_tokens: maxTokens,
                stream: true,
            };
            if (withSearch) {
                // 官方文档：兼容模式下 enable_search / search_options 都是顶层参数
                body.enable_search = true;
                body.search_options = webSearchMode === 'forced'
                    // 强制档：无论模型如何判断都发起检索
                    ? { forced_search: true, search_strategy: 'turbo' }
                    // 智能档：默认行为，模型自行决定是否需要联网
                    : { search_strategy: 'turbo' };
            }
            // 思考模式 + 千问引擎：Qwen3 系混合思考模型的思考档默认是**关**的，必须显式传
            // enable_thinking 才会从 delta.reasoning_content 吐思考内容（DeepSeek 的
            // reasoner 是独立模型、默认就吐，不需要也不认识这个参数，所以只对 DashScope 加）。
            // enable_thinking 同样是顶层参数（官方文档：OpenAI SDK 走 extra_body，即顶层字段）。
            if (onReasoning && isDashScopeEndpoint(baseUrl)) {
                body.enable_thinking = true;
            }
            return body;
        };

        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();
        const controller = this.abortController;
        this._isCancelled = false;

        try {
            const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

            const post = (withSearch: boolean) => window.fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify(buildBody(withSearch)),
                signal: controller.signal,
            });

            let response = await post(searchUsable);

            if ((response.status < 200 || response.status >= 300) && searchUsable) {
                // 检索参数被拒（模型档位不支持等）：摘掉检索重发一次，不静默假装成功
                const errorText = await response.text().catch(() => '');
                opts?.onSearchDegraded?.(`${response.status} ${errorText.slice(0, 80)}`);
                if (this._isCancelled) {
                    await onEnd(true);
                    return;
                }
                response = await post(false);
            }

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
