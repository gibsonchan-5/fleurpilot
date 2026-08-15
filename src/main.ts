// main.ts — FleurPilot 插件入口
import { App, Plugin, Notice, Editor, Menu, Modal, Setting } from 'obsidian';
import { FleurPilotSettings, DEFAULT_SETTINGS, FleurPilotSettingTab, applyProviderPreset, MODEL_PRESETS } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './views/chat-view';
import { InlineEditModal, InlineEditAction } from './modals/inline-edit';
import { WritingAssistantModal, WritingTask } from './modals/writing-assistant';
import { t } from './i18n';

/** 自定义输入 Modal — 美化版 */
class CustomInputModal extends Modal {
    private onSubmit: (value: string) => void;
    private textareaEl!: HTMLTextAreaElement;
    private sendBtn!: HTMLButtonElement;

    constructor(app: App, onSubmit: (value: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('mb-custom-input-modal');
        this.modalEl.addClass('mb-custom-modal');

        // ── 头部 ──
        const header = contentEl.createDiv({ cls: 'mb-custom-header' });
        header.createSpan({ text: '✦', cls: 'mb-custom-header-icon' });
        header.createEl('h3', { text: '自定义改写指令' });

        // ── 快捷提示 ──
        const chipRow = contentEl.createDiv({ cls: 'mb-custom-chips' });
        const suggestions = ['改成文言文', '更幽默的语气', '精简到 100 字', '学术论文风格', '更口语化', '用比喻重写'];
        for (const s of suggestions) {
            const chip = chipRow.createSpan({ text: s, cls: 'mb-custom-chip' });
            chip.addEventListener('click', () => {
                this.textareaEl.value = s;
                this.textareaEl.focus();
                this.updateSendState();
            });
        }

        // ── 输入区 ──
        const wrap = contentEl.createDiv({ cls: 'mb-custom-input-wrap' });
        this.textareaEl = wrap.createEl('textarea', {
            cls: 'mb-custom-textarea',
            attr: { placeholder: '输入改写要求… 例如：改成鲁迅的风格' },
        });
        this.textareaEl.addEventListener('input', () => this.updateSendState());
        this.textareaEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.doSubmit();
            }
        });

        // ── 底部 ──
        const footer = contentEl.createDiv({ cls: 'mb-custom-footer' });
        const hint = footer.createDiv({ cls: 'mb-custom-footer-hint' });
        hint.createEl('kbd', { text: 'Enter' });
        hint.createSpan({ text: ' 发送 ' });
        hint.createEl('kbd', { text: '⇧' });
        hint.createSpan({ text: ' 换行' });

        const btnGroup = footer.createDiv({ cls: 'mb-custom-footer-btns' });
        const cancelBtn = btnGroup.createEl('button', { text: '取消', cls: 'mb-btn mb-btn-cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        this.sendBtn = btnGroup.createEl('button', { text: '发送', cls: 'mb-btn mb-btn-primary' });
        this.sendBtn.disabled = true;
        this.sendBtn.addEventListener('click', () => this.doSubmit());

        this.textareaEl.focus();
    }

    private updateSendState() {
        if (this.sendBtn) this.sendBtn.disabled = !this.textareaEl.value.trim();
    }

    private doSubmit() {
        const v = this.textareaEl.value.trim();
        if (!v) return;
        this.onSubmit(v);
        this.close();
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
