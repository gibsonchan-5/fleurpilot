// tools/css-gate.mjs — fleurpilot styles.css 静态门禁
// 用法：node tools/css-gate.mjs  （exit 0 = 全绿；exit 1 = 有违规）
// 阈值即验收标准，放宽任何一条必须先改 spec 并说明理由。
import fs from 'node:fs';
import cp from 'node:child_process';

const cssRaw = fs.readFileSync('styles.css', 'utf8');
// 色值豁免：行尾带 `gate-allow-color` 的行不参与颜色计数（目前唯一合法用途是
// styles.css 末尾的「Claude 暖色两档面板」，用户批准吸收真机分叉，1.7.7）。
// 计数用剥离后的文本，所以标记行本身写什么颜色都不算违规。
const allowColor = /^\s*.*gate-allow-color.*$/gm;
const allowCount = (cssRaw.match(allowColor) || []).length;
const css = cssRaw.replace(allowColor, '');
const srcAll = cp.execSync('cat $(find src -name "*.ts")', { encoding: 'utf8', maxBuffer: 1e8 });
const all = (re) => (css.match(re) || []);
// 注意：必须去掉结尾分号，否则 var(...) 形式的值匹配不上白名单（曾把合规值算成违规）
const uniq = (re) => [...new Set(all(re).map(s => s.slice(s.indexOf(':') + 1).trim().replace(/;$/, '')))];

const checks = [];
const check = (name, got, want, ok) => checks.push({ name, got, want, ok: ok(got, want) });

// ── 颜色：零硬编（豁免行见上）──
check('硬编 hex 颜色', all(/#[0-9a-fA-F]{3,8}\b/g).length, 0, (g, w) => g <= w);
check('硬编 rgb(a) 数字色', all(/rgba?\(\s*\d/g).length, 0, (g, w) => g <= w);
check('色值豁免行（须逐行注明理由）', allowCount, 8, (g, w) => g <= w);

// ── 尺度：圆角/字号只允许走 token ──
const radiusVals = uniq(/border-radius:\s*[^;]+;/g);
const radiusOk = /^(var\(--(fp|mb)-radius-[\w-]+\)|0|50%|0 0 var\(--fp-radius-lg\) 0)$/;
const radiusBad = radiusVals.filter(v => !radiusOk.test(v));
check('圆角非 token 值', radiusBad.length, 0, (g, w) => g <= w);
check('圆角值种类', radiusVals.length, 6, (g, w) => g <= w);

const fontVals = uniq(/font-size:\s*[^;]+;/g);
const fontOk = /^(var\(--(fp|mb)-text-[\w-]+\)|var\(--(fp|mb)-font-size-[\w-]+\)|var\(--font-text-size[^)]*\)|[\d.]+em)$/;
const fontBad = fontVals.filter(v => !fontOk.test(v));
check('字号非 token 值', fontBad.length, 0, (g, w) => g <= w);
check('字号值种类', fontVals.length, 6, (g, w) => g <= w);

// ── 结构：花括号必须配平 ──
// 多写一个 } 不会语法报错，而是让浏览器「丢掉紧随其后的整条规则」（CSS 语法错误恢复，
// 实测 `a{…}} b{…}` → b 完全不生效）。上一轮就是这么被吃掉了 .fleurpilot-toolbar：
// 真机上工具栏散成三行、铅笔按钮孤零零挂在右边，而当时 16 条门禁全绿。
check('花括号配平', all(/\{/g).length - all(/\}/g).length, 0, (g, w) => g === w);

// ── 发丝线：细档只允许写在 token 定义处 ──
// 0.5px 是本插件既有的细档（工具栏分隔线、两个胶囊、技能按钮、欢迎页图标），
// 上一轮把它按「非 token 值」一刀切禁掉，8 处描边只好统一用 1px —— 在 Retina 上
// 等于每条线都粗了一档。改成「细档只能在 --fp-hairline 里出现一次」。
check('0.5px 仅出现在 token 定义处', all(/0\.5px/g).length, 1, (g, w) => g === w);
check('--fp-hairline 走细档', /--fp-hairline:\s*0\.5px/.test(css) ? 1 : 0, 1, (g, w) => g === w);

// ── 小字号下限（token 化后不应有裸 px < 12） ──
const tinyPx = fontVals.filter(v => /^\d+(\.\d+)?px$/.test(v) && parseFloat(v) < 12);
check('小于 12px 的字号', tinyPx.length, 0, (g, w) => g <= w);

// ── 无障碍与自适应存在性 ──
check(':focus-visible 规则', all(/:focus-visible/g).length, 8, (g, w) => g >= w);
check('prefers-reduced-motion 块', all(/@media\s*\(prefers-reduced-motion/g).length, 1, (g, w) => g >= w);
check('@container 块', all(/@container/g).length, 2, (g, w) => g >= w);
check('@media 块（Modal）', all(/@media \(max-width/g).length, 1, (g, w) => g >= w);
check('container-type 声明', all(/container-type:\s*inline-size/g).length, 1, (g, w) => g >= w);

// ── 占位空洞：动作条不得只用 opacity 隐藏（必须成对给 visibility） ──
const actBlocks = all(/\.fleurpilot-message-actions\s*{[^}]*}/g).join('');
const hollow = /opacity:\s*0/.test(actBlocks) && !/visibility:\s*hidden/.test(actBlocks);
check('动作条 opacity 占位写法', hollow ? 1 : 0, 0, (g, w) => g <= w);

// ── 死选择器（CSS 有、TS 无引用） ──
const classes = [...new Set(all(/\.(?:fp|mb|fleurpilot)-[\w-]+/g).map(s => s.slice(1)))];
const dead = classes.filter(k => !srcAll.includes(k));
check('死选择器数', dead.length, 5, (g, w) => g <= w);
check('类名总数（不得增长）', classes.length, 135, (g, w) => g <= w);

let fail = 0;
for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(22)} 实测 ${c.got} / 阈值 ${c.want}`);
    if (!c.ok) fail++;
}
console.log(`\n${checks.length - fail}/${checks.length} 通过`);
if (radiusBad.length) console.log('圆角违规值: ' + radiusBad.join(' , '));
if (fontBad.length) console.log('字号违规值: ' + fontBad.join(' , '));
if (dead.length) console.log('死选择器(' + dead.length + '): ' + dead.join(', '));
process.exit(fail ? 1 : 0);
