// views/chat-view.ts — FleurPilot 聊天视图
import {
    ItemView, WorkspaceLeaf, MarkdownRenderer, Component, Notice,
    TFile, TFolder, Menu, Events,
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

type ContextMode = 'active' | 'all' | 'folder' | 'none';

export class ChatView extends ItemView {
    plugin: FleurPilotPlugin;
    private messages: ConversationMessage[] = [];
    private isStreaming = false;
    private currentAssistantContent = '';

    // 上下文选择
    private contextMode: ContextMode = 'active';
    private selectedFolderPath: string = '';

    // 模式切换
    private isReasoningMode = false;
    private currentReasoningContent = '';

    // UI 元素
    private messageContainer!: HTMLElement;
    private inputArea!: HTMLTextAreaElement;
    private sendButton!: HTMLButtonElement;
    private contextButton!: HTMLButtonElement;
    private modeButton!: HTMLButtonElement;
    private statusIndicator!: HTMLElement;

    // 事件监听器
    private activeLeafChangeRef: any = null;

    constructor(leaf: WorkspaceLeaf, plugin: FleurPilotPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    /** i18n helper */
    private $(key: string, fb?: string) { return t(this.plugin.settings.language, key, fb); }

    getViewType(): string { return VIEW_TYPE_CHAT; }
    getDisplayText(): string { return this.$('chat.title'); }
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

        // 监听活动笔记切换，实时更新上下文按钮
        this.activeLeafChangeRef = this.app.workspace.on('active-leaf-change', () => {
            if (this.contextMode === 'active') {
                this.updateContextButtonLabel();
            }
        });
    }

    // ── 工具栏 ─
    private createToolbar(container: HTMLElement): void {
        const toolbar = container.createDiv({ cls: 'fleurpilot-toolbar' });

        // 品牌图标
        const brand = toolbar.createDiv({ cls: 'fleurpilot-brand' });
        brand.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>';

        // 模式切换：Chat / Reasoning
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
        newBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
        newBtn.addEventListener('click', () => this.startNewChat());
    }

    private updateModeButtonLabel(): void {
        this.modeButton.innerHTML = this.isReasoningMode
            ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg> <span class="mb-mode-label">' + this.$('chat.modeDeepThink') + '</span>'
            : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> <span class="mb-mode-label">' + this.$('chat.modeChat') + '</span>';
    }

    private updateContextButtonLabel(): void {
        const icons: Record<ContextMode, string> = {
            active: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
            all: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
            folder: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
            none: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
        };
        const labels: Record<ContextMode, string> = {
            active: this.getActiveFileName(),
            all: this.$('chat.contextAllNotes'),
            folder: this.selectedFolderPath || this.$('chat.contextChooseFolder'),
            none: this.$('chat.contextNone'),
        };
        const label = labels[this.contextMode];
        this.contextButton.innerHTML = `${icons[this.contextMode]}<span class="mb-ctx-label">${label}</span>`;
        // 完整名称作为悬浮提示，避免长标题丢失信息
        this.contextButton.setAttr('title', label);
    }

    private getActiveFileName(): string {
        const file = this.app.workspace.getActiveFile();
        return file ? file.basename : this.$('chat.contextNoneShort');
    }

    private showContextMenu(event: MouseEvent): void {
        const menu = new Menu();

        // 当前笔记
        menu.addItem((item) => {
            item
                .setTitle(`📄 ${this.$('chat.contextCurrentNote')}${this.contextMode === 'active' ? '  ✓' : ''}`)
                .onClick(() => {
                    this.contextMode = 'active';
                    this.updateContextButtonLabel();
                });
        });

        // 全部笔记
        menu.addItem((item) => {
            item
                .setTitle(`📚 ${this.$('chat.contextAllNotes')}${this.contextMode === 'all' ? '  ✓' : ''}`)
                .onClick(() => {
                    this.contextMode = 'all';
                    this.updateContextButtonLabel();
                });
        });

        menu.addSeparator();

        // 文件夹列表
        const folders = this.getVaultFolders();
        if (folders.length > 0) {
            for (const folder of folders) {
                menu.addItem((item) => {
                    item
                        .setTitle(`📁 ${folder.path}${this.contextMode === 'folder' && this.selectedFolderPath === folder.path ? '  ✓' : ''}`)
                        .onClick(() => {
                            this.contextMode = 'folder';
                            this.selectedFolderPath = folder.path;
                            this.updateContextButtonLabel();
                        });
                });
            }
        }

        menu.addSeparator();

        // 无上下文
        menu.addItem((item) => {
            item
                .setTitle(`⊘ ${this.$('chat.contextNone')}${this.contextMode === 'none' ? '  ✓' : ''}`)
                .onClick(() => {
                    this.contextMode = 'none';
                    this.updateContextButtonLabel();
                });
        });

        menu.showAtMouseEvent(event);
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

        this.inputArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.sendButton = inputContainer.createEl('button', {
            cls: 'fleurpilot-send-btn',
            attr: { title: this.$('chat.send') },
        });
        this.sendButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
        this.sendButton.addEventListener('click', () => this.sendMessage());
    }

    private createStatusIndicator(): void {
        this.statusIndicator = this.containerEl.createDiv({ cls: 'fleurpilot-status' });
        this.statusIndicator.style.display = 'none';
    }

    // ─ 欢迎消息 ──
    private addWelcomeMessage(): void {
        const welcome = this.messageContainer.createDiv({ cls: 'fleurpilot-welcome' });
        welcome.innerHTML = `
            <div class="fleurpilot-welcome-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg></div>
            <h3>${this.$('chat.welcomeTitle')}</h3>
            <p class="fleurpilot-welcome-sub">${this.$('chat.welcomeSub')}</p>
        `;

        // 技能按钮区域
        const skillsRow = welcome.createDiv({ cls: 'fleurpilot-skills' });
        const skills = [
            { label: this.$('chat.skillPolish'), prompt: this.$('chat.skillPolishPrompt') },
            { label: this.$('chat.skillProofread'), prompt: this.$('chat.skillProofreadPrompt') },
        ];
        for (const skill of skills) {
            const btn = skillsRow.createEl('button', {
                cls: 'fleurpilot-skill-btn',
                text: skill.label,
            });
            btn.addEventListener('click', () => this.runSkill(skill.prompt));
        }

        // 全文翻译：特殊处理，自动识别中英文方向
        const translateBtn = skillsRow.createEl('button', {
            cls: 'fleurpilot-skill-btn',
            text: this.$('chat.skillTranslate'),
        });
        translateBtn.addEventListener('click', () => this.runTranslateSkill());

        // 底部提示
        welcome.createEl('p', { cls: 'fleurpilot-welcome-hint', text: this.$('chat.welcomeHint') });
    }

    // ── 一键技能 ──
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

    // ── 全文翻译（自动识别中英文方向） ──
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

        // 统计中文字符比例
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

    // ── 右键菜单触发的快捷询问 ──
    askAboutSelection(text: string): void {
        if (this.isStreaming) return;
        this.inputArea.value = text;
        this.sendMessage();
    }

    // ── 发送消息 ──
    private async sendMessage(): Promise<void> {
        const content = this.inputArea.value.trim();
        if (!content || this.isStreaming) return;

        this.inputArea.value = '';
        this.addMessage('user', content);

        const contextMessages = await this.buildContextMessages(content);
        const assistantMsgEl = this.addMessage('assistant', '', true, this.isReasoningMode);

        this.isStreaming = true;
        this.currentAssistantContent = '';
        this.currentReasoningContent = '';
        this.updateUIState();

        try {
            const llm = new LLMService(this.plugin.settings);
            await llm.sendMessage(
                contextMessages,
                (chunk) => {
                    this.currentAssistantContent += chunk;
                    this.updateStreamingMessage(assistantMsgEl, this.currentAssistantContent, this.currentReasoningContent);
                    this.scrollToBottom();
                },
                () => {
                    this.messages.push({
                        role: 'assistant',
                        content: this.currentAssistantContent,
                        timestamp: Date.now(),
                    });
                    this.isStreaming = false;
                    this.updateUIState();
                },
                this.isReasoningMode
                    ? (reasoningChunk) => {
                        this.currentReasoningContent += reasoningChunk;
                        this.updateStreamingMessage(assistantMsgEl, this.currentAssistantContent, this.currentReasoningContent);
                    }
                    : undefined,
            );
        } catch (error: any) {
            this.isStreaming = false;
            this.updateUIState();
            assistantMsgEl.remove();
            new Notice(`错误: ${error.message}`);
        }
    }

    // ── 构建上下文消息 ──
    private async buildContextMessages(userContent: string): Promise<ChatMessage[]> {
        if (!this.plugin.settings.enableContext || this.contextMode === 'none') {
            return [{ role: 'user', content: userContent }];
        }

        const messages: ChatMessage[] = [];

        // 添加系统提示
        if (this.plugin.settings.systemPrompt) {
            messages.push({ role: 'system', content: this.plugin.settings.systemPrompt });
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
            // 限制上下文大小，最多取 10 个文件
            for (const file of files.slice(0, 10)) {
                try {
                    const content = await this.app.vault.read(file);
                    parts.push(`【${file.basename}】\n${content.slice(0, 2000)}`);
                } catch { /* ignore */ }
            }
            contextText = `【全部笔记（共 ${files.length} 篇）】\n\n${parts.join('\n\n---\n\n')}`;
        } else if (this.contextMode === 'folder' && this.selectedFolderPath) {
            const files = this.app.vault.getMarkdownFiles().filter(
                (f) => f.path.startsWith(this.selectedFolderPath + '/')
            );
            const parts: string[] = [];
            for (const file of files.slice(0, 10)) {
                try {
                    const content = await this.app.vault.read(file);
                    parts.push(`【${file.basename}】\n${content.slice(0, 2000)}`);
                } catch { /* ignore */ }
            }
            contextText = `【文件夹: ${this.selectedFolderPath}（共 ${files.length} 篇）】\n\n${parts.join('\n\n---\n\n')}`;
        }

        if (contextText) {
            messages.push({
                role: 'user',
                content: `以下是参考上下文，请基于它回答我的问题：\n\n${contextText}\n\n---\n\n我的问题：${userContent}`,
            });
        } else {
            messages.push({ role: 'user', content: userContent });
        }

        return messages;
    }

    // ── 消息渲染 ──
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
            avatar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>';
        }

        const body = messageEl.createDiv({ cls: 'fleurpilot-message-body' });
        const header = body.createDiv({ cls: 'fleurpilot-message-header' });
        header.createSpan({ cls: 'fleurpilot-message-role', text: role === 'user' ? this.$('chat.roleUser') : this.$('chat.roleAssistant') });
        header.createSpan({
            cls: 'fleurpilot-message-time',
            text: new Date().toLocaleTimeString(getTimeLocale(this.plugin.settings.language), { hour: '2-digit', minute: '2-digit' }),
        });

        // 推理模式：先创建可折叠的思考过程区域（显示在回答之前）
        if (role === 'assistant' && hasReasoning) {
            const reasoningSection = body.createDiv({ cls: 'mb-reasoning' });
            const toggle = reasoningSection.createDiv({ cls: 'mb-reasoning-toggle' });
            toggle.createSpan({ cls: 'mb-reasoning-toggle-icon', text: '▸' });
            toggle.createSpan({ cls: 'mb-reasoning-toggle-label', text: this.$('chat.reasoningLabel') });
            const reasoningBody = reasoningSection.createDiv({ cls: 'mb-reasoning-body' });
            const reasoningBodyInner = reasoningBody.createDiv({ cls: 'mb-reasoning-content' });

            toggle.addEventListener('click', () => {
                const icon = toggle.querySelector('.mb-reasoning-toggle-icon') as HTMLElement;
                if (reasoningBody.style.display === 'none') {
                    reasoningBody.style.display = 'block';
                    if (icon) icon.textContent = '▾';
                } else {
                    reasoningBody.style.display = 'none';
                    if (icon) icon.textContent = '▸';
                }
            });
        }

        const contentEl = body.createDiv({ cls: 'fleurpilot-message-content' });

        if (content) {
            this.renderMarkdown(contentEl, content);
        } else if (isStreaming) {
            contentEl.createSpan({ cls: 'fleurpilot-streaming', text: '…' });
        }

        if (role === 'user') {
            this.messages.push({ role, content, timestamp: Date.now() });
        }

        this.scrollToBottom();
        return contentEl;
    }

    private updateStreamingMessage(contentEl: HTMLElement, content: string, reasoningContent?: string): void {
        contentEl.empty();
        this.renderMarkdown(contentEl, content);

        // 更新推理过程
        if (reasoningContent !== undefined) {
            const reasoningEl = contentEl.closest('.fleurpilot-message-body')?.querySelector('.mb-reasoning-body') as HTMLElement;
            if (reasoningEl) {
                reasoningEl.style.display = 'block';
                const rc = reasoningEl.querySelector('.mb-reasoning-content') as HTMLElement;
                if (rc) {
                    rc.empty();
                    const comp = new Component();
                    comp.load();
                    MarkdownRenderer.render(
                        this.app, reasoningContent, rc,
                        this.app.workspace.getActiveFile()?.path || '',
                        comp,
                    );
                    comp.unload();
                }
            }
        }
    }

    private async renderMarkdown(container: HTMLElement, content: string): Promise<void> {
        const component = new Component();
        component.load();
        await MarkdownRenderer.render(
            this.app, content, container,
            this.app.workspace.getActiveFile()?.path || '',
            component
        );
        component.unload();
    }

    startNewChat(): void {
        this.messages = [];
        this.messageContainer.empty();
        this.addWelcomeMessage();
        new Notice(this.$('chat.notice.newChat'));
    }

    private updateUIState(): void {
        if (this.isStreaming) {
            this.sendButton.addClass('streaming');
            this.sendButton.disabled = true;
            this.statusIndicator.style.display = 'flex';
            this.statusIndicator.setText(this.$('chat.thinking'));
        } else {
            this.sendButton.removeClass('streaming');
            this.sendButton.disabled = false;
            this.statusIndicator.style.display = 'none';
        }
    }

    private scrollToBottom(): void {
        const el = this.messageContainer;
        const threshold = 60; // 距离底部多少像素以内才自动滚动
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceFromBottom <= threshold) {
            el.scrollTop = el.scrollHeight;
        }
    }

    async onClose(): Promise<void> {
        // 注销事件监听器
        if (this.activeLeafChangeRef) {
            this.app.workspace.off('active-leaf-change', this.activeLeafChangeRef);
            this.activeLeafChangeRef = null;
        }
    }
}
