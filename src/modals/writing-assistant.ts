// modals/writing-assistant.ts - 写作助手 Modal
import { App, Modal, Notice } from 'obsidian';
import type FleurPilotPlugin from '../main';
import { LLMService, ChatMessage } from '../core/llm-service';
import { t } from '../i18n';

/**
 * 写作助手任务类型
 */
export type WritingTask =
    | 'review'       // 审读校对
    | 'suggest'      // 写作建议
    | 'structure'    // 结构分析
    | 'tone'         // 语气风格分析
    | 'summary';     // 内容摘要

const TASK_PROMPTS: Record<WritingTask, string> = {
    review: `你是一位资深编辑，请审读以下文章，指出：
1. 错别字和语法错误
2. 标点符号使用不当
3. 行文不通顺的地方
4. 逻辑矛盾或表达不清

请以清单形式列出问题，并给出修改建议。`,

    suggest: `你是一位写作教练，请阅读以下文章，从以下角度给出改进建议：
1. 论点是否清晰有力
2. 论据是否充分
3. 结构是否合理
4. 语言表达是否精准
5. 读者体验如何

请给出具体的、可操作的建议。`,

    structure: `你是一位文章结构分析师，请分析以下文章的结构：
1. 段落之间的逻辑关系
2. 是否有清晰的开头、主体、结尾
3. 各部分比例是否协调
4. 是否存在冗余或缺失

请画出结构图并给出优化建议。`,

    tone: `你是一位语言风格专家，请分析以下文章的语言风格：
1. 整体语气（正式/非正式/学术/口语化）
2. 用词特点
3. 句式变化
4. 与目标读者是否匹配

请给出风格评价和调整建议。`,

    summary: `请为以下文章生成一份结构化摘要：
1. 核心观点（一句话）
2. 主要内容（3-5 个要点）
3. 结论/启示

请简洁精炼。`,
};

export class WritingAssistantModal extends Modal {
    private plugin: FleurPilotPlugin;
    private noteContent: string;
    private noteTitle: string;
    private task: WritingTask;

    private resultEl!: HTMLElement;
    private loadingEl!: HTMLElement;

    constructor(
        app: App,
        plugin: FleurPilotPlugin,
        noteContent: string,
        noteTitle: string,
        task: WritingTask
    ) {
        super(app);
        this.plugin = plugin;
        this.noteContent = noteContent;
        this.noteTitle = noteTitle;
        this.task = task;
    }

    private $(key: string, fb?: string) { return t(this.plugin.settings.language, key, fb); }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('mb-writing-assistant-modal');

        // 标题
        const titleMap: Record<WritingTask, string> = {
            review: this.$('assist.review'),
            suggest: this.$('assist.suggest'),
            structure: this.$('assist.structure'),
            tone: this.$('assist.tone'),
            summary: this.$('assist.summary'),
        };
        contentEl.createEl('h3', { text: titleMap[this.task], cls: 'mb-modal-title' });

        // 笔记信息
        const infoEl = contentEl.createDiv({ cls: 'mb-note-info' });
        infoEl.createEl('div', { text: this.noteTitle, cls: 'mb-note-title' });

        // 结果区域
        const resultContainer = contentEl.createDiv({ cls: 'mb-result-container' });
        this.loadingEl = resultContainer.createDiv({ cls: 'mb-loading' });
        this.loadingEl.setText(this.$('assist.loading'));

        this.resultEl = resultContainer.createDiv({ cls: 'mb-result-content' });
        this.resultEl.style.display = 'none';

        // 构造消息
        const systemPrompt = TASK_PROMPTS[this.task];
        const userPrompt = `文章标题：${this.noteTitle}\n\n文章内容：\n${this.noteContent}`;

        const messages: ChatMessage[] = [
            { role: 'user', content: userPrompt }
        ];

        const llm = new LLMService(this.plugin.settings);
        let fullResponse = '';

        try {
            // 临时覆盖系统提示词
            const originalPrompt = this.plugin.settings.systemPrompt;
            this.plugin.settings.systemPrompt = systemPrompt;

            await llm.sendMessage(
                messages,
                (chunk) => {
                    fullResponse += chunk;
                    this.resultEl.style.display = 'block';
                    this.renderMarkdown(this.resultEl, fullResponse);
                    this.loadingEl.style.display = 'none';
                },
                () => {
                    this.plugin.settings.systemPrompt = originalPrompt;
                }
            );
        } catch (error: any) {
            this.loadingEl.setText(`错误: ${error.message}`);
            this.loadingEl.addClass('mb-error');
        }
    }

    private renderMarkdown(container: HTMLElement, content: string) {
        container.empty();
        const lines = content.split('\n');
        let currentP: HTMLElement | null = null;
        let inList = false;
        let inCode = false;
        let codeContent = '';

        lines.forEach(line => {
            // 代码块
            if (line.startsWith('```')) {
                if (!inCode) {
                    inCode = true;
                    codeContent = '';
                } else {
                    inCode = false;
                    const pre = container.createEl('pre');
                    pre.createEl('code', { text: codeContent });
                }
                return;
            }
            if (inCode) {
                codeContent += (codeContent ? '\n' : '') + line;
                return;
            }

            // 标题
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                currentP = null;
                const level = headingMatch[1].length;
                container.createEl(`h${level}`, { text: headingMatch[2] });
                return;
            }

            // 列表
            const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
            if (listMatch) {
                if (!inList) {
                    inList = true;
                }
                const ul = container.querySelector('ul:last-child') || container.createEl('ul');
                ul.createEl('li', { text: listMatch[1] });
                currentP = null;
                return;
            } else {
                inList = false;
            }

            // 空行
            if (line.trim() === '') {
                currentP = null;
                return;
            }

            // 普通段落
            if (!currentP) {
                currentP = container.createEl('p');
            } else {
                currentP.createEl('br');
            }
            currentP.appendText(line);
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
