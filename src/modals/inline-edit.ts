// modals/inline-edit.ts - 内联编辑 Modal
import { App, Modal, Notice } from 'obsidian';
import type FleurPilotPlugin from '../main';
import { LLMService, ChatMessage } from '../core/llm-service';
import { wordDiff, mergeDiffParts, generateDiffHtml } from '../utils/diff';
import { t } from '../i18n';

/**
 * 内联编辑操作类型
 */
export type InlineEditAction =
    | 'explain'      // 解释
    | 'simplify'     // 精简
    | 'expand'       // 扩写
    | 'polish'       // 润色
    | 'translate_zh' // 翻译为中文
    | 'translate_en' // 翻译为英文
    | 'proofread'    // 审读校对
    | 'custom';      // 自定义指令

/**
 * 预设操作的 prompt
 */
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

    // UI 元素
    private inputEl!: HTMLTextAreaElement;
    private previewEl!: HTMLElement;
    private applyBtn!: HTMLButtonElement;
    private loadingEl!: HTMLElement;

    constructor(
        app: App,
        plugin: FleurPilotPlugin,
        selectedText: string,
        action: InlineEditAction,
        customInstruction: string,
        onApply: (text: string) => void
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

        // 标题
        const titleEl = contentEl.createEl('h3', { text: this.$('inline.title') });
        titleEl.addClass('mb-modal-title');

        // 原文区域
        const originalEl = contentEl.createDiv({ cls: 'mb-original-section' });
        originalEl.createEl('div', { text: this.$('inline.original'), cls: 'mb-section-label' });
        originalEl.createEl('pre', { text: this.selectedText, cls: 'mb-original-text' });

        // 改写结果区域
        const resultEl = contentEl.createDiv({ cls: 'mb-result-section' });
        resultEl.createEl('div', { text: this.$('inline.result'), cls: 'mb-section-label' });

        this.loadingEl = resultEl.createDiv({ cls: 'mb-loading' });
        this.loadingEl.setText(this.$('inline.loading'));

        this.previewEl = resultEl.createDiv({ cls: 'mb-preview' });
        this.previewEl.style.display = 'none';

        // 构造 prompt
        const prompt = this.buildPrompt();

        // 调用 AI
        const messages: ChatMessage[] = [
            { role: 'user', content: prompt }
        ];

        const llm = new LLMService(this.plugin.settings);
        let fullResponse = '';

        try {
            await llm.sendMessage(
                messages,
                (chunk) => {
                    fullResponse += chunk;
                    this.previewEl.style.display = 'block';
                    this.previewEl.setText(fullResponse);
                    this.loadingEl.style.display = 'none';
                },
                () => {
                    // 完成
                    this.result = fullResponse;
                    this.showDiffView();
                }
            );
        } catch (error: any) {
            this.loadingEl.setText(`错误: ${error.message}`);
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

    private showDiffView() {
        if (!this.result) return;

        // 清空 preview，显示 diff
        this.previewEl.empty();
        this.previewEl.addClass('mb-diff-view');

        const diff = wordDiff(this.selectedText, this.result);
        const merged = mergeDiffParts(diff);
        this.previewEl.innerHTML = generateDiffHtml(merged);
        this.previewEl.style.display = 'block';

        // 按钮区域
        const btnContainer = this.contentEl.createDiv({ cls: 'mb-button-container' });

        const cancelBtn = btnContainer.createEl('button', { text: this.$('inline.cancel'), cls: 'mb-btn mb-btn-cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        this.applyBtn = btnContainer.createEl('button', { text: this.$('inline.apply'), cls: 'mb-btn mb-btn-apply' });
        this.applyBtn.addEventListener('click', () => {
            if (this.result) {
                this.onApply(this.result);
                new Notice(this.$('inline.applied'));
                this.close();
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
