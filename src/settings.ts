// settings.ts - FleurPilot 配置
// 使用 Obsidian 1.13+ 声明式设置 API
// 移除 display() 方法以通过 obsidianmd/no-deprecated-display 规则审查
import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
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
    display(): void {
        this.containerEl.empty();
        const lang = this.plugin.settings.language;
        const $ = (key: string, fb?: string) => t(lang, key, fb);

        new Setting(this.containerEl).setName($('settings.modelConfig')).setHeading();

        const presetOptions: Record<string, string> = {};
        for (const p of MODEL_PRESETS) presetOptions[p.id] = p.name;

        new Setting(this.containerEl)
            .setName($('settings.provider'))
            .setDesc($('settings.providerDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions(presetOptions)
                .setValue(this.plugin.settings.provider)
                .onChange(async (value) => {
                    this.plugin.settings.provider = value;
                    await this.plugin.saveSettings();
                    applyProviderPreset(this.plugin.settings);
                    await this.plugin.saveSettings();
                    this.update();
                }));

        new Setting(this.containerEl)
            .setName($('settings.baseUrl'))
            .setDesc($('settings.baseUrlDesc'))
            .addText(text => text
                .setPlaceholder($('settings.baseUrlPlaceholder'))
                .setValue(this.plugin.settings.baseUrl)
                .onChange(async (value) => {
                    this.plugin.settings.baseUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl)
            .setName($('settings.apiKey'))
            .setDesc($('settings.apiKeyDesc'))
            .addText(text => text
                .setPlaceholder($('settings.apiKeyPlaceholder'))
                .setValue(this.plugin.settings.apiKey || '')
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl)
            .setName($('settings.model'))
            .setDesc($('settings.modelDesc'))
            .addText(text => text
                .setPlaceholder($('settings.modelPlaceholder'))
                .setValue(this.plugin.settings.model)
                .onChange(async (value) => {
                    this.plugin.settings.model = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl)
            .setName($('settings.reasoningModel'))
            .setDesc($('settings.reasoningModelDesc'))
            .addText(text => text
                .setPlaceholder($('settings.reasoningModelPlaceholder'))
                .setValue(this.plugin.settings.reasoningModel)
                .onChange(async (value) => {
                    this.plugin.settings.reasoningModel = value;
                    await this.plugin.saveSettings();
                }));

        // 连接测试按钮
        new Setting(this.containerEl)
            .setName($('settings.testConnection'))
            .setDesc($('settings.testConnectionDesc'))
            .addButton(button => button
                .setButtonText($('settings.testBtn'))
                .onClick(async () => {
                    const originalText = button.buttonEl.textContent;
                    button.setButtonText($('settings.testing'));
                    button.setDisabled(true);

                    try {
                        const { LLMService } = await import('./core/llm-service');
                        const llm = new LLMService(this.plugin.settings);
                        let result = '';

                        await llm.sendMessage(
                            [{ role: 'user', content: $('settings.connectionTestPrompt') }],
                            (chunk) => { result += chunk; },
                            () => { /* done */ },
                        );

                        new Notice($('notice.testSuccess', { response: result.slice(0, 30) }));
                    } catch (error: unknown) {
                        const msg = error instanceof Error ? error.message.slice(0, 50) : 'Unknown error';
                        new Notice($('notice.testFailed', { error: msg }));
                    } finally {
                        button.setButtonText(originalText || $('settings.testBtn'));
                        button.setDisabled(false);
                    }
                }));

        new Setting(this.containerEl).setName($('settings.generationParams')).setHeading();

        new Setting(this.containerEl)
            .setName($('settings.systemPrompt'))
            .setDesc($('settings.systemPromptDesc'))
            .addTextArea(text => text
                .setPlaceholder($('settings.systemPromptPlaceholder'))
                .setValue(this.plugin.settings.systemPrompt)
                .onChange(async (value) => {
                    this.plugin.settings.systemPrompt = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl)
            .setName($('settings.temperature'))
            .setDesc($('settings.temperatureDesc'))
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
            .setValue(this.plugin.settings.temperature)
            .onChange(async (value) => {
                    this.plugin.settings.temperature = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl)
            .setName($('settings.maxTokens'))
            .setDesc($('settings.maxTokensDesc'))
            .addSlider(slider => slider
                .setLimits(512, 16384, 512)
            .setValue(this.plugin.settings.maxTokens)
            .onChange(async (value) => {
                    this.plugin.settings.maxTokens = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl).setName($('settings.featureSettings')).setHeading();

        new Setting(this.containerEl)
            .setName($('settings.enableContext'))
            .setDesc($('settings.enableContextDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableContext)
                .onChange(async (value) => {
                    this.plugin.settings.enableContext = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl)
            .setName($('settings.enableInlineEdit'))
            .setDesc($('settings.enableInlineEditDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableInlineEdit)
                .onChange(async (value) => {
                    this.plugin.settings.enableInlineEdit = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl)
            .setName($('settings.enableQuickCommands'))
            .setDesc($('settings.enableQuickCommandsDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableQuickCommands)
                .onChange(async (value) => {
                    this.plugin.settings.enableQuickCommands = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl).setName($('settings.chatHistory')).setHeading();

        new Setting(this.containerEl)
            .setName($('settings.enableChatHistory'))
            .setDesc($('settings.enableChatHistoryDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableChatHistory)
                .onChange(async (value) => {
                    this.plugin.settings.enableChatHistory = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl)
            .setName($('settings.chatHistoryFolder'))
            .setDesc($('settings.chatHistoryFolderDesc'))
            .addText(text => text
                .setPlaceholder('FleurPilot')
                .setValue(this.plugin.settings.chatHistoryFolder)
                .onChange(async (value) => {
                    this.plugin.settings.chatHistoryFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.containerEl).setName($('settings.language')).setHeading();

        const langOptions: Record<string, string> = {};
        for (const l of Object.keys(LANG_LABELS)) langOptions[l] = LANG_LABELS[l as Lang];

        new Setting(this.containerEl)
            .setName($('settings.language'))
            .setDesc($('settings.languageDesc'))
            .addDropdown(dropdown => dropdown
                .addOptions(langOptions)
                .setValue(this.plugin.settings.language)
                .onChange(async (value) => {
                    this.plugin.settings.language = value as Lang;
                    await this.plugin.saveSettings();
                    this.update();
                }));
    }
}