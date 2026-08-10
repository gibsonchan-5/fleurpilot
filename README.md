# FleurPilot（传彩笔AI）

> An Obsidian AI writing companion built for Chinese users — clean UI, zero learning curve, native Chinese experience.

![Obsidian](https://img.shields.io/badge/Obsidian-1.0+-purple)
![License](https://img.shields.io/badge/license-MIT-green)
[![Release](https://img.shields.io/badge/release-0.3.0-blue)](https://github.com/gibsonchan-5/fleurpilot/releases)

[English](#english) | [中文](#中文)

---

## English

### Why FleurPilot?

Most Obsidian AI plugins are built with English-first users in mind. FleurPilot flips that: **Chinese is the first-class citizen**. From the UI to the AI prompts, every detail is tuned for Chinese writing workflows — while still working beautifully in English, Japanese, and Traditional Chinese.

Compared to Copilot-style plugins, FleurPilot is designed around how Chinese users actually work:

- **Minimal UI, no clutter** — No flashy gradients, no emoji overload, no "AI-looking" interfaces. Clean design inspired by Apple/Linear/Notion aesthetics.
- **Chinese-native experience** — UI labels, skill names, and AI interactions all feel natural in Chinese. Not a translated afterthought.
- **Domestic model support out of the box** — DeepSeek, Qwen (通义千问), GLM (智谱), SiliconFlow (硅基流动) are pre-configured. No hunting for API endpoints.
- **Inline editing that respects your text** — Select, rewrite, preview diff, apply. No copy-paste round-trips to a chat window.
- **Zero configuration pressure** — Pick your provider, enter the API key, start writing. That's it.

### Features

- **AI Chat** — Side panel with streaming responses, context-aware (current note / folder / all notes)
- **Chat / Deep Thinking** — Toggle between quick chat and deep reasoning modes
- **Inline Editing** — Polish, shorten, expand, translate, proofread selected text directly in the editor
- **Quick Skills** — One-click full-note polish, proofread, and translate (auto-detects Chinese↔English direction)
- **Writing Assistant** — Full-note review, structure analysis, tone analysis, summary generation
- **Right-Click Menu** — Quick AI actions on selected text
- **Multi-Language UI** — Simplified Chinese, Traditional Chinese, English, Japanese

### Supported Model Providers

| Provider | Base URL |
|---|---|
| DeepSeek | `https://api.deepseek.com/v1` |
| Qwen (DashScope) | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| GLM (ZhiPu) | `https://open.bigmodel.cn/api/paas/v4` |
| SiliconFlow | `https://api.siliconflow.cn/v1` |
| Custom | Any OpenAI-compatible endpoint |

### Installation

**Option A — Download the bundle (recommended):**

1. Download `fleurpilot-1.0.2.zip` from [Releases](https://github.com/gibsonchan-5/fleurpilot/releases)
2. Extract the zip — you'll get a `fleurpilot/` folder containing `main.js`, `styles.css`, and `manifest.json`
3. Move the `fleurpilot/` folder into your vault's `.obsidian/plugins/` directory
4. Open Obsidian → Settings → Community Plugins → Enable "FleurPilot"
5. Go to plugin settings and enter your API Key

**Option B — Manual installation:**

1. Download `main.js`, `styles.css`, and `manifest.json` from [Releases](https://github.com/gibsonchan-5/fleurpilot/releases)
2. Create a folder named `fleurpilot` inside your vault's `.obsidian/plugins/` directory
3. Place the three files into that folder
4. Open Obsidian → Settings → Community Plugins → Enable "FleurPilot"
5. Go to plugin settings and enter your API Key

### Build from Source

```bash
git clone https://github.com/gibsonchan-5/fleurpilot.git
cd fleurpilot
npm install
npm run build
```

---

## 中文

### 为什么选择 FleurPilot（传彩笔AI）？

市面上的 Obsidian AI 插件几乎都以英文用户为第一优先级，中文体验往往是事后补上的翻译。FleurPilot（传彩笔AI）不同——**中文是第一语言**。从界面设计到 AI 交互，每个细节都围绕中文写作场景打磨。

与 Copilot 类插件相比，FleurPilot（传彩笔AI）更贴合国内用户的使用习惯：

- **界面极简，拒绝 AI 味** — 没有渐变特效、没有 emoji 堆砌、没有花哨装饰。设计灵感来自 Apple / Linear / Notion 的克制美学，打开即用，无需学习。
- **中文原生体验** — 界面文案、技能名称、AI 交互语言都是地道的中文，不是机翻产物。繁中、英文、日文同样原生支持。
- **国内模型开箱即用** — DeepSeek、通义千问、智谱 GLM、硅基流动已预置 API 地址，用户只需填入 Key 即可开始使用，不用自己查找接口文档。
- **侵入式编辑，所见即所得** — 选中文本 → 右键改写 → 预览 diff → 一键应用。不用在聊天窗口和编辑器之间来回复制粘贴。
- **零配置压力** — 选模型、填 Key、开始写。三步搞定，没有复杂的参数面板。

### 功能亮点

- **AI 对话** — 侧边栏流式对话，支持携带当前笔记 / 文件夹 / 全部笔记作为上下文
- **Chat / 深度思考** — 一键切换普通对话与深度推理模式
- **侵入式编辑** — 选中文本直接改写（精简、扩写、润色、翻译、校对），编辑器内预览 diff 并应用
- **快捷技能** — 一键全文润色、智能校对、全文翻译（自动识别中英方向）
- **写作助手** — 全文审读、结构分析、风格分析、内容摘要
- **右键菜单** — 编辑器中选中文本即可快速调用 AI
- **多语言界面** — 简体中文、繁体中文、英文、日文

### 支持模型

| 服务商 | Base URL |
|---|---|
| DeepSeek | `https://api.deepseek.com/v1` |
| 通义千问 (DashScope) | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` |
| 硅基流动 | `https://api.siliconflow.cn/v1` |
| 自定义 | 任意 OpenAI 兼容接口 |

### 安装

**方式 A — 一键打包下载（推荐）：**

1. 从 [Releases](https://github.com/gibsonchan-5/fleurpilot/releases) 下载 `fleurpilot-1.0.2.zip`
2. 解压后会得到一个 `fleurpilot/` 文件夹，里面包含 `main.js`、`styles.css`、`manifest.json` 三个文件
3. 把 `fleurpilot/` 文件夹整个移动到 vault 的 `.obsidian/plugins/` 目录下
4. 打开 Obsidian → 设置 → 社区插件 → 启用「FleurPilot（传彩笔AI）」
5. 进入插件设置，填入 API Key

**方式 B — 手动安装：**

1. 从 [Releases](https://github.com/gibsonchan-5/fleurpilot/releases) 下载 `main.js`、`styles.css`、`manifest.json` 三个文件
2. 在 vault 的 `.obsidian/plugins/` 目录下创建 `fleurpilot` 文件夹
3. 将三个文件放入该文件夹
4. 打开 Obsidian → 设置 → 社区插件 → 启用「FleurPilot（传彩笔AI）」
5. 进入插件设置，填入 API Key

### 从源码构建

```bash
git clone https://github.com/gibsonchan-5/fleurpilot.git
cd fleurpilot
npm install
npm run build
```

## ⚠️ Security

API Key is stored locally in your vault's plugin data file (`data.json`). Please keep it safe and do not share with others.

> API Key 存储在 vault 的插件数据文件（`data.json`）中，请妥善保管，勿与他人分享。

---

## License

MIT License. See [LICENSE](LICENSE) for details.
