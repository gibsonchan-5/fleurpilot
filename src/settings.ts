// settings.ts - FleurPilot配置
import { App, PluginSettingTab, Setting, Platform } from 'obsidian';
import type FleurPilotPlugin from './main';
import { t, LANG_LABELS, Lang } from './i18n';

/**
 * 预设模型配置
 */
export interface ModelPreset {
    id: string;
    name: string;
    baseUrl: string;
    model: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
    {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
    },
    {
        id: 'qwen',
        name: '通义千问 (DashScope)',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: 'qwen-plus',
    },
    {
        id: 'glm',
        name: '智谱 (GLM)',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4-flash',
    },
    {
        id: 'siliconflow',
        name: '硅基流动',
        baseUrl: 'https://api.siliconflow.cn/v1',
        model: 'Qwen/Qwen2.5-72B-Instruct',
    },
    {
        id: 'custom',
        name: '自定义',
        baseUrl: '',
        model: '',
    },
];

/**
 * 插件设置接口
 */
export interface FleurPilotSettings {
    // 模型配置
    provider: string;          // 当前选择的预设 ID
    baseUrl: string;           // API Base URL
    apiKey: string;            // API Key
    model: string;             // 模型名称
    reasoningModel: string;    // 推理模式使用的模型（如 deepseek-reasoner）

    // 生成参数
    systemPrompt: string;      // 系统提示词
    temperature: number;       // 温度
    maxTokens: number;         // 最大 token 数

    // 功能开关
    enableContext: boolean;    // 自动携带当前笔记上下文
    enableInlineEdit: boolean; // 内联编辑
    enableQuickCommands: boolean; // 快捷命令

    // 界面
    language: Lang;            // 界面语言
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
    language: 'zh-CN',
};

/**
 * 设置面板
 */
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

        // ── 模型配置 ──
        containerEl.createEl('h3', { text: $('settings.modelConfig'), cls: 'mb-settings-section-title' });

        // 预设选择
        new Setting(containerEl)
            .setName($('settings.provider'))
            .setDesc($('settings.providerDesc'))
            .addDropdown(dropdown => {
                MODEL_PRESETS.forEach(p => dropdown.addOption(p.id, p.name));
                dropdown.setValue(this.plugin.settings.provider);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.provider = value;
                    const preset = MODEL_PRESETS.find(p => p.id === value);
                    if (preset && preset.id !== 'custom') {
                        this.plugin.settings.baseUrl = preset.baseUrl;
                        this.plugin.settings.model = preset.model;
                    }
                    await this.plugin.saveSettings();
                    this.display(); // 刷新面板
                });
            });

        // API Base URL
        new Setting(containerEl)
            .setName($('settings.baseUrl'))
            .setDesc($('settings.baseUrlDesc'))
            .addText(text => text
                .setPlaceholder($('settings.baseUrlPlaceholder'))
                .setValue(this.plugin.settings.baseUrl)
                .onChange(async (value) => {
                    this.plugin.settings.baseUrl = value;
                    await this.plugin.saveSettings();
                }));

        // API Key
        new Setting(containerEl)
            .setName($('settings.apiKey'))
            .setDesc($('settings.apiKeyDesc'))
            .addText(text => {
                text
                    .setPlaceholder($('settings.apiKeyPlaceholder'))
                    .setValue(this.plugin.settings.apiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.apiKey = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.type = 'password';
            });

        // 模型名称
        new Setting(containerEl)
            .setName($('settings.model'))
            .setDesc($('settings.modelDesc'))
            .addText(text => text
                .setPlaceholder($('settings.modelPlaceholder'))
                .setValue(this.plugin.settings.model)
                .onChange(async (value) => {
                    this.plugin.settings.model = value;
                    await this.plugin.saveSettings();
                }));

        // 推理模型
        new Setting(containerEl)
            .setName($('settings.reasoningModel'))
            .setDesc($('settings.reasoningModelDesc'))
            .addText(text => text
                .setPlaceholder($('settings.reasoningModelPlaceholder'))
                .setValue(this.plugin.settings.reasoningModel)
                .onChange(async (value) => {
                    this.plugin.settings.reasoningModel = value;
                    await this.plugin.saveSettings();
                }));

        // ── 生成参数 ──
        containerEl.createEl('h3', { text: $('settings.generationParams'), cls: 'mb-settings-section-title' });

        // 系统提示词
        new Setting(containerEl)
            .setName($('settings.systemPrompt'))
            .setDesc($('settings.systemPromptDesc'))
            .addTextArea(text => {
                text
                    .setPlaceholder($('settings.systemPromptPlaceholder'))
                    .setValue(this.plugin.settings.systemPrompt)
                    .onChange(async (value) => {
                        this.plugin.settings.systemPrompt = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 6;
                text.inputEl.style.minWidth = '320px';
                text.inputEl.style.maxWidth = '100%';
                text.inputEl.style.textAlign = 'left';
                text.inputEl.style.fontFamily = 'var(--font-monospace)';
                text.inputEl.style.fontSize = '12px';
                text.inputEl.style.lineHeight = '1.55';
                text.inputEl.style.padding = '10px 12px';
                text.inputEl.style.resize = 'vertical';
                text.inputEl.rows = 4;
                text.inputEl.cols = 50;
            });

        // 温度
        new Setting(containerEl)
            .setName($('settings.temperature'))
            .setDesc($('settings.temperatureDesc'))
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.temperature)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.temperature = value;
                    await this.plugin.saveSettings();
                }));

        // 最大 token 数
        new Setting(containerEl)
            .setName($('settings.maxTokens'))
            .setDesc($('settings.maxTokensDesc'))
            .addSlider(slider => slider
                .setLimits(512, 16384, 512)
                .setValue(this.plugin.settings.maxTokens)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.maxTokens = value;
                    await this.plugin.saveSettings();
                }));

        // ── 功能开关 ──
        containerEl.createEl('h3', { text: $('settings.featureSettings'), cls: 'mb-settings-section-title' });

        const addCheckboxSetting = (
            name: string,
            desc: string,
            getValue: () => boolean,
            onChange: (val: boolean) => void,
        ) => {
            const item = containerEl.createDiv({ cls: 'setting-item' });
            const info = item.createDiv({ cls: 'setting-item-info' });
            info.createDiv({ cls: 'setting-item-name', text: name });
            info.createDiv({ cls: 'setting-item-description', text: desc });
            const control = item.createDiv({ cls: 'setting-item-control mb-checkbox-control' });
            const checkbox = control.createEl('input', {
                type: 'checkbox',
                cls: 'mb-settings-checkbox',
            });
            checkbox.checked = getValue();
            checkbox.addEventListener('change', async () => {
                onChange(checkbox.checked);
                await this.plugin.saveSettings();
            });
        };

        addCheckboxSetting(
            $('settings.enableContext'),
            $('settings.enableContextDesc'),
            () => this.plugin.settings.enableContext,
            (val) => { this.plugin.settings.enableContext = val; },
        );

        addCheckboxSetting(
            $('settings.enableInlineEdit'),
            $('settings.enableInlineEditDesc'),
            () => this.plugin.settings.enableInlineEdit,
            (val) => { this.plugin.settings.enableInlineEdit = val; },
        );

        addCheckboxSetting(
            $('settings.enableQuickCommands'),
            $('settings.enableQuickCommandsDesc'),
            () => this.plugin.settings.enableQuickCommands,
            (val) => { this.plugin.settings.enableQuickCommands = val; },
        );

        // ── 界面语言 ──
        containerEl.createEl('h3', { text: $('settings.language'), cls: 'mb-settings-section-title' });

        new Setting(containerEl)
            .setName($('settings.language'))
            .setDesc($('settings.languageDesc'))
            .addDropdown(dropdown => {
                (Object.keys(LANG_LABELS) as Lang[]).forEach(lang => {
                    dropdown.addOption(lang, LANG_LABELS[lang]);
                });
                dropdown.setValue(this.plugin.settings.language);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.language = value as Lang;
                    await this.plugin.saveSettings();
                    this.display(); // 刷新面板以应用新语言
                });
            });

        // ── 连接测试 ──
        containerEl.createEl('h3', { text: $('settings.connectionTest'), cls: 'mb-settings-section-title' });

        new Setting(containerEl)
            .setName($('settings.testConnection'))
            .setDesc($('settings.testConnectionDesc'))
            .addButton(btn => btn
                .setButtonText($('settings.testBtn'))
                .setCta()
                .onClick(async () => {
                    btn.setDisabled(true);
                    btn.setButtonText($('settings.testing'));
                    try {
                        const { LLMService } = await import('./core/llm-service');
                        const llm = new LLMService(this.plugin.settings);
                        let result = '';
                        await llm.sendMessage(
                            [{ role: 'user', content: $('settings.connectionTestPrompt') }],
                            (chunk) => { result += chunk; },
                            () => {},
                        );
                        btn.setButtonText(result ? `${$('settings.connected')} · ${result.slice(0, 20)}` : $('settings.connected'));
                    } catch (e: any) {
                        btn.setButtonText(`${$('settings.connectionFailed')}：${e.message.slice(0, 30)}`);
                        btn.buttonEl.classList.add('mod-warning');
                    }
                    setTimeout(() => {
                        btn.setButtonText($('settings.testBtn'));
                        btn.setDisabled(false);
                        btn.buttonEl.classList.remove('mod-warning');
                    }, 5000);
                }));
    }
}
