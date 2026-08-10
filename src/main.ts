// main.ts — FleurPilot 插件入口
import { App, Plugin, Notice, Editor, Menu, Modal, Setting } from 'obsidian';
import { FleurPilotSettings, DEFAULT_SETTINGS, FleurPilotSettingTab, applyProviderPreset, MODEL_PRESETS } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './views/chat-view';
import { InlineEditModal, InlineEditAction } from './modals/inline-edit';
import { WritingAssistantModal, WritingTask } from './modals/writing-assistant';
import { t } from './i18n';

/** 自定义输入 Modal（替代 prompt） */
class CustomInputModal extends Modal {
    private onSubmit: (value: string) => void;
    private inputEl!: HTMLInputElement;

    constructor(app: App, onSubmit: (value: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        new Setting(contentEl).setName('自定义指令').setHeading();
        this.inputEl = contentEl.createEl('input', { type: 'text', cls: 'mb-custom-input' });
        const btn = contentEl.createEl('button', { text: '确认' });
        btn.addEventListener('click', () => {
            this.onSubmit(this.inputEl.value);
            this.close();
        });

        this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                this.onSubmit(this.inputEl.value);
                this.close();
            }
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

export default class FleurPilotPlugin extends Plugin {
    settings!: FleurPilotSettings;

    /** i18n helper */
    $ = (key: string, fb?: string) => t(this.settings.language, key, fb);

    async onload() {
        await this.loadSettings();

        // 注册视图
        this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

        // Ribbon
        this.addRibbonIcon('pen-tool', this.$('chat.title'), () => { void this.activateChatView(); });

        // 基础命令
        this.addCommand({
            id: 'open-chat',
            name: this.$('command.openChat'),
            callback: () => { void this.activateChatView(); },
        });
        this.addCommand({
            id: 'new-chat',
            name: this.$('command.newChat'),
            callback: () => { void this.activateChatView(true); },
        });

        // 右键上下文菜单
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
                const selected = editor.getSelection();
                if (!selected) return;

                menu.addSeparator();

                // 子菜单：FleurPilot
                menu.addItem((item) => {
                    item.setTitle(this.$('chat.title')).setIcon('feather');
                    // Obsidian's MenuItem.setSubmenu() is typed as `this` (MenuItem) but actually returns a Menu; explicit cast is required.
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- Obsidian typings return `this` but runtime returns Menu
                    const submenu: Menu = item.setSubmenu();

                    // 询问类
                    submenu.addItem((sub) => {
                        sub.setTitle(this.$('menu.askAI')).onClick(() => {
                            void this.activateChatView();
                            window.setTimeout(() => {
                                const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];
                                if (leaf) {
                                    (leaf.view as ChatView).askAboutSelection(selected);
                                }
                            }, 300);
                        });
                    });
                    submenu.addItem((sub) => {
                        sub.setTitle(this.$('menu.detailExplain')).onClick(() => {
                            void this.activateChatView();
                            window.setTimeout(() => {
                                const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];
                                if (leaf) {
                                    (leaf.view as ChatView).askAboutSelection(
                                        `请详细解释以下文本的含义、背景和关键概念：\n\n"${selected}"`
                                    );
                                }
                            }, 300);
                        });
                    });

                    submenu.addSeparator();

                    // 侵入式编辑
                    const editActions: { id: InlineEditAction; label: string }[] = [
                        { id: 'polish', label: this.$('menu.polish') },
                        { id: 'simplify', label: this.$('menu.shorten') },
                        { id: 'expand', label: this.$('menu.expand') },
                        { id: 'translate_zh', label: this.$('menu.translateCN') },
                        { id: 'translate_en', label: this.$('menu.translateEN') },
                        { id: 'proofread', label: this.$('menu.proofread') },
                    ];

                    for (const act of editActions) {
                        submenu.addItem((sub) => {
                            sub.setTitle(act.label).onClick(() => {
                                new InlineEditModal(
                                    this.app, this, selected, act.id, '',
                                    (result) => editor.replaceSelection(result)
                                ).open();
                            });
                        });
                    }

                    submenu.addSeparator();

                    // 自定义改写
                    submenu.addItem((sub) => {
                        sub.setTitle(this.$('menu.custom')).onClick(() => {
                            new CustomInputModal(this.app, (instruction) => {
                                if (!instruction) return;
                                new InlineEditModal(
                                    this.app, this, selected, 'custom', instruction,
                                    (result) => editor.replaceSelection(result)
                                ).open();
                            }).open();
                        });
                    });
                });
            })
        );

        // 内联编辑命令
        this.registerInlineEditCommand('explain', this.$('command.explain'));
        this.registerInlineEditCommand('simplify', this.$('command.shorten'));
        this.registerInlineEditCommand('expand', this.$('command.expand'));
        this.registerInlineEditCommand('polish', this.$('command.polish'));
        this.registerInlineEditCommand('translate_zh', this.$('command.translateCN'));
        this.registerInlineEditCommand('translate_en', this.$('command.translateEN'));
        this.registerInlineEditCommand('proofread', this.$('command.proofread'));

        // 写作助手命令
        this.registerWritingCommand('review', this.$('command.reviewNote'));
        this.registerWritingCommand('suggest', this.$('command.writingAdvice'));
        this.registerWritingCommand('structure', this.$('command.analyzeStructure'));
        this.registerWritingCommand('tone', this.$('command.analyzeTone'));
        this.registerWritingCommand('summary', this.$('command.generateSummary'));

        // 自定义改写命令
        this.addCommand({
            id: 'custom-rewrite',
            name: this.$('command.customRewrite'),
            editorCallback: (editor: Editor) => {
                const selectedText = editor.getSelection();
                if (!selectedText) {
                    new Notice(this.$('notice.selectText'));
                    return;
                }
                new CustomInputModal(this.app, (instruction) => {
                    if (!instruction) return;
                    new InlineEditModal(
                        this.app, this, selectedText, 'custom', instruction,
                        (result) => editor.replaceSelection(result)
                    ).open();
                }).open();
            },
        });

        // 应用 provider 预设（声明式 API 不支持 onChange 联动,改为命令触发）
        this.addCommand({
            id: 'apply-provider-preset',
            name: this.$('command.applyProviderPreset'),
            callback: () => {
                this.settings = applyProviderPreset(this.settings);
                const preset = MODEL_PRESETS.find(p => p.id === this.settings.provider);
                if (preset && preset.id !== 'custom') {
                    new Notice(this.$('notice.presetApplied', `${preset.name}`));
                } else {
                    new Notice(this.$('notice.presetCustom'));
                }
                void this.saveSettings();
            },
        });

        // 测试 LLM 连接（替代设置页面中的测试按钮）
        this.addCommand({
            id: 'test-connection',
            name: this.$('command.testConnection'),
            callback: () => {
                void (async () => {
                    try {
                        const { LLMService } = await import('./core/llm-service');
                        const llm = new LLMService(this.settings);
                        let result = '';
                        await llm.sendMessage(
                            [{ role: 'user' as const, content: this.$('settings.connectionTestPrompt') }],
                            (chunk) => { result += chunk; },
                            () => { /* done */ },
                        );
                        new Notice(this.$('notice.testSuccess', result.slice(0, 30)));
                    } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message.slice(0, 50) : 'Unknown';
                        new Notice(this.$('notice.testFailed', msg));
                    }
                })();
            },
        });

        this.addSettingTab(new FleurPilotSettingTab(this.app, this));
    }

    async loadSettings(): Promise<void> {
        // Obsidian's Plugin.loadData() returns Promise<any> in its type declarations; cast is required.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- Obsidian typings return Promise<any> for saved data
        const raw = await this.loadData();
        const data = raw as Partial<FleurPilotSettings> | undefined;
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...(data ?? {}),
        };
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateChatView(newChat = false) {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];

        if (!leaf) {
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                await rightLeaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
                leaf = rightLeaf;
            }
        }

        if (leaf) {
            void workspace.revealLeaf(leaf);
            if (newChat) {
                (leaf.view as ChatView).startNewChat();
            }
        }
    }

    private registerInlineEditCommand(action: InlineEditAction, name: string) {
        this.addCommand({
            id: `inline-edit-${action}`,
            name,
            editorCallback: (editor: Editor) => {
                const selectedText = editor.getSelection();
                if (!selectedText) {
                    new Notice(this.$('notice.selectText'));
                    return;
                }
                new InlineEditModal(
                    this.app, this, selectedText, action, '',
                    (result) => editor.replaceSelection(result)
                ).open();
            },
        });
    }

    private registerWritingCommand(task: WritingTask, name: string) {
        this.addCommand({
            id: `writing-${task}`,
            name,
            checkCallback: (checking) => {
                const file = this.app.workspace.getActiveFile();
                if (!file || file.extension !== 'md') return false;
                if (checking) return true;
                void this.app.vault.read(file).then((content) => {
                    new WritingAssistantModal(this.app, this, content, file.basename, task).open();
                });
                return true;
            },
        });
    }
}
