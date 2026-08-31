// modals/inline-edit.ts - 内联编辑 Modal
import { App, Modal, Notice, Setting } from 'obsidian';
import type FleurPilotPlugin from '../main';
import { LLMService, ChatMessage } from '../core/llm-service';
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

        // 延迟恢复上次保存的窗口大小和位置（等 modal 渲染完成）
        setTimeout(() => this.restoreModalSize(), 100);

        // 标题
        new Setting(contentEl).setName(this.$('inline.title')).setHeading();
        this.addDragHandle();

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

        // 结果展示区域
        const resultEl = contentEl.createDiv({ cls: 'mb-result-section' });

        this.loadingEl = resultEl.createDiv({ cls: 'mb-loading' });
        this.loadingEl.setText(this.$('inline.loading'));

        this.previewEl = resultEl.createDiv({ cls: 'mb-preview' });
        this.previewEl.addClass('mb-preview-hidden');

        // 追问输入区（初始隐藏）
        this.followUpContainer = contentEl.createDiv({ cls: 'mb-follow-up-container mb-follow-up-hidden' });
        const followUpLabel = this.followUpContainer.createDiv({ cls: 'mb-follow-up-label' });
        followUpLabel.createSpan({ text: '继续沟通' });
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
                    this.scrollToBottom();
                },
                () => {
                    this.result = fullResponse;
                    this.conversationMessages.push({ role: 'assistant' as const, content: fullResponse });
                    // 显示操作按钮和追问区
                    this.showActionButtons();
                    this.showFollowUp();
                    this.scrollToBottom();
                },
            );
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.loadingEl.setText(`错误: ${msg}`);
            this.loadingEl.addClass('mb-error');
        }
    }

    private buildPrompt(): string {
        if (this.action === 'custom' && this.customInstruction) {
            return `请按照以下要求修改这段文字：\n\n要求：${this.customInstruction}\n\n原文：\n${this.selectedText}\n\n请直接输出修改后的文字，不要添加任何解释。`;
        }

        const actionPrompt = ACTION_PROMPTS[this.action];
        return `${actionPrompt}\n\n${this.selectedText}\n\n请直接输出修改后的文字，不要添加任何解释。`;
    }

    private showActionButtons() {
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

        // 显示流式预览
        this.previewEl.removeClass('mb-preview-hidden');
        this.previewEl.setText('');
        this.loadingEl.removeClass('mb-loading-hidden');
        this.loadingEl.setText(this.$('inline.loading'));

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
                    this.scrollToBottom();
                },
                () => {
                    this.result = fullResponse;
                    this.conversationMessages.push({ role: 'assistant' as const, content: fullResponse });
                    this.isStreaming = false;
                    this.followUpInput.disabled = false;
                    this.showFollowUp();
                    this.scrollToBottom();
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

    close() {
        // 在 modal 从 DOM 移除之前保存尺寸和位置
        this.saveModalSize();
        super.close();
    }

    onClose() {
        this.contentEl.empty();
    }

    /** 恢复上次保存的窗口大小 */
    private restoreModalSize() {
        const saved = this.plugin.settings.inlineEditModalSize;
        if (!saved) return;

        // 用 !important 覆盖 CSS 中的 width/max-width 规则
        if (saved.width) {
            this.modalEl.style.setProperty('width', `${saved.width}px`, 'important');
            this.modalEl.style.setProperty('max-width', `${saved.width}px`, 'important');
        }
        if (saved.height) {
            this.modalEl.style.height = `${saved.height}px`;
            this.modalEl.style.setProperty('max-height', '95vh', 'important');
        }
    }

    /** 保存当前窗口大小和位置 */
    private saveModalSize() {
        const rect = this.modalEl.getBoundingClientRect();
        if (rect.width < 480 || rect.height < 360) return;

        // 计算相对于屏幕中心的偏移量
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const modalCenterX = rect.left + rect.width / 2;
        const modalCenterY = rect.top + rect.height / 2;
        const offsetX = Math.round(modalCenterX - centerX);
        const offsetY = Math.round(modalCenterY - centerY);

        this.plugin.settings.inlineEditModalSize = {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            offsetX,
            offsetY,
        };
        void this.plugin.saveSettings();
    }

    /** 添加右下角拖拽手柄，支持调整窗口大小 */
    private addResizeHandle() {
        const handle = this.modalEl.createDiv({ cls: 'mb-resize-handle' });
        let startX = 0, startY = 0, startW = 0, startH = 0;
        let saveTimer: ReturnType<typeof setTimeout> | null = null;

        const onMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
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
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => this.saveModalSize(), 50);
        };

        handle.addEventListener('mousedown', onMouseDown);
    }

    /** 滚动 modal 到底部 */
    private scrollToBottom() {
        if (!this.previewEl || this.previewEl.classList.contains('mb-preview-hidden')) return;
        setTimeout(() => {
            // 遍历祖先，找到实际有滚动的元素
            let el: HTMLElement | null = this.previewEl;
            while (el && el !== document.body) {
                if (el.scrollHeight > el.clientHeight + 2) {
                    el.scrollTop = el.scrollHeight;
                    return;
                }
                el = el.parentElement;
            }
        }, 50);
    }

    /** 添加标题栏拖拽，支持移动窗口位置 */
    private addDragHandle() {
        const header = this.contentEl.querySelector('.setting-item-heading');
        if (!header) return;

        header.style.cursor = 'move';

        let startX = 0, startY = 0, startOffsetX = 0, startOffsetY = 0;
        let saveTimer: ReturnType<typeof setTimeout> | null = null;

        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            const target = e.target as HTMLElement;
            if (target.tagName === 'BUTTON' || target.closest('button')) return;

            e.preventDefault();
            startX = e.pageX;
            startY = e.pageY;

            const saved = this.plugin.settings.inlineEditModalSize;
            startOffsetX = saved?.offsetX ?? 0;
            startOffsetY = saved?.offsetY ?? 0;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e: MouseEvent) => {
            const deltaX = e.pageX - startX;
            const deltaY = e.pageY - startY;
            const newOffsetX = startOffsetX + deltaX;
            const newOffsetY = startOffsetY + deltaY;

            // 用 position: fixed 定位内部 .modal 元素（不破坏滚动链）
            const modal = this.modalEl.querySelector('.modal') as HTMLElement;
            if (modal) {
                modal.style.setProperty('position', 'fixed', 'important');
                modal.style.setProperty('top', `${newOffsetY}px`, 'important');
                modal.style.setProperty('left', `${newOffsetX}px`, 'important');
                modal.style.setProperty('margin', '0', 'important');
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => this.saveModalSize(), 50);
        };

        header.addEventListener('mousedown', onMouseDown);
    }
}
