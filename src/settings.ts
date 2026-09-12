// settings.ts - FleurPilot 配置
// 使用 Obsidian 1.13+ 声明式设置 API
// 移除 display() 方法以通过 obsidianmd/no-deprecated-display 规则审查
import { App, PluginSettingTab, Notice, SettingDefinitionItem } from 'obsidian';
import type FleurPilotPlugin from './main';
import { t, Lang } from './i18n';

export interface ModelPreset {
    id: string;
    name: string;
    baseUrl: string;
    model: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
    { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { id: 'qwen', name: '通义千问 (DashScope)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { id: 'glm', name: '智谱 (GLM)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-72B-Instruct' },
    { id: 'custom', name: '自定义', baseUrl: '', model: '' },
];

export interface InlineEditModalSize {
    width: number;
    height: number;
    top?: number;
    left?: number;
}

export interface FleurPilotSettings {
    provider: string;
    baseUrl: string;
    apiKey: string;
    /** 密钥保存位置：system=系统钥匙串（默认），vault=data.json 明文随 vault 同步。 */
    secretStorageMode: 'system' | 'vault';
    model: string;
    reasoningModel: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    enableContext: boolean;
    enableInlineContext: boolean;
    /** 内联编辑的自定义上下文来源（文件夹或笔记路径）；空数组 = 默认当前笔记 */
    inlineContextPaths: string[];
    /** 内联编辑各动作的自定义提示词，留空表示使用内置默认 */
    inlinePolishPrompt: string;
    inlineExpandPrompt: string;
    inlineShortenPrompt: string;
    inlineContinuePrompt: string;
    enableInlineEdit: boolean;
    enableQuickCommands: boolean;
    enableChatHistory: boolean;
    chatHistoryFolder: string;
    language: Lang;
    inlineEditModalSize?: InlineEditModalSize;
}

export const DEFAULT_SETTINGS: FleurPilotSettings = {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    secretStorageMode: 'system',
    model: 'deepseek-chat',
    reasoningModel: 'deepseek-reasoner',
    systemPrompt: '你是一位专业的写作伙伴，熟悉各类文本的梳理、润色与扩展。请基于用户提供的笔记内容，给出清晰、准确、可直接使用的回复，保持简洁、克制、实用。',
    temperature: 0.7,
    maxTokens: 4096,
    enableContext: true,
    enableInlineContext: true,
    inlineContextPaths: [],
    inlinePolishPrompt: '',
    inlineExpandPrompt: '',
    inlineShortenPrompt: '',
    inlineContinuePrompt: '',
    enableInlineEdit: true,
    enableQuickCommands: true,
    enableChatHistory: false,
    chatHistoryFolder: 'FleurPilot',
    language: 'zh-CN',
};

/**
 * 根据当前 provider 从预设中应用 baseUrl 和 model
 * 声明式 API 不支持 onChange 回调,因此通过命令触发该逻辑
 */
export function applyProviderPreset(settings: FleurPilotSettings): FleurPilotSettings {
    const preset = MODEL_PRESETS.find(p => p.id === settings.provider);
    if (preset && preset.id !== 'custom') {
        return { ...settings, baseUrl: preset.baseUrl, model: preset.model };
    }
    return settings;
}

export class FleurPilotSettingTab extends PluginSettingTab {
    plugin: FleurPilotPlugin;

    constructor(app: App, plugin: FleurPilotPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * 重写 setControlValue：当 provider 变化时自动同步预设的 baseUrl 和 model
     * 声明式 API 的 control 不支持 onChange，通过此方法拦截值变更
     *
     * super 会把值写进 plugin.settings 并调用 plugin.saveData —— 后者已被插件重写为
     * 「写盘前抹掉密钥」，所以这条路径同样不会把明文密钥落进 data.json。
     */
    async setControlValue(key: string, value: unknown): Promise<void> {
        // 密钥保存位置切换：走完整的搬迁 + 校验 + 回滚流程，而不是直接改值落盘
        if (key === 'secretStorageMode') {
            const $ = (k: string, fb?: string) => t(this.plugin.settings.language, k, fb);
            const mode = value === 'vault' ? 'vault' : 'system';
            const result = await this.plugin.setSecretStorageMode(mode);
            if (!result.ok) {
                new Notice($('notice.secretMoveFailed'));
            } else if (mode === 'vault') {
                new Notice($('notice.secretMovedVault'));
            } else {
                new Notice($('notice.secretMovedSystem'));
            }
            // 重新渲染，让密钥说明回到与实际模式一致的措辞（失败时也会显示回滚后的值）
            this.update();
            return;
        }
        await super.setControlValue(key, value);
        if (key === 'provider' && typeof value === 'string') {
            const preset = MODEL_PRESETS.find(p => p.id === value);
            if (preset && preset.id !== 'custom') {
                this.plugin.settings.baseUrl = preset.baseUrl;
                this.plugin.settings.model = preset.model;
                await this.plugin.saveSettings();
                this.update();
            }
        }
    }

    /**
     * Obsidian 1.13+ 声明式设置 API
     * 让设置项出现在 Obsidian 设置搜索中
     */
    getSettingDefinitions(): SettingDefinitionItem[] {
        const $ = (key: string, fb?: string | Record<string, string>) => t(this.plugin.settings.language, key, fb);
        const presetOptions: Record<string, string> = {};
        for (const p of MODEL_PRESETS) presetOptions[p.id] = p.name;

        return [
            {
                name: $('settings.provider'),
                desc: $('settings.providerDesc'),
                control: {
                    type: 'dropdown',
                    key: 'provider',
                    options: presetOptions,
                },
            },
            {
                name: $('settings.baseUrl'),
                desc: $('settings.baseUrlDesc'),
                control: {
                    type: 'text',
                    key: 'baseUrl',
                    placeholder: $('settings.baseUrlPlaceholder'),
                },
            },
            {
                // 密钥保存位置：切换走 setControlValue 拦截里的完整搬迁流程
                name: $('settings.secretModeName'),
                desc: this.plugin.secretStorageAvailable
                    ? $('settings.secretModeDesc')
                    : $('settings.secretModeUnavailable'),
                control: {
                    type: 'dropdown',
                    key: 'secretStorageMode',
                    options: {
                        system: $('settings.secretModeOptionSystem'),
                        vault: $('settings.secretModeOptionVault'),
                    },
                },
            },
            {
                name: $('settings.apiKey'),
                desc: this.secretDesc($),
                // 声明式设置 API 没有密码型控件，用 render 手动挂一个遮蔽输入框，
                // 避免密钥在设置界面上以明文显示（写盘仍统一走 plugin.saveSettings）。
                render: (setting) => {
                    setting.addText((text) => {
                        text
                            .setPlaceholder($('settings.apiKeyPlaceholder'))
                            .setValue(this.plugin.settings.apiKey)
                            .onChange(async (value) => {
                                this.plugin.settings.apiKey = value;
                                await this.plugin.saveSettings();
                            });
                        text.inputEl.type = 'password';
                        text.inputEl.autocomplete = 'off';
                    });
                },
            },
            {
                name: $('settings.model'),
                desc: $('settings.modelDesc'),
                control: {
                    type: 'text',
                    key: 'model',
                    placeholder: $('settings.modelPlaceholder'),
                },
            },
            {
                name: $('settings.reasoningModel'),
                desc: $('settings.reasoningModelDesc'),
                control: {
                    type: 'text',
                    key: 'reasoningModel',
                    placeholder: $('settings.reasoningModelPlaceholder'),
                },
            },
            {
                name: $('settings.testConnection'),
                desc: $('settings.testConnectionDesc'),
                action: () => {
                    void (async () => {
                        const { LLMService } = await import('./core/llm-service');
                        const llm = new LLMService(this.plugin.settings);
                        let result = '';
                        try {
                            await llm.sendMessage(
                                [{ role: 'user', content: $('settings.connectionTestPrompt') }],
                                (chunk) => { result += chunk; },
                                () => { /* done */ },
                            );
                            new Notice($('notice.testSuccess', { response: result.slice(0, 30) }));
                        } catch (error: unknown) {
                            const msg = error instanceof Error ? error.message.slice(0, 50) : 'Unknown error';
                            new Notice($('notice.testFailed', { error: msg }));
                        }
                    })();
                },
            },
            {
                name: $('settings.systemPrompt'),
                desc: $('settings.systemPromptDesc'),
                control: {
                    type: 'textarea',
                    key: 'systemPrompt',
                    placeholder: $('settings.systemPromptPlaceholder'),
                    rows: 3,
                },
            },
            {
                name: $('settings.temperature'),
                desc: $('settings.temperatureDesc'),
                control: {
                    type: 'slider',
                    key: 'temperature',
                    min: 0,
                    max: 1,
                    step: 0.1,
                },
            },
            {
                name: $('settings.maxTokens'),
                desc: $('settings.maxTokensDesc'),
                control: {
                    type: 'slider',
                    key: 'maxTokens',
                    min: 512,
                    max: 16384,
                    step: 512,
                },
            },
            {
                name: $('settings.enableContext'),
                desc: $('settings.enableContextDesc'),
                control: {
                    type: 'toggle',
                    key: 'enableContext',
                },
            },
            {
                name: $('settings.enableInlineContext'),
                desc: $('settings.enableInlineContextDesc'),
                control: {
                    type: 'toggle',
                    key: 'enableInlineContext',
                },
            },
            {
                name: $('settings.inlinePolishPrompt'),
                desc: $('settings.inlinePromptDesc'),
                control: {
                    type: 'textarea',
                    key: 'inlinePolishPrompt',
                    placeholder: $('settings.inlinePromptPlaceholder'),
                    rows: 2,
                },
            },
            {
                name: $('settings.inlineExpandPrompt'),
                desc: $('settings.inlinePromptDesc'),
                control: {
                    type: 'textarea',
                    key: 'inlineExpandPrompt',
                    placeholder: $('settings.inlinePromptPlaceholder'),
                    rows: 2,
                },
            },
            {
                name: $('settings.inlineShortenPrompt'),
                desc: $('settings.inlinePromptDesc'),
                control: {
                    type: 'textarea',
                    key: 'inlineShortenPrompt',
                    placeholder: $('settings.inlinePromptPlaceholder'),
                    rows: 2,
                },
            },
            {
                name: $('settings.inlineContinuePrompt'),
                desc: $('settings.inlinePromptDesc'),
                control: {
                    type: 'textarea',
                    key: 'inlineContinuePrompt',
                    placeholder: $('settings.inlinePromptPlaceholder'),
                    rows: 2,
                },
            },
            {
                name: $('settings.enableInlineEdit'),
                desc: $('settings.enableInlineEditDesc'),
                control: {
                    type: 'toggle',
                    key: 'enableInlineEdit',
                },
            },
            {
                name: $('settings.enableQuickCommands'),
                desc: $('settings.enableQuickCommandsDesc'),
                control: {
                    type: 'toggle',
                    key: 'enableQuickCommands',
                },
            },
            {
                name: $('settings.enableChatHistory'),
                desc: $('settings.chatHistoryDesc'),
                control: {
                    type: 'toggle',
                    key: 'enableChatHistory',
                },
            },
            {
                name: $('settings.chatHistoryFolder'),
                desc: $('settings.chatHistoryFolderDesc'),
                control: {
                    type: 'text',
                    key: 'chatHistoryFolder',
                    placeholder: 'FleurPilot',
                },
            },
        ];
    }

    /**
     * 描述密钥当前保存在哪里，措辞与「密钥保存位置」设置保持一致。
     */
    private secretDesc($: (key: string, fb?: string) => string): string {
        if (!this.plugin.secretStorageAvailable) {
            return $('settings.apiKeyDescUnavailable');
        }
        return this.plugin.secretBackend === 'system'
            ? $('settings.apiKeyDescSystem')
            : $('settings.apiKeyDescVault');
    }
}