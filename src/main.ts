// main.ts — FleurPilot 插件入口
import { App, Plugin, Notice, Editor, Menu, Modal } from 'obsidian';
import { FleurPilotSettings, DEFAULT_SETTINGS, FleurPilotSettingTab, applyProviderPreset, MODEL_PRESETS } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './views/chat-view';
import { InlineEditModal, InlineEditAction } from './modals/inline-edit';
import { WritingAssistantModal, WritingTask } from './modals/writing-assistant';
import { t } from './i18n';
import {
    hydrateSecrets,
    scrubSecretsForPersistence,
    secretStorageAvailable,
    migrateSecrets,
    resolveBackend,
    type SecretBackend,
} from './secret-store';

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
    /** 本机 Obsidian 是否支持官方 SecretStorage（系统钥匙串）。 */
    secretStorageAvailable = false;

    /** 当前实际生效的密钥后端（system=钥匙串，vault=data.json 明文）。 */
    get secretBackend(): SecretBackend {
        return resolveBackend(this.app, this.settings.secretStorageMode);
    }

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
                        { id: 'continue', label: this.$('menu.continue') },
                        { id: 'translate_zh', label: this.$('menu.translateCN') },
                        { id: 'translate_en', label: this.$('menu.translateEN') },
                        { id: 'proofread', label: this.$('menu.proofread') },
                    ];

                    for (const act of editActions) {
                        submenu.addItem((sub) => {
                            sub.setTitle(act.label).onClick(() => {
                                new InlineEditModal(
                                    this.app, this, selected, act.id, '',
                                    (result) => this.applyEditResult(editor, act.id, result)
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
        this.registerInlineEditCommand('continue', this.$('command.continue'));
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

        // API Key 存入系统钥匙串；磁盘上若还留有明文，在这里迁走并清掉。
        // 用户切到 data.json 模式时则反其道行之：文件即真相，不写钥匙串。
        this.secretStorageAvailable = secretStorageAvailable(this.app);
        const secretState = await hydrateSecrets(
            this.app,
            this.settings as unknown as Record<string, unknown>,
            data as Record<string, unknown> | undefined,
            this.secretBackend,
        );
        if (secretState.migrated.length > 0) {
            await this.saveSettings();
            new Notice(this.$('notice.apiKeyMoved', 'API Key 已移入系统钥匙串，data.json 中不再保存明文'));
        }
    }

    /**
     * 所有落盘路径的总闸门。
     *
     * Obsidian 1.13 的声明式设置框架（PluginSettingTab.setControlValue）会直接调用
     * plugin.saveData(plugin.settings) 落盘，绕过插件的 saveSettings()。只有在这里
     * 统一处理，才能保证任何写入路径都不会把明文写进 data.json —— 钥匙串模式下
     * 写盘前抹掉密钥；data.json 模式下原样落盘（明文正是用户的选择）。
     */
    async saveData(data: unknown): Promise<void> {
        const payload = (data ?? {}) as Record<string, unknown>;
        await super.saveData(await scrubSecretsForPersistence(this.app, payload, this.secretBackend));
    }

    async saveSettings() {
        // 密钥只写系统钥匙串；saveData 会在写盘前从副本里抹掉（钥匙串不可用时保留明文，避免丢密钥）
        await this.saveData(this.settings);
    }

    /**
     * 切换密钥保存位置并搬迁现有密钥。
     *
     * 搬入钥匙串逐字段校验；任何一步写不进去就回滚到原模式，
     * 宁可维持明文也不丢密钥。
     */
    async setSecretStorageMode(
        mode: 'system' | 'vault',
    ): Promise<{ ok: boolean; failed: string[] }> {
        const previous = this.settings.secretStorageMode;
        const target = resolveBackend(this.app, mode);

        this.settings.secretStorageMode = mode;
        const result = await migrateSecrets(
            this.app,
            this.settings as unknown as Record<string, unknown>,
            target,
        );

        if (!result.ok) {
            this.settings.secretStorageMode = previous;
            await this.saveSettings();
            return { ok: false, failed: [...result.failed] };
        }

        await this.saveSettings();
        return { ok: true, failed: [] };
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

    /**
     * 应用改写结果到编辑器。
     * 续写（continue）保留原文、在选区末尾追加；其余动作用结果替换选中文本。
     */
    private applyEditResult(editor: Editor, action: InlineEditAction, result: string) {
        if (action === 'continue') {
            // 只在选区末尾插入，原文保持不动
            editor.replaceRange(result, editor.getCursor('to'));
        } else {
            editor.replaceSelection(result);
        }
    }

    /** 获取光标前的文本，供无选区续写时作为上下文（最多约 3000 字符） */
    private getPrecedingText(editor: Editor): string {
        const cursor = editor.getCursor();
        const from = { line: Math.max(0, cursor.line - 100), ch: 0 };
        return editor.getRange(from, cursor).slice(-3000);
    }

    private registerInlineEditCommand(action: InlineEditAction, name: string) {
        this.addCommand({
            id: `inline-edit-${action}`,
            name,
            editorCallback: (editor: Editor) => {
                // 续写允许无选区：取光标前的内容作为上下文，直接在光标处接着写
                const selectedText = editor.getSelection()
                    || (action === 'continue' ? this.getPrecedingText(editor) : '');
                if (!selectedText) {
                    new Notice(this.$('notice.selectText'));
                    return;
                }
                new InlineEditModal(
                    this.app, this, selectedText, action, '',
                    (result) => this.applyEditResult(editor, action, result)
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
