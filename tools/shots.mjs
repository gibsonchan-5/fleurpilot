// tools/shots.mjs — 同一份样机 DOM、两份 CSS 的前后对照截图
// 用法：node tools/shots.mjs [基线 ref]        默认基线 ref = main
// 产出：docs/superpowers/ui-redesign-shots/{before,after}-<surface>-<theme>-<w>.png
// 说明：截图是最弱的一档证据（只能证明「看起来变了」），量测断言在 harness-check.mjs。
//       这里能做的是把 DOM 钉死成同一份，只换样式表，避免「DOM 变了、CSS 也变了」的假对照。
//
// 为什么走 CDP 而不是 --screenshot：headless 的 --window-size 是**窗口**尺寸，视口要比它小
// 一截（实测 760 的窗口 → 视口只有 673，差 87 是窗口边框）。--screenshot 按窗口尺寸截，
// 于是每张图底部都会多出一条填充用的 body 底色，看起来就像「composer 悬空、下面留了一大块」。
// 我据此误判过一次布局有问题。改用 Emulation.setDeviceMetricsOverride 把视口钉成 EXACT
// (宽,高) 再 Page.captureScreenshot，PNG 尺寸就等于 面板宽×dpr × H×dpr，没有多余带。
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const REPO = resolve(process.cwd());
const BASE_REF = process.argv[2] || 'main';
const OUT = join(REPO, 'docs/superpowers/ui-redesign-shots');
// 基线样式表落在仓库外：不改工作区、不产生「未提交改动」，也避免它被误当成插件的一部分
const SCRATCH = '/tmp/fp-shots';
const BASE_CSS = join(SCRATCH, 'baseline-styles.css');
const PORT = Number(process.env.PORT || 9361);
const DPR = 2;

// 面板宽度由样机自己的 --w 决定；这里让视口宽度就等于面板宽，PNG 宽 = 面板宽×2 可以自我校验
const COMBOS = [
    { surface: 'chat', theme: 'light', w: 360 },
    { surface: 'chat', theme: 'dark', w: 360 },
    { surface: 'chat', theme: 'light', w: 600 },
    { surface: 'chat', theme: 'dark', w: 600 },
    { surface: 'welcome', theme: 'light', w: 360 },
    { surface: 'welcome', theme: 'dark', w: 600 },
];

const H = 760;

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function pngSize(file) {
    const b = readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

// 就绪门槛：必须等到外链样式表真的挂上（link.sheet 非空）且样机已挂载。
// 不能用「--fp-* token 解析出颜色」当门槛——基线 styles.css 根本没有这套 token，
// 那样 before 侧会永远等不到就绪（踩过）。link.sheet 对跨源/文件协议也拿得到，
// 只有 cssRules 才会被安全策略挡住，所以这里不碰 cssRules。
const READY_FN = `(() => {
  const link = document.querySelector('link[rel=stylesheet]');
  const stage = document.getElementById('stage');
  return document.readyState === 'complete' && !!link && !!link.sheet
    && !!stage && stage.children.length > 0;
})()`;

async function main() {
    // 基线样式表：从 git 取，不碰工作区
    mkdirSync(SCRATCH, { recursive: true });
    mkdirSync(OUT, { recursive: true });
    const baseCss = execFileSync('git', ['show', `${BASE_REF}:styles.css`], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(BASE_CSS, baseCss);
    const afterCss = join(REPO, 'styles.css');
    console.log(`基线 ref = ${BASE_REF}（${baseCss.length} 字节）→ ${BASE_CSS}`);
    console.log(`当前 styles.css = ${statSync(afterCss).size} 字节\n`);

    const profile = mkdtempSync(join(tmpdir(), 'fp-shot-'));
    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
        `--force-device-scale-factor=${DPR}`, `--user-data-dir=${profile}`,
        `--remote-debugging-port=${PORT}`, '--window-size=900,900', 'about:blank'], { stdio: 'ignore' });
    try {
        const page = await firstPage();
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        let id = 0; const pend = new Map();
        ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
        const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
        await send('Page.enable');
        await send('Runtime.enable');

        const rows = [];
        for (const c of COMBOS) {
            const tag = `${c.surface}-${c.theme}-${c.w}`;
            const shots = {};
            for (const [side, cssHref] of [['before', `file://${BASE_CSS}`], ['after', `file://${afterCss}`]]) {
                // 视口钉成 EXACT（宽,高）：PNG 就等于 宽×dpr × 高×dpr，不再有窗口边框那 87px 的填色带
                await send('Emulation.setDeviceMetricsOverride',
                    { width: c.w, height: H, deviceScaleFactor: DPR, mobile: false });
                const q = `surface=${c.surface}&theme=${c.theme}&w=${c.w}&css=${encodeURIComponent(cssHref)}`;
                const nav = await send('Page.navigate', { url: `file://${join(REPO, 'tools/ui-harness.html')}?${q}` });
                if (nav.errorText) throw new Error(`导航失败 ${side}-${tag}: ${nav.errorText}`);
                let ready = false;
                for (let i = 0; i < 60; i++) {
                    const r = await send('Runtime.evaluate', { expression: READY_FN, returnByValue: true });
                    if (r.result?.result?.value === true) { ready = true; break; }
                    await wait(100);
                }
                if (!ready) throw new Error(`样机未就绪 ${side}-${tag}（样式表可能没加载）`);
                await wait(150);  // 让 webfont/滚动条稳定，避免偶发的半渲染帧
                const cap = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
                if (cap.result?.data === undefined) throw new Error(`截图失败 ${side}-${tag}: ${JSON.stringify(cap.error)}`);
                const file = join(OUT, `${side}-${tag}.png`);
                writeFileSync(file, Buffer.from(cap.result.data, 'base64'));
                shots[side] = pngSize(file);
            }
            const b = shots.before, a = shots.after;
            rows.push({ tag, expectW: c.w * DPR, b, a });
            console.log(`${tag.padEnd(22)} before ${`${b.w}x${b.h} ${(b.bytes / 1024).toFixed(0)}KB`.padEnd(16)} after ${a.w}x${a.h} ${(a.bytes / 1024).toFixed(0)}KB`);
        }
        ws.close();
        // 自我校验：PNG 尺寸必须等于 视口 × dpr，否则说明 override 没生效，图不能当证据
        const bad = rows.filter(r => r.b.w !== r.expectW || r.a.w !== r.expectW || r.b.h !== H * DPR || r.a.h !== H * DPR);
        console.log(`\n共 ${COMBOS.length} 组 → ${OUT}`);
        if (bad.length) {
            console.error('\n尺寸自校验失败（override 未生效？）：' +
                bad.map(r => `${r.tag} 期望 ${r.expectW}x${H * DPR}`).join('，'));
            process.exitCode = 1;
        } else {
            console.log(`尺寸自校验通过：全部 ${rows[0].expectW}x${H * DPR}（= 视口 × dpr ${DPR}）`);
        }
    } finally { chrome.kill('SIGKILL'); await wait(200); }
}

async function firstPage() {
    for (let i = 0; i < 60; i++) {
        try {
            const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            const p = list.find(t => t.type === 'page');
            if (p) return p;
        } catch { /* 端口还没起来 */ }
        await wait(200);
    }
    throw new Error('CDP 无 page target');
}

await main();
