// modals/inline-edit.ts - 内联编辑 Modal
import { App, Modal, Notice, Setting } from 'obsidian';
import type FleurPilotPlugin from '../main';
import { LLMService, ChatMessage } from '../core/llm-service';
import { wordDiff, mergeDiffParts, renderDiffInto } from '../utils/diff';
import { t } from '../i18n';

export type InlineEditAction =
    | 'explain'
    | 'simplify'
    | 'expand'
    | 'polish'
    | 'translate_zh'
    | 'translate_en'
    | 'proofread'
    | 'custom';

const ACTION_PROMPTS: Record<InlineEditAction, string> = {
    explain: '请解释这段内容的含义，用更通俗易懂的方式表达：',
    simplify: '请精简这段文字，去除冗余表达，保留核心信息：',
    expand: '请扩写这段文字，增加细节和背景信息，使其更加丰富：',
    polish: '请润色这段文字，优化表达，使其更加流畅专业：',
    translate_zh: '请将这段文字翻译为流畅的中文：',
    translate_en: 'Please translate this text into fluent English:',
    proofread: '请审读校对这段文字，修正错别字、语法错误和标点问题：',
    custom: '',
};

export class InlineEditModal extends Modal {
    private plugin: FleurPilotPlugin;
    private selectedText: string;
    private action: InlineEditAction;
    private customInstruction: string;
    private result: string | null = null;
    private onApply: (text: string) => void;

    // ── 多轮对话 ──
    private conversationMessages: ChatMessage[] = [];
    private isStreaming = false;

    // ── UI 元素 ──
    private previewEl!: HTMLElement;
    private loadingEl!: HTMLElement;
    private followUpContainer!: HTMLElement;
    private followUpInput!: HTMLTextAreaElement;
    private diffContainer!: HTMLElement;
    private conversationLog!: HTMLElement;

    constructor(
        app: App,
        plugin: FleurPilotPlugin,
        selectedText: string,
        action: InlineEditAction,
        customInstruction: string,
        onApply: (text: string) => void,
    ) {
        super(app);
        this.plugin = plugin;
        this.selectedText = selectedText;
        this.action = action;
        this.customInstruction = customInstruction;
        this.onApply = onApply;
    }

    private $(key: string, fb?: string) { return t(this.plugin.settings.language, key, fb); }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('mb-inline-edit-modal');

        // 可调整大小
        this.modalEl.addClass('mb-resizable');
        this.modalEl.addClass('mb-wide-modal');
        this.addResizeHandle();

        // 标题
        new Setting(contentEl).setName(this.$('inline.title')).setHeading();

        // 原文区域（可折叠）
        const originalEl = contentEl.createDiv({ cls: 'mb-original-section' });
        const originalHeader = originalEl.createDiv({ cls: 'mb-section-label mb-collapsible' });
        originalHeader.createSpan({ text: this.$('inline.original') });
        originalHeader.createSpan({ text: '▾', cls: 'mb-collapse-arrow' });
        const originalText = originalEl.createEl('pre', { text: this.selectedText, cls: 'mb-original-text' });
        originalHeader.addEventListener('click', () => {
            originalText.classList.toggle('mb-collapsed');
            originalHeader.classList.toggle('mb-collapsed');
        });

        // 对话记录区（滚动的聊天记录）
        this.conversationLog = contentEl.createDiv({ cls: 'mb-conversation-log' });

        // 改写结果区域
        const resultEl = contentEl.createDiv({ cls: 'mb-result-section' });
        resultEl.createDiv({ text: this.$('inline.result'), cls: 'mb-section-label' });

        this.loadingEl = resultEl.createDiv({ cls: 'mb-loading' });
        this.loadingEl.setText(this.$('inline.loading'));

        this.previewEl = resultEl.createDiv({ cls: 'mb-preview' });
        this.previewEl.addClass('mb-preview-hidden');

        this.diffContainer = resultEl.createDiv({ cls: 'mb-diff-container' });
        this.diffContainer.addClass('mb-diff-hidden');

        // 追问输入区（初始隐藏）
        this.followUpContainer = contentEl.createDiv({ cls: 'mb-follow-up-container mb-follow-up-hidden' });
        const followUpLabel = this.followUpContainer.createDiv({ cls: 'mb-follow-up-label' });
        followUpLabel.createSpan({ text: '💬 继续沟通' });
        followUpLabel.createSpan({ text: '（对改写结果提更多要求）', cls: 'mb-follow-up-hint' });

        const followUpInputWrap = this.followUpContainer.createDiv({ cls: 'mb-follow-up-input-wrap' });
        this.followUpInput = followUpInputWrap.createEl('textarea', {
            cls: 'mb-follow-up-input',
            attr: { placeholder: '输入进一步修改要求，例如：再精简一点、换个说法、加上例子...' },
        });
        this.followUpInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void this.handleFollowUp();
            }
        });

        const followUpBtnRow = this.followUpContainer.createDiv({ cls: 'mb-follow-up-btn-row' });
        const followUpSendBtn = followUpBtnRow.createEl('button', { text: '发送', cls: 'mb-btn mb-btn-primary' });
        followUpSendBtn.addEventListener('click', () => { void this.handleFollowUp(); });

        // ── 首轮改写 ──
        const prompt = this.buildPrompt();
        this.conversationMessages = [{ role: 'user' as const, content: prompt }];

        // 添加用户气泡到对话记录
        this.addUserBubble(this.getActionLabel());

        const llm = new LLMService(this.plugin.settings);
        let fullResponse = '';

        try {
            await llm.sendMessage(
                this.conversationMessages,
                (chunk) => {
                    fullResponse += chunk;
                    this.previewEl.removeClass('mb-preview-hidden');
                    this.previewEl.setText(fullResponse);
                    this.loadingEl.addClass('mb-loading-hidden');
                },
                () => {
                    this.result = fullResponse;
                    this.conversationMessages.push({ role: 'assistant' as const, content: fullResponse });
                    // 添加 AI 回复气泡到对话记录
                    this.addAssistantBubble(fullResponse);
                    this.showDiffView();
                    this.showFollowUp();
                },
            );
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.loadingEl.setText(`错误: ${msg}`);
            this.loadingEl.addClass('mb-error');
        }
    }

    private addUserBubble(label: string) {
        const bubble = this.conversationLog.createDiv({ cls: 'mb-conversation-bubble mb-user-bubble' });
        const labelEl = bubble.createSpan({ cls: 'mb-bubble-label' });
        labelEl.setText('你');
        const contentEl = bubble.createSpan({ cls: 'mb-bubble-content' });
        contentEl.setText(label);
        this.conversationLog.scrollTop = this.conversationLog.scrollHeight;
    }

    private addAssistantBubble(content: string) {
        const bubble = this.conversationLog.createDiv({ cls: 'mb-conversation-bubble mb-assistant-bubble' });
        const labelEl = bubble.createSpan({ cls: 'mb-bubble-label' });
        labelEl.setText('FleurPilot');
        const contentEl = bubble.createSpan({ cls: 'mb-bubble-content' });
        contentEl.setText(content);
        this.conversationLog.scrollTop = this.conversationLog.scrollHeight;
    }

    private getActionLabel(): string {
        if (this.action === 'custom' && this.customInstruction) {
            return this.customInstruction;
        }
        const labels: Record<InlineEditAction, string> = {
            explain: '解释',
            simplify: '精简',
            expand: '扩写',
            polish: '润色',
            translate_zh: '翻译为中文',
            translate_en: 'Translate to English',
            proofread: '校对',
            custom: '自定义',
        };
        return labels[this.action] || '改写';
    }

    private buildPrompt(): string {
        if (this.action === 'custom' && this.customInstruction) {
            return `请按照以下要求修改这段文字：\n\n要求：${this.customInstruction}\n\n原文：\n${this.selectedText}\n\n请直接输出修改后的文字，不要添加任何解释。`;
        }

        const actionPrompt = ACTION_PROMPTS[this.action];
        return `${actionPrompt}\n\n${this.selectedText}\n\n请直接输出修改后的文字，不要添加任何解释。`;
    }

    private showDiffView() {
        if (!this.result) return;

        this.diffContainer.empty();
        this.diffContainer.removeClass('mb-diff-hidden');

        const diff = wordDiff(this.selectedText, this.result);
        const merged = mergeDiffParts(diff);
        renderDiffInto(this.diffContainer, merged);

        // 隐藏流式预览区
        this.previewEl.addClass('mb-preview-hidden');

        // 按钮区域（只添加一次）
        if (!this.contentEl.querySelector('.mb-button-container')) {
            const btnContainer = this.contentEl.createDiv({ cls: 'mb-button-container' });

            const cancelBtn = btnContainer.createEl('button', { text: this.$('inline.cancel'), cls: 'mb-btn mb-btn-cancel' });
            cancelBtn.addEventListener('click', () => this.close());

            const applyBtn = btnContainer.createEl('button', { text: this.$('inline.apply'), cls: 'mb-btn mb-btn-apply' });
            applyBtn.addEventListener('click', () => {
                if (this.result) {
                    this.onApply(this.result);
                    new Notice(this.$('inline.applied'));
                    this.close();
                }
            });
        }
    }

    private showFollowUp() {
        this.followUpContainer.removeClass('mb-follow-up-hidden');
        this.followUpInput.value = '';
        this.followUpInput.focus();
    }

    private async handleFollowUp() {
        const instruction = this.followUpInput.value.trim();
        if (!instruction || this.isStreaming) return;

        this.isStreaming = true;
        this.followUpInput.value = '';
        this.followUpInput.disabled = true;

        // 隐藏 diff，显示流式预览
        this.diffContainer.addClass('mb-diff-hidden');
        this.previewEl.removeClass('mb-preview-hidden');
        this.previewEl.setText('');
        this.loadingEl.removeClass('mb-loading-hidden');
        this.loadingEl.setText(this.$('inline.loading'));

        // 添加用户追问气泡
        this.addUserBubble(instruction);

        // 追加到对话历史
        this.conversationMessages.push({ role: 'user' as const, content: instruction });

        const llm = new LLMService(this.plugin.settings);
        let fullResponse = '';

        try {
            await llm.sendMessage(
                this.conversationMessages,
                (chunk) => {
                    fullResponse += chunk;
                    this.previewEl.setText(fullResponse);
                    this.loadingEl.addClass('mb-loading-hidden');
                },
                () => {
                    this.result = fullResponse;
                    this.conversationMessages.push({ role: 'assistant' as const, content: fullResponse });
                    this.addAssistantBubble(fullResponse);
                    this.isStreaming = false;
                    this.followUpInput.disabled = false;
                    this.showDiffView();
                    this.showFollowUp();
                },
            );
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.loadingEl.setText(`错误: ${msg}`);
            this.loadingEl.addClass('mb-error');
            this.isStreaming = false;
            this.followUpInput.disabled = false;
        }
    }

    onClose() {
        this.contentEl.empty();
    }

    /** 添加右下角拖拽手柄，支持调整窗口大小 */
    private addResizeHandle() {
        const handle = this.modalEl.createDiv({ cls: 'mb-resize-handle' });
        let startX = 0, startY = 0, startW = 0, startH = 0;

        const onMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            startX = e.pageX;
            startY = e.pageY;
            const rect = this.modalEl.getBoundingClientRect();
            startW = rect.width;
            startH = rect.height;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e: MouseEvent) => {
            const w = Math.max(480, startW + (e.pageX - startX));
            const h = Math.max(360, startH + (e.pageY - startY));
            this.modalEl.style.width = `${w}px`;
            this.modalEl.style.height = `${h}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        handle.addEventListener('mousedown', onMouseDown);
    }
}
