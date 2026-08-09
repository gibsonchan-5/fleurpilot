// views/chat-view.ts — FleurPilot 聊天视图
import {
    ItemView, WorkspaceLeaf, MarkdownRenderer, Component, Notice,
    TFile, TFolder, Menu, Events, setIcon,
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
    private selectedFolderPath = '';

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
    private activeLeafChangeRef: (() => void) | null = null;

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

        this.activeLeafChangeRef = () => {
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
        const label = this.modeButton.createSpan({
            cls: 'mb-mode-label',
            text: this.isReasoningMode ? this.$('chat.modeDeepThink') : this.$('chat.modeChat'),
        });
        setIcon(icon, this.isReasoningMode ? 'brain' : 'message-square');
    }

    private updateContextButtonLabel(): void {
        this.contextButton.empty();
        const icon = this.contextButton.createSpan({ cls: 'mb-ctx-icon' });
        const label = this.contextButton.createSpan({ cls: 'mb-ctx-label' });

        const iconMap: Record<ContextMode, string> = {
            active: 'file-text',
            all: 'book-open',
            folder: 'folder',
            none: 'x-circle',
        };
        setIcon(icon, iconMap[this.contextMode]);

        const labels: Record<ContextMode, string> = {
            active: this.getActiveFileName(),
            all: this.$('chat.contextAllNotes'),
            folder: this.selectedFolderPath || this.$('chat.contextChooseFolder'),
            none: this.$('chat.contextNone'),
        };
        label.setText(labels[this.contextMode]);
        this.contextButton.setAttr('title', labels[this.contextMode]);
    }

    private getActiveFileName(): string {
        const file = this.app.workspace.getActiveFile();
        return file ? file.basename : this.$('chat.contextNoneShort');
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

        const folders = this.getVaultFolders();
        for (const folder of folders) {
            menu.addItem((item) => {
                item.setTitle(`${folder.path}${this.contextMode === 'folder' && this.selectedFolderPath === folder.path ? '  ✓' : ''}`)
                    .setIcon('folder')
                    .onClick(() => {
                        this.contextMode = 'folder';
                        this.selectedFolderPath = folder.path;
                        this.updateContextButtonLabel();
                    });
            });
        }

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

        this.inputArea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.sendButton = inputContainer.createEl('button', {
            cls: 'fleurpilot-send-btn',
            attr: { title: this.$('chat.send') },
        });
        setIcon(this.sendButton, 'send');
        this.sendButton.addEventListener('click', () => this.sendMessage());
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
        welcome.createEl('h3', { text: this.$('chat.welcomeTitle') });
        welcome.createEl('p', { cls: 'fleurpilot-welcome-sub', text: this.$('chat.welcomeSub') });

        // 技能按钮
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

        const translateBtn = skillsRow.createEl('button', {
            cls: 'fleurpilot-skill-btn',
            text: this.$('chat.skillTranslate'),
        });
        translateBtn.addEventListener('click', () => this.runTranslateSkill());

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

    askAboutSelection(text: string): void {
        if (this.isStreaming) return;
        this.inputArea.value = text;
        this.sendMessage();
    }

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
        } catch (error: unknown) {
            this.isStreaming = false;
            this.updateUIState();
            assistantMsgEl.remove();
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
        } else if (this.contextMode === 'folder' && this.selectedFolderPath) {
            const files = this.app.vault.getMarkdownFiles().filter(
                (f) => f.path.startsWith(this.selectedFolderPath + '/'),
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
            const toggleIcon = toggle.createSpan({ cls: 'mb-reasoning-toggle-icon', text: '' });
            toggle.createSpan({ cls: 'mb-reasoning-toggle-label', text: this.$('chat.reasoningLabel') });
            const reasoningBody = reasoningSection.createDiv({ cls: 'mb-reasoning-body' });
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

        this.scrollToBottom();
        return contentEl;
    }

    private updateStreamingMessage(contentEl: HTMLElement, content: string, reasoningContent?: string): void {
        contentEl.empty();
        void this.renderMarkdown(contentEl, content);

        if (reasoningContent !== undefined) {
            const reasoningEl = contentEl.closest('.fleurpilot-message-body')?.querySelector('.mb-reasoning-body') as HTMLElement;
            if (reasoningEl) {
                reasoningEl.removeClass('mb-reasoning-hidden');
                const rc = reasoningEl.querySelector('.mb-reasoning-content') as HTMLElement;
                if (rc) {
                    rc.empty();
                    const comp = new Component();
                    comp.load();
                    MarkdownRenderer.render(
                        this.app, reasoningContent, rc,
                        this.app.workspace.getActiveFile()?.path ?? '',
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
            this.app.workspace.getActiveFile()?.path ?? '',
            component,
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
            this.statusIndicator.removeClass('fleurpilot-status-hidden');
            this.statusIndicator.setText(this.$('chat.thinking'));
        } else {
            this.sendButton.removeClass('streaming');
            this.sendButton.disabled = false;
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
