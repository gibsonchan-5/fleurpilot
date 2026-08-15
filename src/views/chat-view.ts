// views/chat-view.ts — FleurPilot 聊天视图
import {
    ItemView, WorkspaceLeaf, MarkdownRenderer, Component, Notice,
    TFolder, TFile, TAbstractFile, Menu, setIcon, Modal, Setting,
} from 'obsidian';
import type FleurPilotPlugin from '../main';
import { LLMService, ChatMessage } from '../core/llm-service';
import { t, getTimeLocale } from '../i18n';

export const VIEW_TYPE_CHAT = 'fleurpilot-chat-view';

interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

type ContextMode = 'active' | 'all' | 'custom' | 'none';

export class ChatView extends ItemView {
    plugin: FleurPilotPlugin;
    private messages: ConversationMessage[] = [];
    private isStreaming = false;
    private currentAssistantContent = '';

    // 上下文选择
    private contextMode: ContextMode = 'active';
    private selectedFolderPath = '';
    private selectedCustomPaths: string[] = [];
    private recentFolderPath = '';

    // 模式切换
    private isReasoningMode = false;
    private currentReasoningContent = '';

    // 流式渲染节流
    private pendingContentUpdate = false;
    private pendingReasoningUpdate = false;
    private lastRenderedContent = '';
    private lastRenderedReasoning = '';
    private rafId = 0;

    // 当前 LLM 服务实例（用于打断生成）
    private currentLLM: LLMService | null = null;

    // UI 元素
    private messageContainer!: HTMLElement;
    private inputArea!: HTMLTextAreaElement;
    private sendButton!: HTMLButtonElement;
    private contextButton!: HTMLButtonElement;
    private modeButton!: HTMLButtonElement;
    private statusIndicator!: HTMLElement;

    // 事件监听器
    private activeLeafChangeRef: (() => void) | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: FleurPilotPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    /** i18n helper */
    private $(key: string, fb?: string) { return t(this.plugin.settings.language, key, fb); }

    getViewType(): string { return VIEW_TYPE_CHAT; }
    getDisplayText(): string { return 'FleurPilot'; }
    getIcon(): string { return 'pen-tool'; }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('fleurpilot-chat-view');

        this.createToolbar(container);
        this.createMessageArea(container);
        this.createInputArea(container);
        this.createStatusIndicator();
        this.addWelcomeMessage();

        this.activeLeafChangeRef = () => {
            const file = this.app.workspace.getActiveFile();
            if (file) {
                this.trackRecentFolder(file);
            }
            if (this.contextMode === 'active') {
                this.updateContextButtonLabel();
            }
        };
        this.app.workspace.on('active-leaf-change', this.activeLeafChangeRef);
    }

    // ── 工具栏 ──
    private createToolbar(container: HTMLElement): void {
        const toolbar = container.createDiv({ cls: 'fleurpilot-toolbar' });

        // 品牌图标
        const brand = toolbar.createDiv({ cls: 'fleurpilot-brand' });
        setIcon(brand, 'pen-tool');

        // 模式切换
        this.modeButton = toolbar.createEl('button', {
            cls: 'fleurpilot-mode-btn',
            attr: { title: this.$('chat.toggleMode') },
        });
        this.updateModeButtonLabel();
        this.modeButton.addEventListener('click', () => {
            this.isReasoningMode = !this.isReasoningMode;
            this.updateModeButtonLabel();
        });

        // 上下文选择器
        this.contextButton = toolbar.createEl('button', {
            cls: 'fleurpilot-context-btn',
        });
        this.updateContextButtonLabel();
        this.contextButton.addEventListener('click', (e) => this.showContextMenu(e));

        // 新对话
        const newBtn = toolbar.createEl('button', {
            cls: 'fleurpilot-toolbar-btn',
            attr: { title: this.$('chat.newChat') },
        });
        setIcon(newBtn, 'pencil');
        newBtn.addEventListener('click', () => this.startNewChat());
    }

    private updateModeButtonLabel(): void {
        this.modeButton.empty();
        const icon = this.modeButton.createSpan({ cls: 'mb-mode-icon' });
        this.modeButton.createSpan({
            cls: 'mb-mode-label',
            text: this.isReasoningMode ? this.$('chat.modeDeepThink') : this.$('chat.modeChat'),
        });
        setIcon(icon, this.isReasoningMode ? 'brain' : 'message-square');
    }

    private updateContextButtonLabel(): void {
        this.contextButton.empty();
        const icon = this.contextButton.createSpan({ cls: 'mb-ctx-icon' });
        const labelSpan = this.contextButton.createSpan({ cls: 'mb-ctx-label' });

        const iconMap: Record<ContextMode, string> = {
            active: 'file-text',
            all: 'book-open',
            custom: 'search',
            none: 'x-circle',
        };
        setIcon(icon, iconMap[this.contextMode]);

        const labels: Record<ContextMode, string> = {
            active: this.getActiveFileName(),
            all: this.$('chat.contextAllNotes'),
            custom: this.selectedCustomPaths.length > 0
                ? this.selectedCustomPaths.map(p => p.split('/').pop()).join(', ')
                : '其他文件夹或笔记',
            none: this.$('chat.contextNone'),
        };
        labelSpan.setText(`${labels[this.contextMode]} ▾`);
        this.contextButton.setAttr('title', this.$('chat.contextClickToChange'));
    }

    private getActiveFileName(): string {
        const file = this.app.workspace.getActiveFile();
        if (!file) return this.$('chat.contextNoneShort');
        const name = file.basename;
        const maxLen = 16;
        return name.length > maxLen ? `${name.slice(0, maxLen - 1)}…` : name;
    }

    private trackRecentFolder(file: TFile | null): void {
        if (file && file.parent) {
            this.recentFolderPath = file.parent.path;
        }
    }

    private showContextMenu(event: MouseEvent): void {
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle(`${this.$('chat.contextCurrentNote')}${this.contextMode === 'active' ? '  ✓' : ''}`)
                .setIcon('file-text')
                .onClick(() => {
                    this.contextMode = 'active';
                    this.updateContextButtonLabel();
                });
        });

        menu.addItem((item) => {
            item.setTitle(`${this.$('chat.contextAllNotes')}${this.contextMode === 'all' ? '  ✓' : ''}`)
                .setIcon('book-open')
                .onClick(() => {
                    this.contextMode = 'all';
                    this.updateContextButtonLabel();
                });
        });

        menu.addSeparator();

        menu.addItem((item) => {
            const label = this.selectedCustomPaths.length > 0
                ? `其他文件夹或笔记（${this.selectedCustomPaths.map(p => p.split('/').pop()).join(', ')}）`
                : `其他文件夹或笔记`;
            item.setTitle(`${label}${this.contextMode === 'custom' ? '  ✓' : ''}`)
                .setIcon('folder-search')
                .onClick(() => {
                    new ContextSearchModal(this.app, (selectedPaths) => {
                        this.contextMode = 'custom';
                        this.selectedCustomPaths = selectedPaths;
                        this.updateContextButtonLabel();
                    }).open();
                });
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle(`${this.$('chat.contextNone')}${this.contextMode === 'none' ? '  ✓' : ''}`)
                .setIcon('x-circle')
                .onClick(() => {
                    this.contextMode = 'none';
                    this.updateContextButtonLabel();
                });
        });

        menu.showAtMouseEvent(event);
    }

    private getAllFolders(): TFolder[] {
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

    private getAllFiles(): TFile[] {
        return this.app.vault.getMarkdownFiles();
    }

    // ── 消息区域 ──
    private createMessageArea(container: HTMLElement): void {
        this.messageContainer = container.createDiv({ cls: 'fleurpilot-messages' });
    }

    // ── 输入区域 ──
    private createInputArea(container: HTMLElement): void {
        const inputContainer = container.createDiv({ cls: 'fleurpilot-input-container' });

        this.inputArea = inputContainer.createEl('textarea', {
            cls: 'fleurpilot-input',
            attr: { placeholder: this.$('chat.placeholder'), rows: '3' },
        });

        this.inputArea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void this.sendMessage();
            }
        });

        this.sendButton = inputContainer.createEl('button', {
            cls: 'fleurpilot-send-btn',
            attr: { title: this.$('chat.send') },
        });
        setIcon(this.sendButton, 'send');
        this.sendButton.addEventListener('click', () => {
            if (this.isStreaming) {
                this.stopGeneration();
            } else {
                void this.sendMessage();
            }
        });
    }

    private createStatusIndicator(): void {
        this.statusIndicator = this.containerEl.createDiv({ cls: 'fleurpilot-status' });
        this.statusIndicator.addClass('fleurpilot-status-hidden');
    }

    // ── 欢迎消息 ──
    private addWelcomeMessage(): void {
        const welcome = this.messageContainer.createDiv({ cls: 'fleurpilot-welcome' });
        const iconDiv = welcome.createDiv({ cls: 'fleurpilot-welcome-icon' });
        setIcon(iconDiv, 'pen-tool');
        new Setting(welcome).setName(this.$('chat.welcomeTitle')).setHeading();
        welcome.createEl('p', { cls: 'fleurpilot-welcome-sub', text: this.$('chat.welcomeSub') });

        // 技能按钮 — 2x2 网格
        const skillsGrid = welcome.createDiv({ cls: 'fleurpilot-skills-grid' });
        const topRow = skillsGrid.createDiv({ cls: 'fleurpilot-skills-row' });
        const bottomRow = skillsGrid.createDiv({ cls: 'fleurpilot-skills-row' });

        const topSkills = [
            { label: this.$('chat.skillPolish'), prompt: this.$('chat.skillPolishPrompt') },
            { label: this.$('chat.skillProofread'), prompt: this.$('chat.skillProofreadPrompt') },
        ];
        for (const skill of topSkills) {
            const btn = topRow.createEl('button', {
                cls: 'fleurpilot-skill-btn',
                text: skill.label,
            });
            btn.addEventListener('click', () => { void this.runSkill(skill.prompt); });
        }

        const translateBtn = bottomRow.createEl('button', {
            cls: 'fleurpilot-skill-btn',
            text: this.$('chat.skillTranslate'),
        });
        translateBtn.addEventListener('click', () => { void this.runTranslateSkill(); });

        const summarizeBtn = bottomRow.createEl('button', {
            cls: 'fleurpilot-skill-btn',
            text: this.$('chat.skillSummarize'),
        });
        summarizeBtn.addEventListener('click', () => { void this.runSummarizeSkill(); });

        welcome.createEl('p', { cls: 'fleurpilot-welcome-hint', text: this.$('chat.welcomeHint') });
    }

    private async runSkill(prompt: string): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') {
            new Notice(this.$('chat.notice.openNote'));
            return;
        }
        this.inputArea.value = prompt;
        this.inputArea.focus();
        this.inputArea.setSelectionRange(prompt.length, prompt.length);
    }

    private async runTranslateSkill(): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') {
            new Notice(this.$('chat.notice.openNote'));
            return;
        }
        let content = '';
        try {
            content = await this.app.vault.read(file);
        } catch {
            new Notice(this.$('chat.notice.readError'));
            return;
        }

        let chineseCount = 0;
        for (const ch of content) {
            const code = ch.charCodeAt(0);
            if (code >= 0x4e00 && code <= 0x9fff) chineseCount++;
        }
        const totalChars = content.replace(/\s/g, '').length || 1;
        const cnRatio = chineseCount / totalChars;

        const prompt = cnRatio > 0.3
            ? this.$('chat.skillTranslateENPrompt')
            : this.$('chat.skillTranslateCNPrompt');

        this.inputArea.value = prompt;
        this.inputArea.focus();
        this.inputArea.setSelectionRange(prompt.length, prompt.length);
    }

    private async runSummarizeSkill(): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') {
            new Notice(this.$('chat.notice.openNote'));
            return;
        }
        const prompt = this.$('chat.skillSummarizePrompt');
        this.inputArea.value = prompt;
        this.inputArea.focus();
        this.inputArea.setSelectionRange(prompt.length, prompt.length);
    }

    askAboutSelection(text: string): void {
        if (this.isStreaming) return;
        this.inputArea.value = text;
        void this.sendMessage();
    }

    private async sendMessage(): Promise<void> {
        const content = this.inputArea.value.trim();
        if (!content || this.isStreaming) return;

        this.inputArea.value = '';
        
        // 立即滚动到底部，然后再添加消息
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
        
        this.addMessage('user', content);

        // 使用 requestAnimationFrame 异步构建上下文，避免阻塞 UI
        const contextMessages = await new Promise<ChatMessage[]>((resolve) => {
            window.requestAnimationFrame(() => {
                void this.buildContextMessages(content).then(resolve);
            });
        });
        
        const contentEl = this.addMessage('assistant', '', true, this.isReasoningMode);

        this.isStreaming = true;
        this.currentAssistantContent = '';
        this.currentReasoningContent = '';
        this.updateUIState();

        // 找到消息 body（用于推理区域渲染）
        const body = contentEl.closest('.fleurpilot-message-body') ?? contentEl.parentElement;

        // 流式期间禁用平滑滚动，用 CSS 类替代直接设置 style
        this.messageContainer.addClass('fp-scrolling-auto');

        // 使用"离屏渲染 + 原子替换"模式，避免清空 DOM 后的闪烁
        let isRenderingContent = false;
        let contentDirty = false;
        let isRenderingReasoning = false;
        let reasoningDirty = false;

        // 预创建离屏容器，用于渲染 markdown（必须脱离文档流）
        const offscreenEl = this.containerEl.createDiv({
            cls: 'fp-offscreen-render',
        });

        const doContentRender = async () => {
            if (isRenderingContent) { contentDirty = true; return; }
            isRenderingContent = true;
            contentDirty = false;
            try {
                const snapshot = this.currentAssistantContent;
                this.lastRenderedContent = snapshot;
                // 在离屏容器中渲染，不触发页面重绘
                offscreenEl.empty();
                await this.renderMarkdown(offscreenEl, snapshot);
                // 原子性替换：用 innerHTML 一次性替换，避免 empty+appendChild 导致的抖动
                // eslint-disable-next-line obsidianmd/no-unsafe-innerhtml
                contentEl.innerHTML = offscreenEl.innerHTML;
                // 流式期间始终强制滚动到底部（DOM 更新完成后再滚动）
                this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
            } finally {
                isRenderingContent = false;
                // 渲染期间如果有新内容到来，再渲染一次
                if (contentDirty) {
                    cancelAnimationFrame(this.rafId);
                    this.rafId = window.requestAnimationFrame(() => { void doContentRender(); });
                }
            }
        };

        const scheduleContentRender = () => {
            if (isRenderingContent) { contentDirty = true; return; }
            cancelAnimationFrame(this.rafId);
            this.rafId = window.requestAnimationFrame(() => { void doContentRender(); });
        };

        const doReasoningRender = async () => {
            if (isRenderingReasoning) { reasoningDirty = true; return; }
            isRenderingReasoning = true;
            reasoningDirty = false;
            try {
                this.lastRenderedReasoning = this.currentReasoningContent;
                this.renderReasoningSection(body, this.currentReasoningContent);
                this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
            } finally {
                isRenderingReasoning = false;
                if (reasoningDirty) {
                    cancelAnimationFrame(this.rafId);
                    this.rafId = window.requestAnimationFrame(() => { void doReasoningRender(); });
                }
            }
        };

        const scheduleReasoningRender = () => {
            if (isRenderingReasoning) { reasoningDirty = true; return; }
            cancelAnimationFrame(this.rafId);
            this.rafId = window.requestAnimationFrame(() => { void doReasoningRender(); });
        };

        try {
            const llm = new LLMService(this.plugin.settings);
            this.currentLLM = llm;
            await llm.sendMessage(
                contextMessages,
                (chunk) => {
                    this.currentAssistantContent += chunk;
                    scheduleContentRender();
                },
                async (cancelled: boolean) => {
                    // 立即取消所有待处理的渲染任务
                    cancelAnimationFrame(this.rafId);
                    this.pendingContentUpdate = false;
                    this.pendingReasoningUpdate = false;
                    this.currentLLM = null;

                    // 完全跳过 onEnd 中的 markdown 重渲染 —— 流式期间 doContentRender 已实时渲染
                    // 这是修复抖动的关键：不做任何 innerHTML 替换或 offscreen 渲染

                    // 保存到消息历史
                    this.messages.push({
                        role: 'assistant',
                        content: this.currentAssistantContent,
                        timestamp: Date.now(),
                    });

                    // 更新状态（同步，在 DOM 操作之前）
                    this.isStreaming = false;
                    this.updateUIState();

                    // 添加操作按钮（同步 DOM 操作，会改变消息高度）
                    const lastAssistant = this.messageContainer.querySelector('.fleurpilot-assistant:last-of-type') as HTMLElement;
                    if (lastAssistant) {
                        this.addMessageActions(lastAssistant);
                    }

                    // 滚动到底部：使用 double RAF 避免抖动
                    // 第一帧：等布局计算完成（包括按钮添加）
                    // 第二帧：在 fp-scrolling-auto 仍然生效时（instant 滚动）直接设置 scrollTop
                    window.requestAnimationFrame(() => {
                        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
                        // 再下一帧才恢复平滑滚动，避免滚动动画和 DOM 变化冲突
                        window.requestAnimationFrame(() => {
                            this.messageContainer.removeClass('fp-scrolling-auto');
                        });
                    });

                    if (cancelled) {
                        new Notice('已停止生成');
                    }
                },
                this.isReasoningMode
                    ? (reasoningChunk) => {
                        this.currentReasoningContent += reasoningChunk;
                        scheduleReasoningRender();
                    }
                    : undefined,
            );
        } catch (error: unknown) {
            this.isStreaming = false;
            this.currentLLM = null;
            this.updateUIState();
            this.messageContainer.removeClass('fp-scrolling-auto');
            cancelAnimationFrame(this.rafId);
            // cancel 不再 throw，打断走 onEnd(true) 路径
            // catch 仅处理真正的网络/解析错误
            contentEl.remove();
            const msg = error instanceof Error ? error.message : 'Unknown error';
            new Notice(`错误: ${msg}`);
        }
    }

    private async buildContextMessages(userContent: string): Promise<ChatMessage[]> {
        if (!this.plugin.settings.enableContext || this.contextMode === 'none') {
            return [{ role: 'user' as const, content: userContent }];
        }

        const messages: ChatMessage[] = [];

        if (this.plugin.settings.systemPrompt) {
            messages.push({ role: 'system' as const, content: this.plugin.settings.systemPrompt });
        }

        let contextText = '';

        if (this.contextMode === 'active') {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile && activeFile.extension === 'md') {
                try {
                    const content = await this.app.vault.read(activeFile);
                    contextText = `【当前笔记: ${activeFile.basename}】\n${content}`;
                } catch { /* ignore */ }
            }
        } else if (this.contextMode === 'all') {
            const files = this.app.vault.getMarkdownFiles();
            const parts: string[] = [];
            for (const file of files.slice(0, 10)) {
                try {
                    const content = await this.app.vault.read(file);
                    parts.push(`【${file.basename}】\n${content.slice(0, 2000)}`);
                } catch { /* ignore */ }
            }
            contextText = `【全部笔记（共 ${files.length} 篇）】\n\n${parts.join('\n\n---\n\n')}`;
        } else if (this.contextMode === 'recentFolder' && this.recentFolderPath) {
            const files = this.app.vault.getMarkdownFiles().filter(
                (f) => f.path.startsWith(this.recentFolderPath + '/'),
            );
            const parts: string[] = [];
            for (const file of files.slice(0, 10)) {
                try {
                    const content = await this.app.vault.read(file);
                    parts.push(`【${file.basename}】\n${content.slice(0, 2000)}`);
                } catch { /* ignore */ }
            }
            contextText = `【最近文件夹: ${this.recentFolderPath}（共 ${files.length} 篇）】\n\n${parts.join('\n\n---\n\n')}`;
        } else if (this.contextMode === 'custom' && this.selectedCustomPaths.length > 0) {
            const parts: string[] = [];
            for (const path of this.selectedCustomPaths) {
                const item = this.app.vault.getAbstractFileByPath(path);
                if (item instanceof TFile && item.extension === 'md') {
                    try {
                        const content = await this.app.vault.read(item);
                        parts.push(`【${item.basename}】\n${content.slice(0, 2000)}`);
                    } catch { /* ignore */ }
                } else if (item instanceof TFolder) {
                    const files = this.app.vault.getMarkdownFiles().filter(
                        (f) => f.path.startsWith(item.path + '/'),
                    );
                    for (const file of files.slice(0, 10)) {
                        try {
                            const content = await this.app.vault.read(file);
                            parts.push(`【${file.basename}】\n${content.slice(0, 2000)}`);
                        } catch { /* ignore */ }
                    }
                }
            }
            contextText = `【自定义上下文（共 ${parts.length} 篇）】\n\n${parts.join('\n\n---\n\n')}`;
        }

        if (contextText) {
            messages.push({
                role: 'user' as const,
                content: `以下是参考上下文，请基于它回答我的问题：\n\n${contextText}\n\n---\n\n我的问题：${userContent}`,
            });
        } else {
            messages.push({ role: 'user' as const, content: userContent });
        }

        return messages;
    }

    private addMessage(role: 'user' | 'assistant', content: string, isStreaming = false, hasReasoning = false): HTMLElement {
        const welcome = this.messageContainer.querySelector('.fleurpilot-welcome');
        if (welcome) welcome.remove();

        const messageEl = this.messageContainer.createDiv({
            cls: `fleurpilot-message fleurpilot-${role}`,
        });

        const avatar = messageEl.createDiv({ cls: 'fleurpilot-avatar' });
        if (role === 'user') {
            avatar.setText(this.$('chat.avatarUser'));
        } else {
            setIcon(avatar, 'pen-tool');
        }

        const body = messageEl.createDiv({ cls: 'fleurpilot-message-body' });
        const header = body.createDiv({ cls: 'fleurpilot-message-header' });
        header.createSpan({ cls: 'fleurpilot-message-role', text: role === 'user' ? this.$('chat.roleUser') : this.$('chat.roleAssistant') });
        header.createSpan({
            cls: 'fleurpilot-message-time',
            text: new Date().toLocaleTimeString(getTimeLocale(this.plugin.settings.language), { hour: '2-digit', minute: '2-digit' }),
        });

        // 推理模式
        if (role === 'assistant' && hasReasoning) {
            const reasoningSection = body.createDiv({ cls: 'mb-reasoning' });
            const toggle = reasoningSection.createDiv({ cls: 'mb-reasoning-toggle' });
            const toggleIcon = toggle.createSpan({ cls: 'mb-reasoning-toggle-icon', text: '▸' });
            toggle.createSpan({ cls: 'mb-reasoning-toggle-label', text: this.$('chat.reasoningLabel') });
            const reasoningBody = reasoningSection.createDiv({ cls: 'mb-reasoning-body mb-reasoning-hidden' });
            reasoningBody.createDiv({ cls: 'mb-reasoning-content' });

            toggle.addEventListener('click', () => {
                const isHidden = reasoningBody.hasClass('mb-reasoning-hidden');
                reasoningBody.toggleClass('mb-reasoning-hidden', !isHidden);
                toggleIcon.setText(isHidden ? '▾' : '▸');
            });
        }

        const contentEl = body.createDiv({ cls: 'fleurpilot-message-content' });

        if (content) {
            void this.renderMarkdown(contentEl, content);
        } else if (isStreaming) {
            contentEl.createSpan({ cls: 'fleurpilot-streaming', text: '…' });
        }

        if (role === 'user') {
            this.messages.push({ role, content, timestamp: Date.now() });
        }

        // 用户发送消息或添加助手消息时，强制滚动到底部（无阈值限制）
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
        return contentEl;
    }

    private renderReasoningSection(body: HTMLElement | null, reasoningContent: string): void {
        if (!body) return;
        const reasoningEl = body.querySelector('.mb-reasoning-body') as HTMLElement;
        if (!reasoningEl) return;
        
        reasoningEl.removeClass('mb-reasoning-hidden');
        const rc = reasoningEl.querySelector('.mb-reasoning-content') as HTMLElement;
        if (!rc) return;
        
        rc.empty();
        const comp = new Component();
        comp.load();
        void MarkdownRenderer.render(
            this.app, reasoningContent, rc,
            this.app.workspace.getActiveFile()?.path ?? '',
            comp,
        );
        comp.unload();
    }

    private async updateStreamingMessage(contentEl: HTMLElement, content: string, reasoningContent?: string): Promise<void> {
        // 使用离屏 div + innerHTML 替换，避免 empty() 导致的布局抖动
        const tempDiv = contentEl.createDiv();
        tempDiv.hide();
        const component = new Component();
        component.load();
        await MarkdownRenderer.render(
            this.app, content, tempDiv,
            this.app.workspace.getActiveFile()?.path ?? '',
            component,
        );
        component.unload();
        // eslint-disable-next-line obsidianmd/no-unsafe-innerhtml
        contentEl.innerHTML = tempDiv.innerHTML;
        tempDiv.remove();

        if (reasoningContent !== undefined) {
            const reasoningEl = contentEl.closest('.fleurpilot-message-body')?.querySelector('.mb-reasoning-body') as HTMLElement;
            if (reasoningEl) {
                reasoningEl.removeClass('mb-reasoning-hidden');
                const rc = reasoningEl.querySelector('.mb-reasoning-content') as HTMLElement;
                if (rc) {
                    const tempRcDiv = rc.createDiv();
                    tempRcDiv.hide();
                    const comp = new Component();
                    comp.load();
                    await MarkdownRenderer.render(
                        this.app, reasoningContent, tempRcDiv,
                        this.app.workspace.getActiveFile()?.path ?? '',
                        comp,
                    );
                    comp.unload();
                    // eslint-disable-next-line obsidianmd/no-unsafe-innerhtml
                    rc.innerHTML = tempRcDiv.innerHTML;
                    tempRcDiv.remove();
                }
            }
        }
    }

    private async renderMarkdown(container: HTMLElement, content: string): Promise<void> {
        const component = new Component();
        component.load();
        await MarkdownRenderer.render(
            this.app, content, container,
            this.app.workspace.getActiveFile()?.path ?? '',
            component,
        );
        component.unload();
    }

    // ── 消息操作按钮 ──
    private addMessageActions(messageEl: HTMLElement): void {
        const body = messageEl.querySelector('.fleurpilot-message-body');
        if (!body) return;

        // 检查是否已有操作按钮
        if (body.querySelector('.fleurpilot-message-actions')) return;

        const actionsRow = body.createDiv({ cls: 'fleurpilot-message-actions' });

        // 保存笔记（保存整个对话）
        const saveBtn = actionsRow.createEl('button', {
            cls: 'fleurpilot-action-btn',
            attr: { 'aria-label': this.$('chat.actions.saveNote') },
        });
        setIcon(saveBtn, 'file-plus');
        saveBtn.addEventListener('click', () => { void this.saveConversationAsNote(); });

        // 复制（复制整条助手回复）
        const copyBtn = actionsRow.createEl('button', {
            cls: 'fleurpilot-action-btn',
            attr: { 'aria-label': this.$('chat.actions.copy') },
        });
        setIcon(copyBtn, 'copy');
        copyBtn.addEventListener('click', () => { void this.copyLastAssistantMessage(); });

        // 重新生成
        const regenerateBtn = actionsRow.createEl('button', {
            cls: 'fleurpilot-action-btn',
            attr: { 'aria-label': this.$('chat.actions.regenerate') },
        });
        setIcon(regenerateBtn, 'refresh-cw');
        regenerateBtn.addEventListener('click', () => { void this.regenerateLastMessage(); });
    }

    private async saveConversationAsNote(): Promise<void> {
        if (this.messages.length === 0) {
            new Notice(this.$('chat.notice.noMessages'));
            return;
        }

        const folderPath = this.plugin.settings.chatHistoryFolder || 'FleurPilot';
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}`;

        // 取第一条用户消息的前 20 个字符作为标题
        const firstUser = this.messages.find(m => m.role === 'user');
        const title = firstUser
            ? `${firstUser.content.slice(0, 30).replace(/[\\/:*?"<>|]/g, '').trim()} ${timestamp}`
            : `Chat ${timestamp}`;

        const timeLocale = getTimeLocale(this.plugin.settings.language);
        const toTime = (ts: number) =>
            new Date(ts).toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' });

        let content = `# ${title}\n\n`;
        for (const msg of this.messages) {
            const role = msg.role === 'user' ? this.$('chat.roleUser') : this.$('chat.roleAssistant');
            content += `## ${role} (${toTime(msg.timestamp)})\n\n${msg.content}\n\n---\n\n`;
        }

        // 确保文件夹存在
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            try {
                await this.app.vault.createFolder(folderPath);
            } catch { /* folder may already exist */ }
        }

        let filePath = `${folderPath}/${title}.md`;
        // 防止重名
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(filePath)) {
            filePath = `${folderPath}/${title} (${counter}).md`;
            counter++;
        }

        await this.app.vault.create(filePath, content);
        new Notice(this.$('chat.notice.saved'));
    }

    private async copyLastAssistantMessage(): Promise<void> {
        const lastAssistant = this.findLastMessageByRole('assistant');
        if (!lastAssistant) return;

        try {
            await navigator.clipboard.writeText(lastAssistant.content);
            new Notice(this.$('chat.notice.copied'));
        } catch {
            new Notice('Failed to copy');
        }
    }

    private async regenerateLastMessage(): Promise<void> {
        // 找到最后一条用户消息
        const lastUser = this.findLastMessageByRole('user');
        if (!lastUser) return;

        // 从 messages 数组中移除最后一条 assistant 消息
        const lastAssistantIdx = this.messages.findIndex(m => m.role === 'assistant');
        if (lastAssistantIdx !== -1) {
            this.messages.splice(lastAssistantIdx, 1);
        }

        // 从 UI 中移除最后一条 assistant 消息
        const assistantElements = this.messageContainer.querySelectorAll('.fleurpilot-assistant');
        if (assistantElements.length > 0) {
            assistantElements[assistantElements.length - 1].remove();
        }

        // 从 UI 中移除最后一条 user 消息（会重新发送）
        const userElements = this.messageContainer.querySelectorAll('.fleurpilot-user');
        if (userElements.length > 0) {
            userElements[userElements.length - 1].remove();
        }

        // 从 messages 数组中移除最后一条 user 消息
        const lastUserIdx = this.messages.findIndex(m => m.role === 'user' && m.timestamp === lastUser.timestamp);
        if (lastUserIdx !== -1) {
            this.messages.splice(lastUserIdx, 1);
        }

        new Notice(this.$('chat.notice.regenerating'));
        this.inputArea.value = lastUser.content;
        void this.sendMessage();
    }

    private findLastMessageByRole(role: 'user' | 'assistant'): ConversationMessage | null {
        for (let i = this.messages.length - 1; i >= 0; i--) {
            if (this.messages[i].role === role) return this.messages[i];
        }
        return null;
    }

    /** 打断当前生成 */
    private stopGeneration(): void {
        if (this.currentLLM) {
            // 【关键修复】调用 cancel() 会设置 _isCancelled 标志并中断流
            // 但不要在这里手动更新状态，让 onEnd 回调来处理
            // 这样可以避免重复操作和状态不一致
            this.currentLLM.cancel();
            new Notice('已停止生成');
        }
    }

    startNewChat(): void {
        // 如果开启了自动保存且有关联消息，先保存当前对话
        if (this.plugin.settings.enableChatHistory && this.messages.length > 0) {
            void this.saveConversationAsNote();
        }
        this.messages = [];
        this.messageContainer.empty();
        this.addWelcomeMessage();
        new Notice(this.$('chat.notice.newChat'));
    }

    private updateUIState(): void {
        if (this.isStreaming) {
            this.sendButton.addClass('streaming');
            this.sendButton.disabled = false; // 允许点击停止
            this.sendButton.empty();
            setIcon(this.sendButton, 'square');
            this.statusIndicator.removeClass('fleurpilot-status-hidden');
            this.statusIndicator.setText(this.$('chat.thinking'));
        } else {
            this.sendButton.removeClass('streaming');
            this.sendButton.disabled = false;
            this.sendButton.empty();
            setIcon(this.sendButton, 'send');
            this.statusIndicator.addClass('fleurpilot-status-hidden');
        }
    }

    private scrollToBottom(): void {
        const el = this.messageContainer;
        const threshold = 60;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceFromBottom <= threshold) {
            el.scrollTop = el.scrollHeight;
        }
    }

    async onClose(): Promise<void> {
        if (this.activeLeafChangeRef) {
            this.app.workspace.off('active-leaf-change', this.activeLeafChangeRef);
            this.activeLeafChangeRef = null;
        }
    }
}

// ── 上下文搜索 Modal（支持文件夹层级浏览） ──
export class ContextSearchModal extends Modal {
    private onSelect: (paths: string[]) => void;
    private selectedPaths: Set<string> = new Set();
    private currentFolder: TFolder;
    private searchInput!: HTMLInputElement;
    private listEl!: HTMLElement;
    private breadcrumbEl!: HTMLElement;
    private isSearchMode = false;

    constructor(app: App, onSelect: (paths: string[]) => void) {
        super(app);
        this.onSelect = onSelect;
        this.currentFolder = this.app.vault.getRoot();
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('fp-ctx-search-modal');
        this.modalEl.addClass('fp-ctx-modal-wide');

        // 标题
        const titleEl = contentEl.createDiv({ cls: 'fp-ctx-modal-title' });
        titleEl.setText('选择笔记或文件夹（点击选择，双击文件夹进入）');

        // 搜索框
        const searchWrap = contentEl.createDiv({ cls: 'fp-ctx-search-wrap' });
        const searchIcon = searchWrap.createSpan({ cls: 'fp-ctx-search-icon' });
        setIcon(searchIcon, 'search');
        this.searchInput = searchWrap.createEl('input', {
            type: 'text',
            cls: 'fp-ctx-search-input',
            attr: { placeholder: '输入关键词搜索…' },
        });
        this.searchInput.addEventListener('input', () => this.renderList());

        // 面包屑导航
        this.breadcrumbEl = contentEl.createDiv({ cls: 'fp-ctx-breadcrumb' });

        // 列表
        this.listEl = contentEl.createDiv({ cls: 'fp-ctx-list' });
        this.renderList();

        // 底部按钮
        const btnRow = contentEl.createDiv({ cls: 'fp-ctx-btn-row' });
        const cancelBtn = btnRow.createEl('button', { text: '取消', cls: 'fp-ctx-btn fp-ctx-btn-cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const confirmBtn = btnRow.createEl('button', { text: '确认选择', cls: 'fp-ctx-btn fp-ctx-btn-confirm' });
        confirmBtn.addEventListener('click', () => {
            if (this.selectedPaths.size > 0) {
                this.onSelect(Array.from(this.selectedPaths));
                this.close();
            }
        });

        this.searchInput.focus();
    }

    private renderBreadcrumb(): void {
        this.breadcrumbEl.empty();
        if (this.isSearchMode) {
            this.breadcrumbEl.addClass('fp-ctx-hidden');
            return;
        }
        this.breadcrumbEl.removeClass('fp-ctx-hidden');

        // 构建路径链
        const pathParts: TFolder[] = [];
        let folder: TFolder | null = this.currentFolder;
        while (folder) {
            pathParts.unshift(folder);
            folder = folder.parent;
        }

        // 渲染面包屑
        pathParts.forEach((f, idx) => {
            const name = f.isRoot() ? '根目录' : f.name;
            const crumb = this.breadcrumbEl.createSpan({ text: name, cls: 'fp-ctx-crumb' });

            if (idx < pathParts.length - 1) {
                this.breadcrumbEl.createSpan({ text: ' / ', cls: 'fp-ctx-crumb-separator' });
            }

            // 点击面包屑导航
            crumb.addEventListener('click', () => {
                this.currentFolder = f;
                this.isSearchMode = false;
                this.searchInput.value = '';
                this.renderList();
            });
        });
    }

    private renderList(): void {
        this.listEl.empty();
        this.renderBreadcrumb();

        const query = this.searchInput.value.toLowerCase().trim();
        this.isSearchMode = query.length > 0;

        if (this.isSearchMode) {
            // 搜索模式：全库搜索
            const allFolders = this.getAllFolders();
            const allFiles = this.app.vault.getMarkdownFiles();

            const matchedFolders = allFolders.filter(f =>
                f.name.toLowerCase().includes(query) ||
                f.path.toLowerCase().includes(query)
            );

            const matchedFiles = allFiles.filter(f =>
                f.basename.toLowerCase().includes(query) ||
                f.path.toLowerCase().includes(query)
            );

            for (const folder of matchedFolders.slice(0, 20)) {
                this.renderItem(folder, 'folder');
            }
            for (const file of matchedFiles.slice(0, 30)) {
                this.renderItem(file, 'file-text');
            }

            if (matchedFolders.length === 0 && matchedFiles.length === 0) {
                this.listEl.createDiv({ cls: 'fp-ctx-empty', text: '没有找到匹配的内容' });
            }
        } else {
            // 浏览模式：显示当前文件夹的内容
            const children = this.currentFolder.children;
            const folders: TFolder[] = [];
            const files: TFile[] = [];
            for (const c of children) {
                if (c instanceof TFolder) {
                    folders.push(c);
                } else if (c instanceof TFile && c.extension === 'md') {
                    files.push(c);
                }
            }

            folders.sort((a, b) => a.name.localeCompare(b.name));
            files.sort((a, b) => a.basename.localeCompare(b.basename));

            for (const folder of folders) {
                this.renderItem(folder, 'folder');
            }
            for (const file of files) {
                this.renderItem(file, 'file-text');
            }

            if (folders.length === 0 && files.length === 0) {
                this.listEl.createDiv({ cls: 'fp-ctx-empty', text: '此文件夹为空' });
            }
        }
    }

    private renderItem(item: TAbstractFile, icon: string): void {
        const isFolder = item instanceof TFolder;
        const itemEl = this.listEl.createDiv({ cls: 'fp-ctx-item' });
        if (this.selectedPaths.has(item.path)) {
            itemEl.addClass('fp-ctx-item-selected');
        }

        const iconEl = itemEl.createSpan({ cls: 'fp-ctx-item-icon' });
        setIcon(iconEl, icon);

        const textWrap = itemEl.createDiv({ cls: 'fp-ctx-item-text' });
        textWrap.createSpan({ cls: 'fp-ctx-item-name', text: item.name });

        // 副标题：显示路径（仅当路径 ≠ 名称时才显示）
        let detailPath: string;
        if (isFolder) {
            detailPath = item.path || '/';
        } else if (item instanceof TFile) {
            detailPath = item.parent?.path || '/';
        } else {
            detailPath = '/';
        }
        if (detailPath !== item.name && detailPath !== '/') {
            textWrap.createSpan({ cls: 'fp-ctx-item-detail', text: detailPath });
        }

        // 右侧勾选标记
        const checkmark = itemEl.createSpan({ cls: 'fp-ctx-item-check' });
        if (this.selectedPaths.has(item.path)) {
            setIcon(checkmark, 'check');
        }

        // 单击：选择/取消选择
        itemEl.addEventListener('click', () => {
            if (this.selectedPaths.has(item.path)) {
                this.selectedPaths.delete(item.path);
                itemEl.removeClass('fp-ctx-item-selected');
                checkmark.empty();
            } else {
                this.selectedPaths.add(item.path);
                itemEl.addClass('fp-ctx-item-selected');
                setIcon(checkmark, 'check');
            }
        });

        // 双击文件夹：进入
        if (isFolder && item instanceof TFolder) {
            itemEl.addEventListener('dblclick', () => {
                this.currentFolder = item;
                this.isSearchMode = false;
                this.searchInput.value = '';
                this.renderList();
            });
        }
    }

    private getAllFolders(): TFolder[] {
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

    onClose() {
        this.contentEl.empty();
    }
}
