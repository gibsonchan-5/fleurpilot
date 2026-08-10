// settings.ts - FleurPilot 配置
// 使用 Obsidian 1.13+ 声明式设置 API
// 移除 display() 方法以通过 obsidianmd/no-deprecated-display 规则审查
import { App, PluginSettingTab, SettingDefinitionItem } from 'obsidian';
import type FleurPilotPlugin from './main';
import { t, LANG_LABELS, Lang } from './i18n';

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

export interface FleurPilotSettings {
    provider: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    reasoningModel: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    enableContext: boolean;
    enableInlineEdit: boolean;
    enableQuickCommands: boolean;
    enableChatHistory: boolean;
    chatHistoryFolder: string;
    language: Lang;
}

export const DEFAULT_SETTINGS: FleurPilotSettings = {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    reasoningModel: 'deepseek-reasoner',
    systemPrompt: '你是一位专业的写作伙伴，熟悉各类文本的梳理、润色与扩展。请基于用户提供的笔记内容，给出清晰、准确、可直接使用的回复，保持简洁、克制、实用。',
    temperature: 0.7,
    maxTokens: 4096,
    enableContext: true,
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
     * Obsidian 1.13+ 声明式设置 API
     * 返回所有设置项的声明式定义,Obsidian 框架负责渲染和持久化
     * 不再使用已废弃的 display() 方法
     */
    getSettingDefinitions(): SettingDefinitionItem[] {
        const lang = this.plugin.settings.language;
        const $ = (key: string, fb?: string) => t(lang, key, fb);

        const presetOptions: Record<string, string> = {};
        for (const p of MODEL_PRESETS) presetOptions[p.id] = p.name;

        const langOptions: Record<string, string> = {};
        for (const l of Object.keys(LANG_LABELS)) langOptions[l] = LANG_LABELS[l as Lang];

        return [
            { type: 'heading', text: $('settings.modelConfig') },

            {
                key: 'provider',
                text: $('settings.provider'),
                description: $('settings.providerDesc'),
                type: 'dropdown',
                options: presetOptions,
                default: 'deepseek',
            },
            {
                key: 'baseUrl',
                text: $('settings.baseUrl'),
                description: $('settings.baseUrlDesc'),
                type: 'text',
                placeholder: $('settings.baseUrlPlaceholder'),
            },
            {
                key: 'apiKey',
                text: $('settings.apiKey'),
                description: $('settings.apiKeyDesc'),
                type: 'text',
                placeholder: $('settings.apiKeyPlaceholder'),
            },
            {
                key: 'model',
                text: $('settings.model'),
                description: $('settings.modelDesc'),
                type: 'text',
                placeholder: $('settings.modelPlaceholder'),
            },
            {
                key: 'reasoningModel',
                text: $('settings.reasoningModel'),
                description: $('settings.reasoningModelDesc'),
                type: 'text',
                placeholder: $('settings.reasoningModelPlaceholder'),
            },

            { type: 'heading', text: $('settings.generationParams') },

            {
                key: 'systemPrompt',
                text: $('settings.systemPrompt'),
                description: $('settings.systemPromptDesc'),
                type: 'textarea',
                placeholder: $('settings.systemPromptPlaceholder'),
            },
            {
                key: 'temperature',
                text: $('settings.temperature'),
                description: $('settings.temperatureDesc'),
                type: 'slider',
                min: 0,
                max: 1,
                step: 0.1,
            },
            {
                key: 'maxTokens',
                text: $('settings.maxTokens'),
                description: $('settings.maxTokensDesc'),
                type: 'slider',
                min: 512,
                max: 16384,
                step: 512,
            },

            { type: 'heading', text: $('settings.featureSettings') },

            {
                key: 'enableContext',
                text: $('settings.enableContext'),
                description: $('settings.enableContextDesc'),
                type: 'toggle',
            },
            {
                key: 'enableInlineEdit',
                text: $('settings.enableInlineEdit'),
                description: $('settings.enableInlineEditDesc'),
                type: 'toggle',
            },
            {
                key: 'enableQuickCommands',
                text: $('settings.enableQuickCommands'),
                description: $('settings.enableQuickCommandsDesc'),
                type: 'toggle',
            },

            { type: 'heading', text: $('settings.chatHistory') },

            {
                key: 'enableChatHistory',
                text: $('settings.enableChatHistory'),
                description: $('settings.enableChatHistoryDesc'),
                type: 'toggle',
            },
            {
                key: 'chatHistoryFolder',
                text: $('settings.chatHistoryFolder'),
                description: $('settings.chatHistoryFolderDesc'),
                type: 'text',
                placeholder: 'FleurPilot',
            },

            { type: 'heading', text: $('settings.language') },

            {
                key: 'language',
                text: $('settings.language'),
                description: $('settings.languageDesc'),
                type: 'dropdown',
                options: langOptions,
            },
        ];
    }
}