// settings.ts - FleurPilot配置
import { App, PluginSettingTab, Setting, TFolder } from 'obsidian';
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

export class FleurPilotSettingTab extends PluginSettingTab {
    plugin: FleurPilotPlugin;

    constructor(app: App, plugin: FleurPilotPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('mb-settings');

        const $ = (key: string, fb?: string) => t(this.plugin.settings.language, key, fb);

        // 模型配置
        new Setting(containerEl).setName($('settings.modelConfig')).setHeading();

        new Setting(containerEl)
            .setName($('settings.provider'))
            .setDesc($('settings.providerDesc'))
            .addDropdown(dropdown => {
                MODEL_PRESETS.forEach(p => dropdown.addOption(p.id, p.name));
                dropdown.setValue(this.plugin.settings.provider);
                dropdown.onChange((value) => { void (async () => {
                    this.plugin.settings.provider = value;
                    const preset = MODEL_PRESETS.find(p => p.id === value);
                    if (preset && preset.id !== 'custom') {
                        this.plugin.settings.baseUrl = preset.baseUrl;
                        this.plugin.settings.model = preset.model;
                    }
                    await this.plugin.saveSettings();
                    void this.display();
                })(); });
            });

        new Setting(containerEl)
            .setName($('settings.baseUrl'))
            .setDesc($('settings.baseUrlDesc'))
            .addText(text => text
                .setPlaceholder($('settings.baseUrlPlaceholder'))
                .setValue(this.plugin.settings.baseUrl)
                .onChange((value) => { void (async () => {
                    this.plugin.settings.baseUrl = value;
                    await this.plugin.saveSettings();
                })(); }));

        new Setting(containerEl)
            .setName($('settings.apiKey'))
            .setDesc($('settings.apiKeyDesc'))
            .addText(text => {
                text
                    .setPlaceholder($('settings.apiKeyPlaceholder'))
                    .setValue(this.plugin.settings.apiKey)
                    .onChange((value) => { void (async () => {
                        this.plugin.settings.apiKey = value;
                        await this.plugin.saveSettings();
                    })(); });
                text.inputEl.type = 'password';
            });

        new Setting(containerEl)
            .setName($('settings.model'))
            .setDesc($('settings.modelDesc'))
            .addText(text => text
                .setPlaceholder($('settings.modelPlaceholder'))
                .setValue(this.plugin.settings.model)
                .onChange((value) => { void (async () => {
                    this.plugin.settings.model = value;
                    await this.plugin.saveSettings();
                })(); }));

        new Setting(containerEl)
            .setName($('settings.reasoningModel'))
            .setDesc($('settings.reasoningModelDesc'))
            .addText(text => text
                .setPlaceholder($('settings.reasoningModelPlaceholder'))
                .setValue(this.plugin.settings.reasoningModel)
                .onChange((value) => { void (async () => {
                    this.plugin.settings.reasoningModel = value;
                    await this.plugin.saveSettings();
                })(); }));

        // 生成参数
        new Setting(containerEl).setName($('settings.generationParams')).setHeading();

        new Setting(containerEl)
            .setName($('settings.systemPrompt'))
            .setDesc($('settings.systemPromptDesc'))
            .addTextArea(text => {
                text
                    .setPlaceholder($('settings.systemPromptPlaceholder'))
                    .setValue(this.plugin.settings.systemPrompt)
                    .onChange((value) => { void (async () => {
                        this.plugin.settings.systemPrompt = value;
                        await this.plugin.saveSettings();
                    })(); });
                text.inputEl.addClass('mb_system-prompt-area');
            });

        new Setting(containerEl)
            .setName($('settings.temperature'))
            .setDesc($('settings.temperatureDesc'))
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.temperature)
                .onChange((value) => { void (async () => {
                    this.plugin.settings.temperature = value;
                    await this.plugin.saveSettings();
                })(); }));

        new Setting(containerEl)
            .setName($('settings.maxTokens'))
            .setDesc($('settings.maxTokensDesc'))
            .addSlider(slider => slider
                .setLimits(512, 16384, 512)
                .setValue(this.plugin.settings.maxTokens)
                .onChange((value) => { void (async () => {
                    this.plugin.settings.maxTokens = value;
                    await this.plugin.saveSettings();
                })(); }));

        // 功能开关
        new Setting(containerEl).setName($('settings.featureSettings')).setHeading();

        new Setting(containerEl)
            .setName($('settings.enableContext'))
            .setDesc($('settings.enableContextDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableContext)
                .onChange((value) => { void (async () => {
                    this.plugin.settings.enableContext = value;
                    await this.plugin.saveSettings();
                })(); }));

        new Setting(containerEl)
            .setName($('settings.enableInlineEdit'))
            .setDesc($('settings.enableInlineEditDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableInlineEdit)
                .onChange((value) => { void (async () => {
                    this.plugin.settings.enableInlineEdit = value;
                    await this.plugin.saveSettings();
                })(); }));

        new Setting(containerEl)
            .setName($('settings.enableQuickCommands'))
            .setDesc($('settings.enableQuickCommandsDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableQuickCommands)
                .onChange((value) => { void (async () => {
                    this.plugin.settings.enableQuickCommands = value;
                    await this.plugin.saveSettings();
                })(); }));

        // 对话历史
        new Setting(containerEl).setName($('settings.chatHistory')).setHeading();

        new Setting(containerEl)
            .setName($('settings.enableChatHistory'))
            .setDesc($('settings.enableChatHistoryDesc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableChatHistory)
                .onChange((value) => { void (async () => {
                    this.plugin.settings.enableChatHistory = value;
                    await this.plugin.saveSettings();
                })(); }));

        new Setting(containerEl)
            .setName($('settings.chatHistoryFolder'))
            .setDesc($('settings.chatHistoryFolderDesc'))
            .addDropdown(dropdown => {
                const folders = this.getVaultFolders();
                dropdown.addOption('FleurPilot', 'FleurPilot');
                for (const folder of folders) {
                    dropdown.addOption(folder.path, folder.path);
                }
                if (!this.plugin.settings.chatHistoryFolder) {
                    this.plugin.settings.chatHistoryFolder = 'FleurPilot';
                }
                dropdown.setValue(this.plugin.settings.chatHistoryFolder);
                dropdown.onChange((value) => { void (async () => {
                    this.plugin.settings.chatHistoryFolder = value;
                    await this.plugin.saveSettings();
                })(); });
            });

        // 界面语言
        new Setting(containerEl).setName($('settings.language')).setHeading();

        new Setting(containerEl)
            .setName($('settings.language'))
            .setDesc($('settings.languageDesc'))
            .addDropdown(dropdown => {
                (Object.keys(LANG_LABELS) as Lang[]).forEach(lang => {
                    dropdown.addOption(lang, LANG_LABELS[lang]);
                });
                dropdown.setValue(this.plugin.settings.language);
                dropdown.onChange((value) => { void (async () => {
                    this.plugin.settings.language = value as Lang;
                    await this.plugin.saveSettings();
                    void this.display();
                })(); });
            });

        // 连接测试
        new Setting(containerEl).setName($('settings.connectionTest')).setHeading();

        new Setting(containerEl)
            .setName($('settings.testConnection'))
            .setDesc($('settings.testConnectionDesc'))
            .addButton(btn => btn
                .setButtonText($('settings.testBtn'))
                .setCta()
                .onClick(() => { void (async () => {
                    btn.setDisabled(true);
                    btn.setButtonText($('settings.testing'));
                    try {
                        const { LLMService } = await import('./core/llm-service');
                        const llm = new LLMService(this.plugin.settings);
                        let result = '';
                        await llm.sendMessage(
                            [{ role: 'user' as const, content: $('settings.connectionTestPrompt') }],
                            (chunk) => { result += chunk; },
                            () => { /* done */ },
                        );
                        btn.setButtonText(result ? `${$('settings.connected')} · ${result.slice(0, 20)}` : $('settings.connected'));
                    } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message.slice(0, 30) : 'Unknown';
                        btn.setButtonText(`${$('settings.connectionFailed')}: ${msg}`);
                        btn.buttonEl.classList.add('mod-warning');
                    }
                    window.setTimeout(() => {
                        btn.setButtonText($('settings.testBtn'));
                        btn.setDisabled(false);
                        btn.buttonEl.classList.remove('mod-warning');
                    }, 5000);
                })(); }));
    }

    private getVaultFolders(): TFolder[] {
        const folders: TFolder[] = [];
        const root = this.app.vault.getRoot();
        const collect = (folder: TFolder) => {
            for (const child of folder.children) {
                if (child instanceof TFolder) {
                    folders.push(child);
                    collect(child);
                }
            }
        };
        collect(root);
        return folders;
    }
}
