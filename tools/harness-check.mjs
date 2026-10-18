// tools/harness-check.mjs — 对样机做 CDP 量测并按期望表断言
// 用法：node tools/harness-check.mjs            （exit 0 = 全绿）
// 期望表 EXPECT 由各界面任务追加：先加期望跑红，再改 CSS 跑绿。
// 断言只读「实际解析后的计算值」，不读 getPropertyValue 的未替换 token 文本。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.PORT || 9333);
const REPO = process.cwd();
const url = (s, th, w, mw, mh, fs) => `file://${REPO}/tools/ui-harness.html?surface=${s}&theme=${th}&w=${w}` + (mw ? `&modalw=${mw}` : '') + (mh ? `&modalh=${mh}` : '') + (fs ? `&fs=${fs}` : '');

// { surface, theme, w, mw?, mh?, sel, prop, expect }
// expect: 'eq:v' | 'not:v' | 'gte:v' | 'lte:v' | 're:正则' | 'nonzero' | 'notnone'
const EXPECT = [
    // ── Task 3：harness 与刻度层自检（token 必须真的解析成可用值）──
    { surface: 'chat', theme: 'light', w: 360, sel: '#fp-probe-accent', prop: 'backgroundColor', expect: 'not:rgba(0, 0, 0, 0)' },
    { surface: 'chat', theme: 'dark', w: 360, sel: '#fp-probe-accent', prop: 'backgroundColor', expect: 'not:rgba(0, 0, 0, 0)' },
    { surface: 'chat', theme: 'light', w: 360, sel: '#fp-probe-body', prop: 'fontSize', expect: 'eq:16px' },
    { surface: 'chat', theme: 'light', w: 360, sel: '#fp-probe-gutter', prop: 'w', expect: 'eq:20' },
    // 细档是 0.5px（基线约定，Retina 上才是 1 物理像素）；写成 1px 就是全站描边粗一档。
    // 注意：Chrome 会把 border-width 吸附到整数**物理**像素，所以这条断言只在 dpr=2 下成立
    // ——本脚本固定 --force-device-scale-factor=2（等于用户的 Retina 目标机）。dpr=1 时
    // 0.5px 会算成 1px（已实测：var 简写/长写/字面量三种写法一致），那是环境差异不是 CSS 错。
    { surface: 'chat', theme: 'light', w: 360, sel: '#fp-probe-hairline', prop: 'borderTopWidth', expect: 'eq:0.5px' },
    { surface: 'chat', theme: 'light', w: 360, sel: '#fp-probe-ring', prop: 'boxShadow', expect: 'notnone' },
    { surface: 'chat', theme: 'light', w: 360, sel: '#fp-probe-elev', prop: 'boxShadow', expect: 'notnone' },

    // ── Task 11：工具栏整行回归（这条就是上一次线上事故的守门员）──
    // 多一个 } 会让浏览器静默丢掉紧随其后的整条规则，当年丢掉的正是 .fleurpilot-toolbar：
    // 真机上三个控件散成三行、铅笔孤零零挂右边。display 与高度两条一起锁住。
    { surface: 'chat', theme: 'light', w: 420, sel: '.fleurpilot-toolbar', prop: 'display', expect: 'eq:flex' },
    // 高度按 Qoderian 的头部模型：控件 28 + 下内边距 12 = 40；上内边距必须是 0
    //（外面那 12px 由核心 .view-content 给，见样机的核心层复刻）。
    { surface: 'chat', theme: 'light', w: 420, sel: '.fleurpilot-toolbar', prop: 'h', expect: 'eq:40' },
    { surface: 'chat', theme: 'light', w: 420, sel: '.fleurpilot-toolbar', prop: 'paddingTop', expect: 'eq:0px' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-toolbar', prop: 'borderBottomWidth', expect: 'eq:0px' },
    // 幽灵按钮：模式/上下文都不得再有自己的底色
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-mode-btn', prop: 'backgroundColor', expect: 'eq:rgba(0, 0, 0, 0)' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-context-btn', prop: 'backgroundColor', expect: 'eq:rgba(0, 0, 0, 0)' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-toolbar-btn', prop: 'minHeight', expect: 'eq:28px' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-brand', prop: 'w', expect: 'eq:22' },

    // ── Task 4：消息区（复刻 Qoderian 的平铺模型）──
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-messages', prop: 'display', expect: 'eq:flex' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-messages', prop: 'rowGap', expect: 'eq:12px' },
    // 平铺：没有头像列，身份只靠对齐 + 填充
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-avatar', prop: 'display', expect: 'eq:none' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-message-role', prop: 'display', expect: 'eq:none' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-user', prop: 'alignSelf', expect: 'eq:flex-end' },
    // align-self:auto 的计算值就是 auto（used value 才由容器的 align-items 解出来），
    // 所以「拉满整行」不能靠读 alignSelf，改用 fill（自身宽度 ÷ 父级内容宽度）证明：
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-assistant', prop: 'alignSelf', expect: 'eq:auto' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-assistant', prop: 'fill', expect: 'eq:1' },
    // 反向控制：用户气泡是缩到内容宽、被 90% 上限压住，绝不是通栏
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-user', prop: 'fill', expect: 'lte:0.95' },
    // 时间条挂到正文之后当页脚（order:2），静态隐身
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-message-header', prop: 'order', expect: 'eq:2' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-message-header', prop: 'visibility', expect: 'eq:hidden' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-message-header', prop: 'opacity', expect: 'eq:0' },
    // 消息节奏守门员：用户气泡底边 → 下一条消息顶边的净空白必须只剩消息间距（12px）。
    // 用户页脚一旦留在流里，visibility:hidden 只隐形不脱流，这段会被硬撑出一整行（实测 30）。
    // Qoderian 用绝对定位的用户页脚（.qoderian-user-msg-actions bottom:-20px）避开的就是这个。
    { surface: 'chat', theme: 'light', w: 420, sel: '__metrics', prop: 'userToNextGap', expect: 'lte:16' },
    // 高度链守门员：插件根的边框盒必须等于视口高（比值 1）。样机的 .workspace-split 一旦没钉高度，
    // 百分比高度全退化成 auto，整列变成「内容多高就多高」，messages 的 flex:1 拿不到富余、composer
    // 吊在半空——截图里一眼看得见，断言也必须看得见（这条正是靠截图发现的）。
    { surface: 'chat', theme: 'light', w: 420, sel: '__metrics', prop: 'fullHeight', expect: 'eq:1' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-user .fleurpilot-message-content', prop: 'backgroundColor', expect: 'not:rgba(0, 0, 0, 0)' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-assistant .fleurpilot-message-content', prop: 'backgroundColor', expect: 'eq:rgba(0, 0, 0, 0)' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-user .fleurpilot-message-content', prop: 'borderRadius', expect: 'eq:8px' },
    // 尾巴角：右下角必须被抹平
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-user .fleurpilot-message-content', prop: 'borderBottomRightRadius', expect: 'eq:0px' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-message-content', prop: 'fontSize', expect: 'eq:16px' },
    // 动作条锚在页脚同一行的右端；必须是 absolute 且默认不可见（不能只写 opacity）。
    // 宽度取 420（内容盒 396 > 340，属正常档）：360 侧栏的内容盒只有 336，会落进窄档。
    { surface: 'chat', theme: 'light', w: 420, sel: '.fleurpilot-message-actions', prop: 'position', expect: 'eq:absolute' },
    { surface: 'chat', theme: 'light', w: 420, sel: '.fleurpilot-message-actions', prop: 'visibility', expect: 'eq:hidden' },

    // ── Task 5：composer（Qoderian 的「有边框盒子 + 圆角方块发送键」）──
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-input-container', prop: 'borderTopWidth', expect: 'eq:1px' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-input-container', prop: 'borderRadius', expect: 'eq:8px' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-input-container', prop: 'paddingTop', expect: 'eq:4px' },
    // composer 通栏（Qoderian 的模型）：fill=1 证明它占满容器内容盒，比断言具体像素更抗改框
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-input-container', prop: 'fill', expect: 'eq:1' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-input-container', prop: 'marginBottom', expect: 'eq:0px' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-input', prop: 'height', expect: 'not:80px' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-input', prop: 'minHeight', expect: 'eq:44px' },
    // 【断言反转，1.7.7】原 eq:28（1.75em×16px）改 eq:32（2em×16px）：用户在真机
    // 分叉构建里已把发送键放大一档并正在使用，吸收后默认档从 28 变 32，非回归而是采纳。
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-send-btn', prop: 'w', expect: 'eq:32' },
    // 发送键跟字号走（em）：用户把 Obsidian 基础字号调到 21（正式库实测），写死的 28px
    // 在放大的 composer 旁边小得像图标。fs=21 时按钮必须 ≥40（21×2=42；旧 1.75em 只有
    // 36.75，这条同时把「放大一档」钉住，防止回退）。
    { surface: 'chat', theme: 'light', w: 360, fs: 21, sel: '.fleurpilot-send-btn', prop: 'w', expect: 'gte:40' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-send-btn', prop: 'borderRadius', expect: 'eq:8px' },
    // 实心强调色只给这一个主操作
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-send-btn', prop: 'backgroundColor', expect: 'not:rgba(0, 0, 0, 0)' },
    // 可调高输入框的顶边握把（1.7.7 吸收真机分叉）：热区必须横跨容器上沿、光标 ns-resize
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-resize-handle', prop: 'cursor', expect: 'eq:ns-resize' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-resize-handle', prop: 'h', expect: 'eq:16' },

    // ── Task 11：欢迎页（Qoderian 式大号轻衬线问候）──
    // 标题不是 <h3>：addWelcomeMessage 走 new Setting(...).setHeading()，
    // 真实 DOM 是 .setting-item.setting-item-heading > .setting-item-info > .setting-item-name
    { surface: 'welcome', theme: 'light', w: 360, sel: '.fleurpilot-welcome .setting-item-heading .setting-item-name', prop: 'fontSize', expect: 'eq:28px' },
    { surface: 'welcome', theme: 'light', w: 360, sel: '.fleurpilot-welcome .setting-item-heading .setting-item-name', prop: 'fontWeight', expect: 'eq:300' },
    { surface: 'welcome', theme: 'light', w: 360, sel: '.fleurpilot-welcome .setting-item-heading', prop: 'paddingLeft', expect: 'eq:0px' },
    { surface: 'welcome', theme: 'light', w: 360, sel: '.fleurpilot-welcome', prop: 'flexGrow', expect: 'eq:1' },
    // 欢迎页不摆图标（品牌在顶栏），元素仍在 DOM 里只是不显示
    { surface: 'welcome', theme: 'light', w: 360, sel: '.fleurpilot-welcome-icon', prop: 'display', expect: 'eq:none' },

    // ── Task 6：Modal 与上下文选择器 ──
    // 宽度契约在 modalEl（外层 .modal）上：TS 的 --mb-modal-width 就写在这个节点
    { surface: 'inline', theme: 'light', w: 360, mw: 520, sel: '.modal', prop: 'w', expect: 'eq:520' },
    // 核心 .modal 自带 padding: var(--size-4-4)＝16px，不抢回来填充分区就不是通栏而是「卡中卡」
    { surface: 'inline', theme: 'light', w: 360, mw: 520, sel: '.modal', prop: 'paddingTop', expect: 'eq:0px' },
    { surface: 'ctx', theme: 'light', w: 360, sel: '.modal', prop: 'paddingTop', expect: 'eq:0px' },
    // .modal-content.fp-ctx-search-modal 只有复刻 contentEl 分层后才真的命中
    { surface: 'ctx', theme: 'light', w: 360, sel: '.modal-content', prop: 'display', expect: 'eq:flex' },
    // 通栏证明：520 宽卡片减左右 1px 边框，header 必须占满 518（核心 16px 内边距没抢回来时这里只有 488）
    { surface: 'inline', theme: 'light', w: 360, mw: 520, sel: '.mb-modal-header', prop: 'w', expect: 'eq:518' },
    { surface: 'inline', theme: 'light', w: 360, sel: '.mb-original-section', prop: 'backgroundColor', expect: 'not:rgba(0, 0, 0, 0)' },
    { surface: 'inline', theme: 'light', w: 360, sel: '.mb-result-section', prop: 'backgroundColor', expect: 'not:rgba(0, 0, 0, 0)' },
    { surface: 'inline', theme: 'light', w: 360, sel: '.mb-btn', prop: 'minHeight', expect: 'eq:30px' },
    { surface: 'inline', theme: 'light', w: 360, sel: '.mb-btn', prop: 'borderRadius', expect: 'eq:999px' },
    { surface: 'inline', theme: 'light', w: 360, sel: '.mb-follow-up-input-wrap', prop: 'borderRadius', expect: 'eq:14px' },
    { surface: 'ctx', theme: 'light', w: 360, sel: '.fp-ctx-item', prop: 'minHeight', expect: 'eq:30px' },
    { surface: 'ctx', theme: 'light', w: 360, sel: '.fp-ctx-search-wrap', prop: 'borderRadius', expect: 'eq:999px' },
    // 选中态填充走 color-mix token：必须真的解析出颜色，否则窄屏下选中项只剩一个勾
    { surface: 'ctx', theme: 'light', w: 360, sel: '.fp-ctx-item-selected', prop: 'backgroundColor', expect: 'not:rgba(0, 0, 0, 0)' },

    // ── Task 13：内联编辑弹窗右上角（把手 × 关闭按钮）与高度自适应 ──
    // 真机 DOM 里 .modal-close-button 是 .modal 的直接子元素（obsidian.asar 实测：
    // modalEl.createDiv("modal-close-button mod-raised")），absolute 盖在 header 右段上。
    // 插件旧规则 .mb-inline-edit-modal .modal-close-button 要求它当 .modal-content 的后代
    // —— 永不匹配，这就是「关闭按钮没被美成按钮」的根因。改选择器后底色必须真填充。
    { surface: 'inline', theme: 'light', w: 360, mw: 520, sel: '.modal-close-button', prop: 'backgroundColor', expect: 'not:rgba(0, 0, 0, 0)' },
    { surface: 'inline', theme: 'light', w: 360, mw: 520, sel: '.modal-close-button', prop: 'position', expect: 'eq:absolute' },
    // 把手 → 关闭按钮的水平净空（负值 = 坐标重叠，就是用户截图里「挤在一起」的形态）。
    // header 右内边距必须预留出「按钮宽 28 + 一口气 12」才能让这个数 ≥8。
    { surface: 'inline', theme: 'light', w: 360, mw: 520, sel: '__metrics', prop: 'gripCloseClear', expect: 'gte:8' },
    // 把手挪到左侧（用户要求）：DOM 顺序已改为 grip → title，header 必须 flex-start
    //（旧 space-between 会把标题甩到最右），标题 flex:1 吃掉剩余宽度并保住省略号。
    { surface: 'inline', theme: 'light', w: 360, mw: 520, sel: '.mb-modal-header', prop: 'justifyContent', expect: 'eq:flex-start' },
    { surface: 'inline', theme: 'light', w: 360, mw: 520, sel: '.mb-modal-header-title', prop: 'flexGrow', expect: 'eq:1' },
    // 把手本体升级成胶囊按钮：圆角与尺寸锁死，不是一段渐变纹理裸贴在 header 里
    { surface: 'inline', theme: 'light', w: 360, mw: 520, sel: '.mb-modal-header-grip', prop: 'borderRadius', expect: 'eq:999px' },
    { surface: 'inline', theme: 'light', w: 360, mw: 520, sel: '.mb-modal-header-grip', prop: 'w', expect: 'eq:40' },
    // 高度自适应：mock 把 --mb-modal-height 钉在 200（远小于内容高）。旧 CSS
    // height: var(--mb-modal-height, auto) 会把卡片压成 200；新 CSS 必须无视它按内容撑开。
    // 样机内容（header+原文+结果+追问+按钮）在 520 宽下 ~470+，取 320 做下界留足余量。
    { surface: 'inline', theme: 'light', w: 360, mw: 520, mh: 200, sel: '.modal', prop: 'h', expect: 'gte:320' },
    // 等高反向控制：不传 modalh（默认钉 400）时高度同样必须脱离变量、跟内容走——
    // 若 CSS 还在 height: var(--mb-modal-height)，这里会精确等于 400。
    { surface: 'inline', theme: 'light', w: 360, mw: 520, sel: '.modal', prop: 'h', expect: 'not:400' },

    // ── Task 8：容器查询自适应 ──
    { surface: 'chat', theme: 'light', w: 260, sel: '.fleurpilot-chat-view', prop: 'containerType', expect: 'eq:inline-size' },
    { surface: 'chat', theme: 'light', w: 260, sel: '.fleurpilot-message-actions', prop: 'visibility', expect: 'eq:visible' },
    { surface: 'chat', theme: 'light', w: 260, sel: '.fleurpilot-context-btn', prop: 'w', expect: 'lte:150' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-message-actions', prop: 'visibility', expect: 'eq:visible' },
    { surface: 'chat', theme: 'light', w: 600, sel: '.fleurpilot-messages', prop: 'paddingLeft', expect: 'eq:0px' },
    // 顶格在同一属性上的反证：跨过阅读宽度阈值（容器内容盒 ≥640px，即面板 ≥664px）后内边距
    // 由 0 翻到 78 —— 证明下面那条断言不是「属性恒为 0」的空转。
    { surface: 'chat', theme: 'light', w: 900, sel: '.fleurpilot-messages', prop: 'paddingLeft', expect: 'eq:78px' },
    // 宽栏：整列推进阅读宽度。断言读内容盒宽度（= 720 = --fp-reading-width），不读左内边距：
    // 侧栏 900 时容器内容盒是 876（外层核心 .view-content 吃掉 12×2）→ (876-720)/2 = 78px。
    // 写 90px 等于把「侧栏宽」当成「容器宽」，两者差 24px。
    { surface: 'chat', theme: 'light', w: 900, sel: '.fleurpilot-messages', prop: 'contentW', expect: 'eq:720' },
    // 阈值框：@container 的 340px 指容器内容盒（= 侧栏 - 24）。
    // 侧栏 364 → 内容盒 340 → 仍在窄档；366 → 342 → 已离开窄档。差 2px 就翻面，说明框没写错。
    { surface: 'chat', theme: 'light', w: 364, sel: '.fleurpilot-message-actions', prop: 'visibility', expect: 'eq:visible' },
    { surface: 'chat', theme: 'light', w: 366, sel: '.fleurpilot-message-actions', prop: 'visibility', expect: 'eq:hidden' },

    // ── Task 12：提问气泡「一侧顶格 + 灰色打底」──
    // 顶格：气泡右沿必须等于 .fleurpilot-messages 内容盒的右沿（≤1px 是亚像素取整）。容器水平
    // 内边距一旦不为 0（原来是 --fp-gutter 12–20px），气泡右侧被统一推开，这条立刻红。
    { surface: 'chat', theme: 'light', w: 360, sel: '__metrics', prop: 'userFlushRight', expect: 'lte:1' },
    { surface: 'chat', theme: 'light', w: 600, sel: '__metrics', prop: 'userFlushRight', expect: 'lte:1' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-messages', prop: 'paddingLeft', expect: 'eq:0px' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-messages', prop: 'paddingRight', expect: 'eq:0px' },
    // 灰色打底：气泡填充与面板底色的亮度差必须 ≥25（参考实测 32.5，旧填充只有 4.5）。
    // 明暗档同一条阈值：token 由 --text-normal 与 --background-primary 混出，夜间不会变成死黑。
    { surface: 'chat', theme: 'light', w: 360, sel: '__metrics', prop: 'userBubbleGray', expect: 'gte:25' },
    { surface: 'chat', theme: 'dark', w: 360, sel: '__metrics', prop: 'userBubbleGray', expect: 'gte:25' },
    // 助手正文列的内缩搬到了 .fleurpilot-message-body（正文与推理卡共用一根左沿）；
    // 用户气泡的外壳把这段内缩撤成 0，顶格才成立，气泡自己的 12px 内边距仍在。
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-assistant .fleurpilot-message-body', prop: 'paddingLeft', expect: 'eq:12px' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-user .fleurpilot-message-body', prop: 'paddingLeft', expect: 'eq:0px' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-assistant .fleurpilot-message-content', prop: 'paddingLeft', expect: 'eq:0px' },
    { surface: 'chat', theme: 'light', w: 360, sel: '.fleurpilot-user .fleurpilot-message-content', prop: 'paddingLeft', expect: 'eq:12px' },
    // 推理卡不跟着 .fleurpilot-message-content 走，必须由 body 那层兜住：左右各 12px。
    // 旧 CSS 下这里是 20（吃的是 .fleurpilot-messages 的 --fp-gutter），去掉容器内边距就会变 0。
    { surface: 'chat', theme: 'light', w: 360, sel: '__metrics', prop: 'reasoningInsetLeft', expect: 'eq:12' },
    { surface: 'chat', theme: 'light', w: 360, sel: '__metrics', prop: 'reasoningInsetRight', expect: 'eq:12' },
];

const SELS = ['.fleurpilot-chat-view', '.fleurpilot-messages', '.fleurpilot-message', '.fleurpilot-message-content',
    '.fleurpilot-message-actions', '.fleurpilot-message-header', '.fleurpilot-message-role', '.fleurpilot-message-time',
    '.fleurpilot-avatar', '.fleurpilot-welcome', '.fleurpilot-welcome-icon',
    '.fleurpilot-welcome .setting-item-heading', '.fleurpilot-welcome .setting-item-heading .setting-item-name',
    '.modal', '.modal-content', '.mb-reasoning', '.mb-modal-header',
    '.mb-modal-header-grip', '.modal-close-button', '.mb-modal-header-title',
    '.fleurpilot-user', '.fleurpilot-assistant',
    '.fleurpilot-assistant .fleurpilot-message-body', '.fleurpilot-user .fleurpilot-message-body',
    '.fleurpilot-user .fleurpilot-message-content', '.fleurpilot-assistant .fleurpilot-message-content',
    '.fleurpilot-assistant .mb-reasoning',
    '.fleurpilot-toolbar', '.fleurpilot-toolbar-btn', '.fleurpilot-mode-btn', '.fleurpilot-context-btn',
    '.fleurpilot-brand', '.fleurpilot-input-container',
    '.fleurpilot-input', '.fleurpilot-send-btn', '.fleurpilot-skill-btn', '.fleurpilot-resize-handle',
    '.fleurpilot-welcome-sub', '.mb-original-section', '.mb-result-section', '.mb-btn', '.mb-btn-apply',
    '.mb-follow-up-input-wrap', '.fp-ctx-item', '.fp-ctx-item-selected', '.fp-ctx-search-wrap', '.mb-inline-edit-modal', '.fp-ctx-btn-confirm',
    '#fp-probe-accent', '#fp-probe-accent-faint', '#fp-probe-gutter', '#fp-probe-body',
    '#fp-probe-ring', '#fp-probe-hairline', '#fp-probe-elev'];

const MEASURE_FN = `(() => {
  const pick = (sel) => { const el = document.querySelector(sel); if (!el) return null;
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    // fill = 自身宽度 ÷ 父级内容盒宽度。用来证明「拉满整行」这类只能读 used value 的效果
    // （align-self:auto 的计算值恒为 auto，读它证明不了拉伸）。
    const p = el.parentElement; const pcs = p ? getComputedStyle(p) : null;
    const pcw = p ? p.getBoundingClientRect().width - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight) - parseFloat(pcs.borderLeftWidth) - parseFloat(pcs.borderRightWidth) : 0;
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom),
      fill: pcw > 0 ? Math.round((r.width / pcw) * 100) / 100 : 0,
      // contentW：内容盒宽度。@container 量的是它，所以「阅读宽度上限」这类断言要用它，
      // 用 .fleurpilot-messages 的 paddingLeft 去断言会把外层的 12px 内边距算进来（框不同）。
      contentW: Math.round(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
      fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight, color: cs.color,
      backgroundColor: cs.backgroundColor,
      borderRadius: cs.borderTopLeftRadius, borderBottomRightRadius: cs.borderBottomRightRadius,
      borderTopWidth: cs.borderTopWidth, borderBottomWidth: cs.borderBottomWidth, borderStyle: cs.borderTopStyle,
      boxShadow: cs.boxShadow, visibility: cs.visibility, opacity: cs.opacity, position: cs.position, cursor: cs.cursor,
      display: cs.display, alignSelf: cs.alignSelf, justifyContent: cs.justifyContent, order: cs.order, flexGrow: cs.flexGrow, rowGap: cs.rowGap,
      minHeight: cs.minHeight, maxHeight: cs.maxHeight, height: cs.height,
      paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, paddingTop: cs.paddingTop,
      marginTop: cs.marginTop, marginBottom: cs.marginBottom, marginLeft: cs.marginLeft, marginRight: cs.marginRight,
      containerType: cs.containerType, outlineStyle: cs.outlineStyle };
  };
  const out = {};
  for (const sel of ${JSON.stringify(SELS)}) { const v = pick(sel); if (v) out[sel] = v; }
  // 空选择器必须显式报到（否则「元素不存在」会被当成量测失败静默吞掉）
  out.__missing = ${JSON.stringify(SELS)}.filter(sel => !(sel in out));
  // __metrics：跨元素的派生量（不能用单选择器表达）。键名当作「伪选择器」在断言里引用。
  // userToNextGap = 首条用户消息的气泡底边 → 下一条消息顶边的净空白，用来量消息节奏。
  out.__metrics = (() => {
    const msgs = [...document.querySelectorAll('.fleurpilot-messages > .fleurpilot-message')];
    let userToNextGap = null;
    for (let i = 0; i < msgs.length - 1; i++) {
      if (!msgs[i].classList.contains('fleurpilot-user')) continue;
      const bubble = msgs[i].querySelector('.fleurpilot-message-content');
      if (!bubble) continue;
      userToNextGap = Math.round(msgs[i + 1].getBoundingClientRect().top - bubble.getBoundingClientRect().bottom);
      break;
    }
    // fullHeight：插件根（= .view-content）的边框盒高度 ÷ 视口高度。高度链只要在样机里断一环
    // （.workspace-split 没钉高度 → 百分比参照物是 auto），整列就退化成内容高度、messages 的
    // flex:1 拿不到富余，composer 会吊在半空。用比值而不是写死 760，免得跟着窗口尺寸变。
    const root = document.querySelector('.fleurpilot-chat-view');
    const vh = document.documentElement.clientHeight;
    // userFlushRight：用户气泡的右沿 → .fleurpilot-messages 内容盒右沿的距离（px）。
    // 「一侧顶格」就是这条：容器水平内边距一旦不为 0，气泡右侧会被统一推开 12–20px。
    const msgsEl = document.querySelector('.fleurpilot-messages');
    const mcs = msgsEl ? getComputedStyle(msgsEl) : null;
    const msgContentBox = () => msgsEl ? {
      left: msgsEl.getBoundingClientRect().left + parseFloat(mcs.borderLeftWidth) + parseFloat(mcs.paddingLeft),
      right: msgsEl.getBoundingClientRect().right - parseFloat(mcs.borderRightWidth) - parseFloat(mcs.paddingRight),
    } : null;
    const bubbleEl = document.querySelector('.fleurpilot-user .fleurpilot-message-content');
    let userFlushRight = null;
    if (msgsEl && bubbleEl) {
      userFlushRight = Math.round(msgContentBox().right - bubbleEl.getBoundingClientRect().right);
    }
    // reasoningInset：推理卡左右沿相对 .fleurpilot-messages 内容盒的内缩。推理卡是
    // .fleurpilot-message-body 的直接子元素，不跟 .fleurpilot-message-content 的内边距走：
    // 容器水平内边距归零后，全靠 body 那层 padding-inline 兜住，否则它会左右双双顶到面板边、
    // 与正文的左沿差 12px（图里一眼看得出两段对不齐）。
    const reasonEl = document.querySelector('.fleurpilot-assistant .mb-reasoning');
    let reasoningInsetLeft = null, reasoningInsetRight = null;
    if (msgsEl && reasonEl) {
      const box = msgContentBox(); const rr = reasonEl.getBoundingClientRect();
      reasoningInsetLeft = Math.round(rr.left - box.left);
      reasoningInsetRight = Math.round(box.right - rr.right);
    }
    // gripCloseClear：关闭按钮左沿 − 把手右沿。真机 DOM 里 .modal-close-button 是
    // .modal 的直接子元素（obsidian.asar 实测），absolute 定位盖在 header 右段上；
    // 把手在按钮左侧，净空 = 按钮左沿到把手右沿的距离（负值 = 坐标重叠，
    // 就是用户截图里「挤在一起」的形态）。header 右内边距预留 28+12 后应 ≥8。
    const gripEl = document.querySelector('.mb-modal-header-grip');
    const closeEl = document.querySelector('.modal-close-button');
    let gripCloseClear = null;
    if (gripEl && closeEl) {
      gripCloseClear = Math.round(closeEl.getBoundingClientRect().left - gripEl.getBoundingClientRect().right);
    }
    // userBubbleGray：气泡填充与面板底色的亮度差（0–100，取绝对值，明暗档同一条断言）。
    // 参考截图实测：Qoderian 的 #acacad 压在 #f6f7f8 上是 32.5；旧的 --fp-fill-hover
    // （--background-modifier-hover ＝ rgba(0,0,0,.043)）只有 4.3 —— 就是「看不出打底」。
    // 颜色的解析交给 canvas 而不是手写正则：color-mix 在不同 Chrome 上算成 rgb() 还是
    // color(srgb …) 不一定，且半透明填充必须先按 alpha 合成到底色上再比亮度——否则
    // rgba(0,0,0,.043) 会被当成纯黑、量出 100，正好是个假绿。
    const cvs = document.createElement('canvas'); cvs.width = cvs.height = 1;
    const cx = cvs.getContext('2d');
    const rgbOn = (c, bg) => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = bg; cx.fillRect(0, 0, 1, 1);
      cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);   // 透明色不覆盖，天然完成合成
      const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]];
    };
    const lum = (rgb) => (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    let userBubbleGray = null;
    if (root && bubbleEl) {
      const rc = getComputedStyle(root).backgroundColor;
      userBubbleGray = Math.round(Math.abs(lum(rgbOn(rc, rc)) - lum(rgbOn(getComputedStyle(bubbleEl).backgroundColor, rc))) * 100);
    }
    return {
      userToNextGap,
      fullHeight: root && vh ? Math.round((root.getBoundingClientRect().height / vh) * 100) / 100 : null,
      viewportH: vh,
      userFlushRight,
      userBubbleGray,
      reasoningInsetLeft,
      reasoningInsetRight,
      gripCloseClear,
    };
  })();
  out.__msgBottoms = [...document.querySelectorAll('.fleurpilot-message')].map(m => Math.round(m.getBoundingClientRect().bottom));
  out.__msgTops = [...document.querySelectorAll('.fleurpilot-message')].map(m => Math.round(m.getBoundingClientRect().top));
  // 就绪门槛：外链 styles.css 未生效时 --fp-* 全空，会假阳性（实测踩过：accent 报 rgba(0,0,0,0)、hairline 报 0px）
  const accentEl = document.querySelector('#fp-probe-accent');
  out.__ready = document.readyState !== 'loading'
    && !!accentEl && getComputedStyle(accentEl).backgroundColor !== 'rgba(0, 0, 0, 0)'
    && getComputedStyle(document.querySelector('#fp-probe-hairline')).borderTopWidth !== '0px';
  return out;
})()`;

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function measure(targetUrl) {
    // 每次跑用全新 profile：共用默认 profile 会让 Chrome 恢复上次的窗口尺寸（视口高度忽高忽低），
    // 还可能命中 file:// 的磁盘缓存而读到上一版的样机。都踩过。
    const profile = mkdtempSync(join(tmpdir(), 'fp-cdp-'));
    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
        '--force-device-scale-factor=2', `--user-data-dir=${profile}`,
        `--remote-debugging-port=${PORT}`, '--window-size=900,900', targetUrl], { stdio: 'ignore' });
    try {
        let list = [];
        for (let i = 0; i < 60; i++) {
            try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.length) break; } catch {}
            await wait(200);
        }
        const page = list.find(t => t.type === 'page');
        if (!page) throw new Error('CDP 无 page target');
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        let id = 0; const pend = new Map();
        ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
        const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
        await send('Runtime.enable');
        for (let i = 0; i < 40; i++) {
            const r = await send('Runtime.evaluate', { expression: MEASURE_FN, returnByValue: true });
            const v = r.result?.result?.value;
            if (v && v.__ready === true) { ws.close(); return v; }
            await wait(150);
        }
        throw new Error('量测未取得结果（外链样式可能未加载）');
    } finally { chrome.kill('SIGKILL'); await wait(200); }
}

const cmp = (actual, spec) => {
    const ci = spec.indexOf(':');
    const kind = ci < 0 ? spec : spec.slice(0, ci);
    const val = ci < 0 ? '' : spec.slice(ci + 1);
    const a = String(actual ?? '');
    switch (kind) {
        case 'eq': return a === val;
        case 'not': return a !== val;
        case 'gte': return parseFloat(a) >= parseFloat(val);
        case 'lte': return parseFloat(a) <= parseFloat(val);
        case 're': return new RegExp(val).test(a);
        case 'nonzero': return a !== '' && a !== 'none' && a !== '0px' && parseFloat(a) !== 0;
        case 'notnone': return a !== '' && a !== 'none';
        default: throw new Error('未知断言类型 ' + kind);
    }
};

const cache = {};
let fail = 0;
for (const e of EXPECT) {
    const key = `${e.surface}|${e.theme}|${e.w}|${e.mw || ''}|${e.mh || ''}|${e.fs || ''}`;
    cache[key] ??= await measure(url(e.surface, e.theme, e.w, e.mw, e.mh, e.fs));
    // '__metrics' 是伪选择器：读跨元素派生量，不走 pick() 的单元素表
    const node = cache[key][e.sel];
    const actual = e.sel === '__metrics'
        ? cache[key].__metrics?.[e.prop]
        : (node == null ? undefined : (e.prop === 'sel' ? node : node[e.prop]));
    const ok = actual !== undefined && cmp(actual, e.expect);
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${key}] ${e.sel} ${e.prop} = ${JSON.stringify(actual)}  期望 ${e.expect}`);
    if (!ok) fail++;
}
console.log(`\n${EXPECT.length - fail}/${EXPECT.length} 断言通过`);
process.exit(fail ? 1 : 0);
