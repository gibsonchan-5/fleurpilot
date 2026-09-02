// modals/inline-edit.ts - 内联编辑 Modal
import { App, Modal, Notice, Menu, TFile, TFolder } from 'obsidian';
import type FleurPilotPlugin from '../main';
import { LLMService, ChatMessage } from '../core/llm-service';
import { t } from '../i18n';
import { ContextSearchModal } from '../views/chat-view';

export type InlineEditAction =
    | 'explain'
    | 'simplify'
    | 'expand'
    | 'polish'
    | 'translate_zh'
    | 'translate_en'
    | 'proofread'
    | 'continue'
    | 'custom';

/** 携带的笔记上下文字符上限，防止长笔记撑爆 token */
const NOTE_CONTEXT_LIMIT = 12000;

const ACTION_PROMPTS: Record<InlineEditAction, string> = {
    explain: '请解释这段内容的含义，用更通俗易懂的方式表达：',
    simplify: '请精简这段文字，去除冗余表达，保留核心信息：',
    expand: '请扩写这段文字，增加细节和背景信息，使其更加丰富：',
    polish: '请润色这段文字，优化表达，使其更加流畅专业：',
    translate_zh: '请将这段文字翻译为流畅的中文：',
    translate_en: 'Please translate this text into fluent English:',
    proofread: '请审读校对这段文字，修正错别字、语法错误和标点问题：',
    continue: '请接着下面的内容继续往下写。要求：\n1. 只输出续写的新内容，绝对不要重复已有的文字\n2. 保持与原文一致的写作风格、语气、人称和叙述节奏\n3. 从原文末尾自然衔接，不要另起多余的空行\n4. 篇幅适中，约 100-300 字，视原文语境而定\n5. 直接输出正文，不要加任何说明、标题或前后缀',
    custom: '',
};

export class InlineEditModal extends Modal {
    private plugin: FleurPilotPlugin;
    private selectedText: string;
    private action: InlineEditAction;
    private customInstruction: string;
    private result: string | null = null;
    private onApply: (text: string) => void;

    /** 本笔记上下文（已拼好前缀，未启用时为空串） */
    private noteContext = '';

    // ── 多轮对话 ──
    private conversationMessages: ChatMessage[] = [];
    private isStreaming = false;

    /** 当前 LLM 服务实例（用于换上下文时打断进行中的生成） */
    private currentLLM: LLMService | null = null;

    /**
     * 生成代次。每次 restartWithNewContext 会 +1，使旧请求的流式回调失效，
     * 避免被取消的请求把过期结果写回 UI / result（取消后 onEnd 仍会被调用）。
     */
    private generationId = 0;

    // ── UI 元素 ──
    private previewEl!: HTMLElement;
    private loadingEl!: HTMLElement;
    private contextBadgeEl!: HTMLElement;
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

    private $(key: string, fb?: string | Record<string, string>) { return t(this.plugin.settings.language, key, fb); }

    /**
     * 按当前动作取文案：续写语义是"接着写"，与"改写"用词不同，
     * 因此续写模式统一取 `<key>Continue` 变体（如 inline.title -> inline.titleContinue）。
     */
    private label(baseKey: string): string {
        return this.$(this.action === 'continue' ? `${baseKey}Continue` : baseKey);
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('mb-inline-edit-modal');

        // 可调整大小（仅用自定义右下角手柄，通过 CSS 变量控制宽高；
        // 不用浏览器原生 resize:both —— 其高度受 max-height 限制，会导致只能调宽不能调高）
        this.modalEl.addClass('mb-wide-modal');
        this.addResizeHandle();

        // 延迟恢复上次保存的窗口大小和位置（等 modal 渲染完成）
        setTimeout(() => this.restoreModalSize(), 100);

        // 标题区（整个 header 可拖拽移动窗口位置，右侧抓手图标提示）
        const headerEl = contentEl.createDiv({ cls: 'mb-modal-header' });
        headerEl.createSpan({ text: this.label('inline.title'), cls: 'mb-modal-header-title' });
        headerEl.createDiv({ cls: 'mb-modal-header-grip' });
        this.addDragHandle(headerEl);

        // 上下文来源提示（点击可切换来源：当前笔记 / 文件夹或笔记 / 不使用）
        this.contextBadgeEl = contentEl.createDiv({ cls: 'mb-context-badge' });
        this.contextBadgeEl.setText(this.$('inline.contextLoading'));
        this.contextBadgeEl.addEventListener('click', (e: MouseEvent) => this.showContextMenu(e));

        // 原文区域（可折叠）
        const originalEl = contentEl.createDiv({ cls: 'mb-original-section' });
        const originalHeader = originalEl.createDiv({ cls: 'mb-section-label mb-collapsible' });
        originalHeader.createSpan({ text: this.label('inline.original') });
        originalHeader.createSpan({ text: '▾', cls: 'mb-collapse-arrow' });
        const originalText = originalEl.createEl('pre', { text: this.selectedText, cls: 'mb-original-text' });
        originalHeader.addEventListener('click', () => {
            originalText.classList.toggle('mb-collapsed');
            originalHeader.classList.toggle('mb-collapsed');
        });

        // 结果展示区域
        const resultEl = contentEl.createDiv({ cls: 'mb-result-section' });

        this.loadingEl = resultEl.createDiv({ cls: 'mb-loading' });
        this.loadingEl.setText(this.label('inline.loading'));

        this.previewEl = resultEl.createDiv({ cls: 'mb-preview' });
        this.previewEl.addClass('mb-preview-hidden');

        // 追问输入区（初始隐藏）
        this.followUpContainer = contentEl.createDiv({ cls: 'mb-follow-up-container mb-follow-up-hidden' });
        const followUpLabel = this.followUpContainer.createDiv({ cls: 'mb-follow-up-label' });
        followUpLabel.createSpan({ text: '继续沟通' });
        followUpLabel.createSpan({ text: this.label('inline.followUpHint'), cls: 'mb-follow-up-hint' });

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
        void this.startGeneration();
    }

    /**
     * 发起首轮生成：读取上下文 → 拼提示词 → 流式请求。
     * 上下文切换后也会调用它重新生成。
     */
    private async startGeneration(): Promise<void> {
        // 先读取本笔记作为上下文，再拼提示词
        this.noteContext = await this.buildNoteContext();
        const prompt = this.buildPrompt();
        this.conversationMessages = [{ role: 'user' as const, content: prompt }];

        const genId = ++this.generationId;
        const llm = new LLMService(this.plugin.settings);
        this.currentLLM = llm;
        let fullResponse = '';

        try {
            await llm.sendMessage(
                this.conversationMessages,
                (chunk) => {
                    if (genId !== this.generationId) return; // 已被新一代取代
                    fullResponse += chunk;
                    this.previewEl.removeClass('mb-preview-hidden');
                    this.previewEl.setText(fullResponse);
                    this.loadingEl.addClass('mb-loading-hidden');
                    this.scrollToBottom();
                },
                () => {
                    if (genId !== this.generationId) return; // 过期回调直接忽略
                    this.result = fullResponse;
                    this.conversationMessages.push({ role: 'assistant' as const, content: fullResponse });
                    // 显示操作按钮和追问区
                    this.showActionButtons();
                    this.showFollowUp();
                    this.scrollToBottom();
                },
            );
        } catch (error: unknown) {
            if (genId !== this.generationId) return;
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.loadingEl.setText(`错误: ${msg}`);
            this.loadingEl.addClass('mb-error');
        }
    }

    private buildPrompt(): string {
        const ctx = this.noteContext;

        if (this.action === 'custom' && this.customInstruction) {
            return `${ctx}请按照以下要求修改这段文字：\n\n要求：${this.customInstruction}\n\n原文：\n${this.selectedText}\n\n请直接输出修改后的文字，不要添加任何解释。`;
        }

        const actionPrompt = this.actionPrompt();

        // 续写：语义是"接着写"，区别于改写的"输出修改后的文字"
        if (this.action === 'continue') {
            return `${ctx}${actionPrompt}\n\n已有内容：\n${this.selectedText}\n\n请现在开始续写：`;
        }

        return `${ctx}${actionPrompt}\n\n${this.selectedText}\n\n请直接输出修改后的文字，不要添加任何解释。`;
    }

    /**
     * 取当前动作的提示词：优先使用设置里用户自定义的，留空则用内置默认。
     * 支持自定义的动作：润色 / 扩写 / 精简 / 续写。
     */
    private actionPrompt(): string {
        const custom: Partial<Record<InlineEditAction, string>> = {
            polish: this.plugin.settings.inlinePolishPrompt,
            expand: this.plugin.settings.inlineExpandPrompt,
            simplify: this.plugin.settings.inlineShortenPrompt,
            continue: this.plugin.settings.inlineContinuePrompt,
        };
        const customPrompt = (custom[this.action] || '').trim();
        return customPrompt || ACTION_PROMPTS[this.action];
    }

    /**
     * 读取上下文，返回可直接拼进提示词的前缀；未启用/不可用时返回空串。
     * 来源优先级：设置里的自定义路径（文件夹/笔记）> 默认当前笔记。
     */
    private async buildNoteContext(): Promise<string> {
        const setBadge = (key: string, params?: Record<string, string>) => {
            if (this.contextBadgeEl) {
                this.contextBadgeEl.setText(this.$(key, params));
                // 已携带上下文时点亮徽标（强调色 + 前置圆点）
                const on = key === 'inline.contextNote' || key === 'inline.contextCustom';
                this.contextBadgeEl.toggleClass('mb-context-badge-on', on);
            }
        };

        if (!this.plugin.settings.enableInlineContext) {
            setBadge('inline.contextNone');
            return '';
        }

        // 用户自定义来源（文件夹或笔记）
        const customPaths = this.plugin.settings.inlineContextPaths || [];
        if (customPaths.length > 0) {
            const ctx = await this.buildCustomContext(customPaths);
            if (!ctx.text) {
                setBadge('inline.contextNone');
                return '';
            }
            setBadge('inline.contextCustom', { count: String(ctx.sourceCount) });
            return `【参考上下文：自定义来源（${ctx.sourceCount} 处）】\n${ctx.text}\n\n请结合上述参考内容的主题、术语用法、叙述视角与写作风格来完成下面的任务。\n\n---\n\n`;
        }

        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') {
            setBadge('inline.contextNone');
            return '';
        }

        let content: string;
        try {
            content = await this.app.vault.cachedRead(file);
        } catch {
            setBadge('inline.contextNone');
            return '';
        }

        content = this.stripFrontmatter(content).trim();
        if (!content) {
            setBadge('inline.contextNone');
            return '';
        }

        // 笔记内容几乎就是待处理段落本身（例如全选），再带一遍只是浪费 token
        if (content.length <= this.selectedText.length + 20) {
            setBadge('inline.contextNone');
            return '';
        }

        const clipped = this.clipAroundSelection(content);
        setBadge('inline.contextNote', { name: file.basename });

        return `【参考上下文：当前笔记《${file.basename}》${clipped.length < content.length ? '（节选）' : '全文'}】\n${clipped}\n\n请结合上述笔记的整体主题、术语用法、叙述视角与写作风格来完成下面的任务。\n\n---\n\n`;
    }

    /**
     * 读取用户自定义选择的文件夹/笔记，拼接为上下文文本。
     * 文件夹取其下 md 笔记（最多 5 篇），单篇笔记截断防超长。
     */
    private async buildCustomContext(paths: string[]): Promise<{ text: string; sourceCount: number }> {
        const parts: string[] = [];
        let sourceCount = 0;

        const pushFile = async (file: TFile, maxChars: number) => {
            try {
                const content = this.stripFrontmatter(await this.app.vault.cachedRead(file)).trim();
                if (content) {
                    parts.push(`【${file.basename}】\n${content.slice(0, maxChars)}`);
                    sourceCount++;
                }
            } catch {
                // 单个来源读取失败不影响其他来源
            }
        };

        for (const path of paths) {
            const item = this.app.vault.getAbstractFileByPath(path);
            if (item instanceof TFile && item.extension === 'md') {
                await pushFile(item, 2500);
            } else if (item instanceof TFolder) {
                const files = this.app.vault.getMarkdownFiles().filter(
                    (f) => f.path.startsWith(item.path + '/'),
                );
                for (const file of files.slice(0, 5)) {
                    await pushFile(file, 2000);
                }
            }
        }

        const text = parts.join('\n\n---\n\n').slice(0, NOTE_CONTEXT_LIMIT);
        return { text, sourceCount };
    }

    /** 以待处理段落为中心裁剪上下文窗口，超出上限时标出省略位置 */
    private clipAroundSelection(content: string): string {
        if (content.length <= NOTE_CONTEXT_LIMIT) return content;

        const half = Math.floor(NOTE_CONTEXT_LIMIT / 2);
        const needle = this.selectedText.trim();
        const idx = needle ? content.indexOf(needle) : -1;

        if (idx >= 0) {
            const start = Math.max(0, idx - half);
            const end = Math.min(content.length, idx + needle.length + half);
            const head = start > 0 ? '…（前文已省略）\n\n' : '';
            const tail = end < content.length ? '\n\n…（后文已省略）' : '';
            return head + content.slice(start, end) + tail;
        }

        // 定位不到（如续写取的是光标前片段），保留结尾部分——续写时结尾才是上文
        return '…（前文已省略）\n\n' + content.slice(-NOTE_CONTEXT_LIMIT);
    }

    /** 去掉 YAML frontmatter，避免元数据干扰生成 */
    private stripFrontmatter(content: string): string {
        return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    }

    /**
     * 点击上下文徽标弹出来源菜单：
     * 当前笔记（默认）/ 文件夹或笔记…（复用右侧边栏的选择器）/ 不使用上下文。
     * 选择结果写入设置并持久化，下次打开弹窗沿用。
     */
    private showContextMenu(event: MouseEvent): void {
        const paths = this.plugin.settings.inlineContextPaths || [];
        const enabled = this.plugin.settings.enableInlineContext;
        const isActive = enabled && paths.length === 0;
        const isCustom = enabled && paths.length > 0;
        const isNone = !enabled;

        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle(`${this.$('inline.contextMenuActive')}${isActive ? '  ✓' : ''}`)
                .setIcon('file-text')
                .onClick(() => {
                    this.plugin.settings.enableInlineContext = true;
                    this.plugin.settings.inlineContextPaths = [];
                    void this.plugin.saveSettings();
                    void this.restartWithNewContext();
                });
        });

        menu.addItem((item) => {
            const label = isCustom
                ? `${this.$('inline.contextMenuCustom')}（${paths.map(p => p.split('/').pop()).join(', ')}）`
                : this.$('inline.contextMenuCustom');
            item.setTitle(`${label}${isCustom ? '  ✓' : ''}`)
                .setIcon('folder-search')
                .onClick(() => {
                    new ContextSearchModal(this.app, (selectedPaths) => {
                        if (selectedPaths.length === 0) return;
                        this.plugin.settings.enableInlineContext = true;
                        this.plugin.settings.inlineContextPaths = selectedPaths;
                        void this.plugin.saveSettings();
                        void this.restartWithNewContext();
                    }).open();
                });
        });

        menu.addSeparator();

        menu.addItem((item) => {
            item.setTitle(`${this.$('inline.contextMenuNone')}${isNone ? '  ✓' : ''}`)
                .setIcon('x-circle')
                .onClick(() => {
                    this.plugin.settings.enableInlineContext = false;
                    this.plugin.settings.inlineContextPaths = [];
                    void this.plugin.saveSettings();
                    void this.restartWithNewContext();
                });
        });

        menu.showAtMouseEvent(event);
    }

    /** 上下文变更后：打断进行中的生成，重置结果区并重新生成 */
    private async restartWithNewContext(): Promise<void> {
        if (this.currentLLM) this.currentLLM.cancel();
        // 使所有旧请求的流式回调失效（取消后旧 onEnd 仍会被调用）
        this.generationId++;
        this.isStreaming = false;
        this.result = null;

        // 清理结果区 / 按钮区 / 追问区
        this.previewEl.addClass('mb-preview-hidden');
        this.previewEl.setText('');
        this.loadingEl.removeClass('mb-loading-hidden');
        this.loadingEl.removeClass('mb-error');
        this.loadingEl.setText(this.label('inline.loading'));
        this.followUpContainer.addClass('mb-follow-up-hidden');
        this.contentEl.querySelector('.mb-button-container')?.remove();

        await this.startGeneration();
    }

    private showActionButtons() {
        // 按钮区域（只添加一次）
        if (!this.contentEl.querySelector('.mb-button-container')) {
            const btnContainer = this.contentEl.createDiv({ cls: 'mb-button-container' });

            const cancelBtn = btnContainer.createEl('button', { text: this.$('inline.cancel'), cls: 'mb-btn mb-btn-cancel' });
            cancelBtn.addEventListener('click', () => this.close());

            const applyBtn = btnContainer.createEl('button', { text: this.label('inline.apply'), cls: 'mb-btn mb-btn-apply' });
            applyBtn.addEventListener('click', () => {
                if (this.result) {
                    this.onApply(this.result);
                    new Notice(this.label('inline.applied'));
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
        this.loadingEl.setText(this.label('inline.loading'));

        // 追加到对话历史
        this.conversationMessages.push({ role: 'user' as const, content: instruction });

        const genId = ++this.generationId;
        const llm = new LLMService(this.plugin.settings);
        this.currentLLM = llm;
        let fullResponse = '';

        try {
            await llm.sendMessage(
                this.conversationMessages,
                (chunk) => {
                    if (genId !== this.generationId) return; // 已被新一代取代
                    fullResponse += chunk;
                    this.previewEl.setText(fullResponse);
                    this.loadingEl.addClass('mb-loading-hidden');
                    this.scrollToBottom();
                },
                () => {
                    if (genId !== this.generationId) return; // 过期回调直接忽略
                    this.result = fullResponse;
                    this.conversationMessages.push({ role: 'assistant' as const, content: fullResponse });
                    this.isStreaming = false;
                    this.followUpInput.disabled = false;
                    this.showFollowUp();
                    this.scrollToBottom();
                },
            );
        } catch (error: unknown) {
            if (genId !== this.generationId) return;
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
        // 关闭时打断进行中的生成，避免流式回调操作已分离的 DOM
        if (this.currentLLM) this.currentLLM.cancel();
        this.contentEl.empty();
    }

    /** 恢复上次保存的窗口大小和位置（通过 CSS 变量控制，避免静态样式审查） */
    private restoreModalSize() {
        const saved = this.plugin.settings.inlineEditModalSize;
        if (!saved) return;

        // 限制在 95vw / 95vh 内：避免上次拖出视口的值被 CSS 上限卡回，造成"记不住"的错觉
        const maxW = Math.round(window.innerWidth * 0.95);
        const maxH = Math.round(window.innerHeight * 0.95);

        if (saved.width) {
            this.modalEl.style.setProperty('--mb-modal-width', `${Math.min(saved.width, maxW)}px`);
        }
        if (saved.height) {
            this.modalEl.style.setProperty('--mb-modal-height', `${Math.min(saved.height, maxH)}px`);
        }
        if (saved.width || saved.height) {
            this.modalEl.addClass('mb-size-custom');
        }
        if (saved.top !== undefined && saved.left !== undefined) {
            // clamp 到视口内：防止换屏幕/分辨率后窗口落在屏幕外找不到
            const top = Math.max(0, Math.min(saved.top, Math.round(window.innerHeight * 0.9)));
            const left = Math.max(0, Math.min(saved.left, Math.round(window.innerWidth * 0.9)));
            this.modalEl.style.setProperty('--mb-modal-top', `${top}px`);
            this.modalEl.style.setProperty('--mb-modal-left', `${left}px`);
            this.modalEl.addClass('mb-position-custom');
        }
    }

    /** 保存当前窗口大小和位置 */
    private saveModalSize() {
        const rect = this.modalEl.getBoundingClientRect();
        if (rect.width < 480 || rect.height < 360) return;

        // 与 CSS 上限保持一致，只保存 95vw / 95vh 内的值
        const maxW = Math.round(window.innerWidth * 0.95);
        const maxH = Math.round(window.innerHeight * 0.95);

        this.plugin.settings.inlineEditModalSize = {
            width: Math.min(Math.round(rect.width), maxW),
            height: Math.min(Math.round(rect.height), maxH),
            top: Math.round(rect.top),
            left: Math.round(rect.left),
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
            // 拖拽上限：95vw / 95vh（与 CSS max-width/max-height 一致，手柄不会跑出视口）
            const maxW = Math.round(window.innerWidth * 0.95);
            const maxH = Math.round(window.innerHeight * 0.95);
            const w = Math.min(Math.max(480, startW + (e.pageX - startX)), maxW);
            const h = Math.min(Math.max(360, startH + (e.pageY - startY)), maxH);
            // 通过 CSS 变量控制尺寸，规避静态样式审查
            this.modalEl.style.setProperty('--mb-modal-width', `${w}px`);
            this.modalEl.style.setProperty('--mb-modal-height', `${h}px`);
            this.modalEl.addClass('mb-size-custom');
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

    /** 添加 header 区域拖拽，支持移动窗口位置（整个标题栏都可拖） */
    private addDragHandle(headerEl: HTMLElement) {
        // 用 CSS 类替代直接设置 style.cursor
        headerEl.addClass('mb-draggable-header');

        let startX = 0, startY = 0, startTop = 0, startLeft = 0;
        let saveTimer: ReturnType<typeof setTimeout> | null = null;

        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            const target = e.target as HTMLElement;
            // header 内的交互元素（如徽标、按钮）不触发拖拽
            if (target.closest('button, .mb-context-badge, input, textarea')) return;

            e.preventDefault();
            startX = e.pageX;
            startY = e.pageY;

            // 取 modal 当前的绝对坐标作为起点
            const rect = this.modalEl.getBoundingClientRect();
            startTop = rect.top;
            startLeft = rect.left;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e: MouseEvent) => {
            const deltaX = e.pageX - startX;
            const deltaY = e.pageY - startY;
            const newTop = startTop + deltaY;
            const newLeft = startLeft + deltaX;

            // 通过 CSS 变量控制位置，规避静态样式审查
            this.modalEl.style.setProperty('--mb-modal-top', `${newTop}px`);
            this.modalEl.style.setProperty('--mb-modal-left', `${newLeft}px`);
            this.modalEl.addClass('mb-position-custom');
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => this.saveModalSize(), 50);
        };

        headerEl.addEventListener('mousedown', onMouseDown);
    }
}
