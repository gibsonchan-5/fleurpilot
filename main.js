var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/core/llm-service.ts
var llm_service_exports = {};
__export(llm_service_exports, {
  LLMService: () => LLMService
});
var import_obsidian, LLMService;
var init_llm_service = __esm({
  "src/core/llm-service.ts"() {
    import_obsidian = require("obsidian");
    LLMService = class {
      constructor(settings) {
        this.abortController = null;
        this.settings = settings;
      }
      async sendMessage(messages, onChunk, onEnd, onReasoning) {
        const { baseUrl, apiKey, model, reasoningModel, temperature, maxTokens, systemPrompt } = this.settings;
        if (!apiKey) {
          throw new Error("API Key \u672A\u914D\u7F6E\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199");
        }
        if (!baseUrl) {
          throw new Error("API Base URL \u672A\u914D\u7F6E");
        }
        const effectiveModel = onReasoning ? reasoningModel : model;
        const requestBody = {
          model: effectiveModel,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages
          ],
          temperature,
          max_tokens: maxTokens,
          stream: true
        };
        if (this.abortController) {
          this.abortController.abort();
        }
        this.abortController = new AbortController();
        try {
          const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
          const params = {
            url,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody),
            throw: false
          };
          const response = await (0, import_obsidian.requestUrl)(params);
          if (response.status < 200 || response.status >= 300) {
            const errorText = response.text || `HTTP ${response.status}`;
            throw new Error(`API \u8BF7\u6C42\u5931\u8D25 (${response.status}): ${errorText}`);
          }
          const text = response.text;
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") {
                onEnd();
                return;
              }
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;
                if (delta) {
                  const reasoningChunk = delta.reasoning_content;
                  if (reasoningChunk && onReasoning) {
                    onReasoning(reasoningChunk);
                  }
                  const content = delta.content;
                  if (content) {
                    onChunk(content);
                  }
                }
              } catch {
              }
            }
          }
          onEnd();
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            throw new Error("\u8BF7\u6C42\u5DF2\u53D6\u6D88");
          }
          if (error instanceof Error) {
            throw error;
          }
          throw new Error("\u672A\u77E5\u9519\u8BEF");
        }
      }
      cancel() {
        if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
        }
      }
    };
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => FleurPilotPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian6 = require("obsidian");

// src/settings.ts
var import_obsidian2 = require("obsidian");

// src/i18n/locales.ts
var LANG_LABELS = {
  "zh-CN": "\u7B80\u4F53\u4E2D\u6587",
  "zh-TW": "\u7E41\u9AD4\u4E2D\u6587",
  "en": "English",
  "ja": "\u65E5\u672C\u8A9E"
};
var zhCN = {
  // settings
  "settings.modelConfig": "\u6A21\u578B\u914D\u7F6E",
  "settings.generationParams": "\u751F\u6210\u53C2\u6570",
  "settings.featureSettings": "\u529F\u80FD\u8BBE\u7F6E",
  "settings.connectionTest": "\u8FDE\u63A5\u6D4B\u8BD5",
  "settings.provider": "\u6A21\u578B\u63D0\u4F9B\u5546",
  "settings.providerDesc": '\u9009\u62E9\u9884\u8BBE\u670D\u52A1\uFF0C\u6216\u9009\u62E9"\u81EA\u5B9A\u4E49"\u624B\u52A8\u586B\u5199',
  "settings.baseUrl": "API Base URL",
  "settings.baseUrlDesc": "OpenAI \u517C\u5BB9\u63A5\u53E3\u5730\u5740\uFF08\u4E0D\u542B /chat/completions\uFF09",
  "settings.baseUrlPlaceholder": "https://api.deepseek.com/v1",
  "settings.apiKey": "API Key",
  "settings.apiKeyDesc": "\u6A21\u578B API \u5BC6\u94A5\uFF0C\u4EC5\u4FDD\u5B58\u5728\u672C\u5730",
  "settings.apiKeyPlaceholder": "sk-...",
  "settings.model": "\u6A21\u578B\u540D\u79F0",
  "settings.modelDesc": "\u65E5\u5E38\u5BF9\u8BDD\u4F7F\u7528\u7684\u6A21\u578B\uFF0C\u5982 deepseek-chat\u3001qwen-plus\u3001glm-4-flash \u7B49",
  "settings.modelPlaceholder": "deepseek-chat",
  "settings.reasoningModel": "\u63A8\u7406\u6A21\u578B",
  "settings.reasoningModelDesc": "Deep Thinking \u6A21\u5F0F\u4F7F\u7528\u7684\u6A21\u578B\uFF0C\u9700\u652F\u6301 reasoning_content \u8F93\u51FA\uFF08\u5982 deepseek-reasoner\uFF09",
  "settings.reasoningModelPlaceholder": "deepseek-reasoner",
  "settings.systemPrompt": "\u7CFB\u7EDF\u63D0\u793A\u8BCD",
  "settings.systemPromptDesc": "\u5B9A\u4E49\u52A9\u624B\u7684\u884C\u4E3A\u4E0E\u56DE\u590D\u98CE\u683C",
  "settings.systemPromptPlaceholder": "\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u7684\u5199\u4F5C\u4F19\u4F34...",
  "settings.systemPromptDefault": "\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u7684\u5199\u4F5C\u4F19\u4F34\uFF0C\u719F\u6089\u5404\u7C7B\u6587\u672C\u7684\u68B3\u7406\u3001\u6DA6\u8272\u4E0E\u6269\u5C55\u3002\u8BF7\u57FA\u4E8E\u7528\u6237\u63D0\u4F9B\u7684\u7B14\u8BB0\u5185\u5BB9\uFF0C\u7ED9\u51FA\u6E05\u6670\u3001\u51C6\u786E\u3001\u53EF\u76F4\u63A5\u4F7F\u7528\u7684\u56DE\u590D\uFF0C\u4FDD\u6301\u7B80\u6D01\u3001\u514B\u5236\u3001\u5B9E\u7528\u3002",
  "settings.temperature": "\u6E29\u5EA6 (Temperature)",
  "settings.temperatureDesc": "\u8D8A\u9AD8\u8D8A\u968F\u673A\uFF0C\u8D8A\u4F4E\u8D8A\u786E\u5B9A (0-1)",
  "settings.maxTokens": "\u6700\u5927 Token \u6570",
  "settings.maxTokensDesc": "\u56DE\u590D\u7684\u6700\u5927\u957F\u5EA6",
  "settings.enableContext": "\u81EA\u52A8\u643A\u5E26\u7B14\u8BB0\u4E0A\u4E0B\u6587",
  "settings.enableContextDesc": "\u53D1\u9001\u6D88\u606F\u65F6\u81EA\u52A8\u5305\u542B\u5F53\u524D\u6253\u5F00\u7684\u7B14\u8BB0",
  "settings.enableInlineEdit": "\u5185\u8054\u7F16\u8F91",
  "settings.enableInlineEditDesc": "\u9009\u4E2D\u6587\u5B57\u540E\u53EF\u89E6\u53D1\u6539\u5199\uFF08\u7CBE\u7B80/\u6269\u5199/\u6DA6\u8272/\u7FFB\u8BD1\uFF09",
  "settings.enableQuickCommands": "\u5FEB\u6377\u547D\u4EE4",
  "settings.enableQuickCommandsDesc": "\u5728\u547D\u4EE4\u9762\u677F\u4E2D\u6CE8\u518C\u76F8\u5173\u547D\u4EE4",
  "settings.language": "\u754C\u9762\u8BED\u8A00",
  "settings.languageDesc": "\u9009\u62E9\u754C\u9762\u663E\u793A\u8BED\u8A00",
  "settings.testConnection": "\u6D4B\u8BD5\u8FDE\u63A5",
  "settings.testConnectionDesc": "\u53D1\u9001\u4E00\u6761\u6D4B\u8BD5\u6D88\u606F\u9A8C\u8BC1\u914D\u7F6E\u662F\u5426\u6B63\u786E",
  "settings.testBtn": "\u6D4B\u8BD5\u8FDE\u63A5",
  "settings.testing": "\u6D4B\u8BD5\u4E2D...",
  "settings.connected": "\u5DF2\u8FDE\u63A5",
  "settings.connectionFailed": "\u5931\u8D25",
  "settings.connectionTestPrompt": '\u8BF7\u56DE\u590D"\u8FDE\u63A5\u6210\u529F"\u56DB\u4E2A\u5B57',
  // main commands
  "command.openChat": "\u6253\u5F00\u804A\u5929\u7A97\u53E3",
  "command.newChat": "\u65B0\u5EFA\u5BF9\u8BDD",
  "command.explain": "\u89E3\u91CA\u9009\u4E2D\u6587\u672C",
  "command.shorten": "\u7CBE\u7B80\u9009\u4E2D\u6587\u672C",
  "command.expand": "\u6269\u5199\u9009\u4E2D\u6587\u672C",
  "command.polish": "\u6DA6\u8272\u9009\u4E2D\u6587\u672C",
  "command.translateCN": "\u7FFB\u8BD1\u4E3A\u4E2D\u6587",
  "command.translateEN": "\u7FFB\u8BD1\u4E3A\u82F1\u6587",
  "command.proofread": "\u6821\u5BF9\u9009\u4E2D\u6587\u672C",
  "command.reviewNote": "\u5BA1\u8BFB\u6821\u5BF9\u5F53\u524D\u7B14\u8BB0",
  "command.writingAdvice": "\u83B7\u53D6\u5199\u4F5C\u5EFA\u8BAE",
  "command.analyzeStructure": "\u5206\u6790\u7B14\u8BB0\u7ED3\u6784",
  "command.analyzeTone": "\u5206\u6790\u8BED\u8A00\u98CE\u683C",
  "command.generateSummary": "\u751F\u6210\u5185\u5BB9\u6458\u8981",
  "command.customRewrite": "AI \u81EA\u5B9A\u4E49\u6539\u5199\u9009\u4E2D\u6587\u672C",
  "menu.askAI": "\u8BE2\u95EE AI",
  "menu.detailExplain": "\u8BE6\u7EC6\u89E3\u91CA",
  "menu.editParent": "FleurPilot \u6539\u5199",
  "menu.polish": "\u6DA6\u8272",
  "menu.shorten": "\u7CBE\u7B80",
  "menu.expand": "\u6269\u5199",
  "menu.translateCN": "\u7FFB\u8BD1\u4E3A\u4E2D\u6587",
  "menu.translateEN": "\u7FFB\u8BD1\u4E3A\u82F1\u6587",
  "menu.proofread": "\u6821\u5BF9\u7EA0\u9519",
  "menu.custom": "\u81EA\u5B9A\u4E49\u6539\u5199\u2026",
  "notice.selectText": "\u8BF7\u5148\u9009\u4E2D\u8981\u6539\u5199\u7684\u6587\u672C",
  "notice.customInstruction": "\u8BF7\u8F93\u5165\u6539\u5199\u6307\u4EE4\uFF1A",
  // chat view
  "chat.title": "FleurPilot",
  "chat.toggleMode": "\u5207\u6362\u5BF9\u8BDD\u6A21\u5F0F",
  "chat.newChat": "\u65B0\u5EFA\u5BF9\u8BDD",
  "chat.modeChat": "Chat",
  "chat.modeDeepThink": "Deep Thinking",
  "chat.contextAllNotes": "\u5168\u90E8\u7B14\u8BB0",
  "chat.contextChooseFolder": "\u9009\u62E9\u6587\u4EF6\u5939",
  "chat.contextNone": "\u65E0\u4E0A\u4E0B\u6587",
  "chat.contextCurrentNote": "\u5F53\u524D\u7B14\u8BB0",
  "chat.contextNoneShort": "\u65E0",
  "chat.placeholder": "\u8F93\u5165\u6D88\u606F\u2026 (\u21B5 \u53D1\u9001, Shift+\u21B5 \u6362\u884C)",
  "chat.send": "\u53D1\u9001",
  "chat.welcomeTitle": "FleurPilot",
  "chat.welcomeSub": "\u4F60\u7684 AI \u4F19\u4F34",
  "chat.welcomeHint": "\u9009\u4E2D\u6587\u672C\uFF0C\u53F3\u952E\u4F7F\u7528FleurPilot",
  "chat.skillPolish": "\u5168\u6587\u6DA6\u8272",
  "chat.skillProofread": "\u667A\u80FD\u6821\u5BF9",
  "chat.skillTranslate": "\u5168\u6587\u7FFB\u8BD1",
  "chat.skillPolishPrompt": "\u8BF7\u5BF9\u5F53\u524D\u7B14\u8BB0\u7684\u5168\u6587\u8FDB\u884C\u6DA6\u8272\uFF0C\u4F18\u5316\u8BED\u8A00\u8868\u8FBE\uFF0C\u4F7F\u884C\u6587\u66F4\u6D41\u7545\u3001\u51C6\u786E\u3001\u6709\u8D28\u611F\u3002\u4FDD\u6301\u539F\u610F\u4E0D\u53D8\uFF0C\u4EC5\u63D0\u5347\u6587\u5B57\u8D28\u91CF\u3002",
  "chat.skillProofreadPrompt": "\u8BF7\u5BF9\u5F53\u524D\u7B14\u8BB0\u7684\u5168\u6587\u8FDB\u884C\u6821\u5BF9\uFF0C\u68C0\u67E5\u9519\u522B\u5B57\u3001\u6807\u70B9\u8BEF\u7528\u3001\u8BED\u6CD5\u95EE\u9898\u3001\u8868\u8FF0\u4E0D\u5F53\u4E4B\u5904\uFF0C\u5E76\u9010\u4E00\u5217\u51FA\u95EE\u9898\u548C\u4FEE\u6539\u5EFA\u8BAE\u3002",
  "chat.skillTranslateENPrompt": "\u8BF7\u5C06\u5F53\u524D\u7B14\u8BB0\u7684\u5168\u6587\u7FFB\u8BD1\u4E3A\u82F1\u6587\uFF0C\u4FDD\u6301\u4E13\u4E1A\u672F\u8BED\u51C6\u786E\u3001\u884C\u6587\u6D41\u7545\u81EA\u7136\u3002",
  "chat.skillTranslateCNPrompt": "\u8BF7\u5C06\u5F53\u524D\u7B14\u8BB0\u7684\u5168\u6587\u7FFB\u8BD1\u4E3A\u4E2D\u6587\uFF0C\u4FDD\u6301\u4E13\u4E1A\u672F\u8BED\u51C6\u786E\u3001\u884C\u6587\u6D41\u7545\u81EA\u7136\u3002",
  "chat.notice.openNote": "\u8BF7\u5148\u6253\u5F00\u4E00\u7BC7\u7B14\u8BB0",
  "chat.notice.readError": "\u8BFB\u53D6\u7B14\u8BB0\u5931\u8D25",
  "chat.notice.newChat": "\u5DF2\u5F00\u59CB\u65B0\u5BF9\u8BDD",
  "chat.roleUser": "\u4F60",
  "chat.roleAssistant": "FleurPilot",
  "chat.avatarUser": "\u6211",
  "chat.reasoningLabel": "\u601D\u8003\u8FC7\u7A0B",
  "chat.thinking": "\u601D\u8003\u4E2D\u2026",
  "chat.contextNoteLabel": "\u5F53\u524D\u7B14\u8BB0",
  "chat.contextAllLabel": "\u5168\u90E8",
  "chat.contextFolderLabel": "\u6587\u4EF6\u5939",
  // chat history
  "settings.chatHistory": "\u5BF9\u8BDD\u5386\u53F2",
  "settings.enableChatHistory": "\u81EA\u52A8\u4FDD\u5B58\u5BF9\u8BDD\u5386\u53F2",
  "settings.enableChatHistoryDesc": "\u5F00\u59CB\u65B0\u5BF9\u8BDD\u524D\u81EA\u52A8\u5C06\u5F53\u524D\u5BF9\u8BDD\u4FDD\u5B58\u4E3A\u7B14\u8BB0",
  "settings.chatHistoryFolder": "\u4FDD\u5B58\u6587\u4EF6\u5939",
  "settings.chatHistoryFolderDesc": "\u9009\u62E9\u6216\u8F93\u5165\u4FDD\u5B58\u5BF9\u8BDD\u5386\u53F2\u7684\u6587\u4EF6\u5939\u8DEF\u5F84",
  "chat.actions.saveNote": "\u4FDD\u5B58\u7B14\u8BB0",
  "chat.actions.copy": "\u590D\u5236",
  "chat.actions.regenerate": "\u91CD\u65B0\u751F\u6210",
  "chat.notice.copied": "\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F",
  "chat.notice.saved": "\u5BF9\u8BDD\u5DF2\u4FDD\u5B58\u4E3A\u7B14\u8BB0",
  "chat.notice.regenerating": "\u6B63\u5728\u91CD\u65B0\u751F\u6210\u2026",
  "chat.notice.noMessages": "\u6CA1\u6709\u53EF\u4FDD\u5B58\u7684\u6D88\u606F",
  // inline edit (zh-CN)
  "inline.title": "\u6539\u5199",
  "inline.original": "\u539F\u6587",
  "inline.result": "\u6539\u5199\u7ED3\u679C",
  "inline.loading": "\u6B63\u5728\u6539\u5199...",
  "inline.cancel": "\u53D6\u6D88",
  "inline.apply": "\u5E94\u7528\u4FEE\u6539",
  "inline.applied": "\u5DF2\u5E94\u7528\u4FEE\u6539",
  "inline.explainPrompt": "\u8BF7\u89E3\u91CA\u8FD9\u6BB5\u5185\u5BB9\u7684\u542B\u4E49\uFF0C\u7528\u66F4\u901A\u4FD7\u6613\u61C2\u7684\u65B9\u5F0F\u8868\u8FBE\uFF1A",
  "inline.shortenPrompt": "\u8BF7\u7CBE\u7B80\u8FD9\u6BB5\u6587\u5B57\uFF0C\u53BB\u9664\u5197\u4F59\u8868\u8FBE\uFF0C\u4FDD\u7559\u6838\u5FC3\u4FE1\u606F\uFF1A",
  "inline.expandPrompt": "\u8BF7\u6269\u5199\u8FD9\u6BB5\u6587\u5B57\uFF0C\u589E\u52A0\u7EC6\u8282\u548C\u80CC\u666F\u4FE1\u606F\uFF0C\u4F7F\u5176\u66F4\u52A0\u4E30\u5BCC\uFF1A",
  "inline.polishPrompt": "\u8BF7\u6DA6\u8272\u8FD9\u6BB5\u6587\u5B57\uFF0C\u4F18\u5316\u8868\u8FBE\uFF0C\u4F7F\u5176\u66F4\u52A0\u6D41\u7545\u4E13\u4E1A\uFF1A",
  "inline.translateCNPrompt": "\u8BF7\u5C06\u8FD9\u6BB5\u6587\u5B57\u7FFB\u8BD1\u4E3A\u6D41\u7545\u7684\u4E2D\u6587\uFF1A",
  "inline.translateENPrompt": "Please translate this text into fluent English:",
  "inline.proofreadPrompt": "\u8BF7\u5BA1\u8BFB\u6821\u5BF9\u8FD9\u6BB5\u6587\u5B57\uFF0C\u4FEE\u6B63\u9519\u522B\u5B57\u3001\u8BED\u6CD5\u9519\u8BEF\u548C\u6807\u70B9\u95EE\u9898\uFF1A",
  // writing assistant
  "assist.review": "\u5BA1\u8BFB\u6821\u5BF9",
  "assist.suggest": "\u5199\u4F5C\u5EFA\u8BAE",
  "assist.structure": "\u7ED3\u6784\u5206\u6790",
  "assist.tone": "\u98CE\u683C\u5206\u6790",
  "assist.summary": "\u5185\u5BB9\u6458\u8981",
  "assist.loading": "\u6B63\u5728\u5206\u6790...",
  // llm errors
  "error.noApiKey": "API Key \u672A\u914D\u7F6E\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199",
  "error.noBaseUrl": "API Base URL \u672A\u914D\u7F6E",
  "error.requestCancelled": "\u8BF7\u6C42\u5DF2\u53D6\u6D88",
  // plugin lifecycle
  "plugin.loaded": "FleurPilot \u63D2\u4EF6\u5DF2\u52A0\u8F7D",
  "plugin.unloaded": "FleurPilot \u63D2\u4EF6\u5DF2\u5378\u8F7D"
};
var zhTW = {
  "settings.modelConfig": "\u6A21\u578B\u914D\u7F6E",
  "settings.generationParams": "\u751F\u6210\u53C3\u6578",
  "settings.featureSettings": "\u529F\u80FD\u8A2D\u5B9A",
  "settings.connectionTest": "\u9023\u7DDA\u6E2C\u8A66",
  "settings.provider": "\u6A21\u578B\u63D0\u4F9B\u5546",
  "settings.providerDesc": "\u9078\u64C7\u9810\u8A2D\u670D\u52D9\uFF0C\u6216\u9078\u64C7\u300C\u81EA\u8A02\u300D\u624B\u52D5\u586B\u5BEB",
  "settings.baseUrl": "API Base URL",
  "settings.baseUrlDesc": "OpenAI \u76F8\u5BB9\u4ECB\u9762\u4F4D\u5740\uFF08\u4E0D\u542B /chat/completions\uFF09",
  "settings.baseUrlPlaceholder": "https://api.deepseek.com/v1",
  "settings.apiKey": "API Key",
  "settings.apiKeyDesc": "\u6A21\u578B API \u91D1\u9470\uFF0C\u50C5\u4FDD\u5B58\u5728\u672C\u5730",
  "settings.apiKeyPlaceholder": "sk-...",
  "settings.model": "\u6A21\u578B\u540D\u7A31",
  "settings.modelDesc": "\u65E5\u5E38\u5C0D\u8A71\u4F7F\u7528\u7684\u6A21\u578B\uFF0C\u5982 deepseek-chat\u3001qwen-plus\u3001glm-4-flash \u7B49",
  "settings.modelPlaceholder": "deepseek-chat",
  "settings.reasoningModel": "\u63A8\u7406\u6A21\u578B",
  "settings.reasoningModelDesc": "Deep Thinking \u6A21\u5F0F\u4F7F\u7528\u7684\u6A21\u578B\uFF0C\u9700\u652F\u63F4 reasoning_content \u8F38\u51FA\uFF08\u5982 deepseek-reasoner\uFF09",
  "settings.reasoningModelPlaceholder": "deepseek-reasoner",
  "settings.systemPrompt": "\u7CFB\u7D71\u63D0\u793A\u8A5E",
  "settings.systemPromptDesc": "\u5B9A\u7FA9\u52A9\u624B\u7684\u884C\u70BA\u8207\u56DE\u8986\u98A8\u683C",
  "settings.systemPromptPlaceholder": "\u4F60\u662F\u4E00\u4F4D\u5C08\u696D\u7684\u5BEB\u4F5C\u5925\u4F34...",
  "settings.systemPromptDefault": "\u4F60\u662F\u4E00\u4F4D\u5C08\u696D\u7684\u5BEB\u4F5C\u5925\u4F34\uFF0C\u719F\u6089\u5404\u985E\u6587\u672C\u7684\u68B3\u7406\u3001\u6F64\u8272\u8207\u64F4\u5C55\u3002\u8ACB\u57FA\u65BC\u4F7F\u7528\u8005\u63D0\u4F9B\u7684\u7B46\u8A18\u5167\u5BB9\uFF0C\u7D66\u51FA\u6E05\u6670\u3001\u6E96\u78BA\u3001\u53EF\u76F4\u63A5\u4F7F\u7528\u7684\u56DE\u8986\uFF0C\u4FDD\u6301\u7C21\u6F54\u3001\u514B\u5236\u3001\u5BE6\u7528\u3002",
  "settings.temperature": "\u6EAB\u5EA6 (Temperature)",
  "settings.temperatureDesc": "\u8D8A\u9AD8\u8D8A\u96A8\u6A5F\uFF0C\u8D8A\u4F4E\u8D8A\u78BA\u5B9A (0-1)",
  "settings.maxTokens": "\u6700\u5927 Token \u6578",
  "settings.maxTokensDesc": "\u56DE\u8986\u7684\u6700\u5927\u9577\u5EA6",
  "settings.enableContext": "\u81EA\u52D5\u651C\u5E36\u7B46\u8A18\u4E0A\u4E0B\u6587",
  "settings.enableContextDesc": "\u767C\u9001\u8A0A\u606F\u6642\u81EA\u52D5\u5305\u542B\u7576\u524D\u958B\u555F\u7684\u7B46\u8A18",
  "settings.enableInlineEdit": "\u5167\u806F\u7DE8\u8F2F",
  "settings.enableInlineEditDesc": "\u9078\u53D6\u6587\u5B57\u5F8C\u53EF\u89F8\u767C\u6539\u5BEB\uFF08\u7CBE\u7C21/\u64F4\u5BEB/\u6F64\u8272/\u7FFB\u8B6F\uFF09",
  "settings.enableQuickCommands": "\u5FEB\u6377\u547D\u4EE4",
  "settings.enableQuickCommandsDesc": "\u5728\u547D\u4EE4\u9762\u677F\u4E2D\u8A3B\u518A\u76F8\u95DC\u547D\u4EE4",
  "settings.language": "\u4ECB\u9762\u8A9E\u8A00",
  "settings.languageDesc": "\u9078\u64C7\u4ECB\u9762\u986F\u793A\u8A9E\u8A00",
  "settings.testConnection": "\u6E2C\u8A66\u9023\u7DDA",
  "settings.testConnectionDesc": "\u767C\u9001\u4E00\u689D\u6E2C\u8A66\u8A0A\u606F\u9A57\u8B49\u914D\u7F6E\u662F\u5426\u6B63\u78BA",
  "settings.testBtn": "\u6E2C\u8A66\u9023\u7DDA",
  "settings.testing": "\u6E2C\u8A66\u4E2D...",
  "settings.connected": "\u5DF2\u9023\u7DDA",
  "settings.connectionFailed": "\u5931\u6557",
  "settings.connectionTestPrompt": "\u8ACB\u56DE\u8986\u300C\u9023\u7DDA\u6210\u529F\u300D\u56DB\u500B\u5B57",
  "command.openChat": "\u958B\u555F\u804A\u5929\u8996\u7A97",
  "command.newChat": "\u65B0\u589E\u5C0D\u8A71",
  "command.explain": "\u89E3\u91CB\u9078\u53D6\u6587\u5B57",
  "command.shorten": "\u7CBE\u7C21\u9078\u53D6\u6587\u5B57",
  "command.expand": "\u64F4\u5BEB\u9078\u53D6\u6587\u5B57",
  "command.polish": "\u6F64\u8272\u9078\u53D6\u6587\u5B57",
  "command.translateCN": "\u7FFB\u8B6F\u70BA\u4E2D\u6587",
  "command.translateEN": "\u7FFB\u8B6F\u70BA\u82F1\u6587",
  "command.proofread": "\u6821\u5C0D\u9078\u53D6\u6587\u5B57",
  "command.reviewNote": "\u5BE9\u8B80\u6821\u5C0D\u7576\u524D\u7B46\u8A18",
  "command.writingAdvice": "\u7372\u53D6\u5BEB\u4F5C\u5EFA\u8B70",
  "command.analyzeStructure": "\u5206\u6790\u7B46\u8A18\u7D50\u69CB",
  "command.analyzeTone": "\u5206\u6790\u8A9E\u8A00\u98A8\u683C",
  "command.generateSummary": "\u751F\u6210\u5167\u5BB9\u6458\u8981",
  "command.customRewrite": "AI \u81EA\u8A02\u6539\u5BEB\u9078\u53D6\u6587\u5B57",
  "menu.askAI": "\u8A62\u554F AI",
  "menu.detailExplain": "\u8A73\u7D30\u89E3\u91CB",
  "menu.editParent": "FleurPilot \u6539\u5BEB",
  "menu.polish": "\u6F64\u8272",
  "menu.shorten": "\u7CBE\u7C21",
  "menu.expand": "\u64F4\u5BEB",
  "menu.translateCN": "\u7FFB\u8B6F\u70BA\u4E2D\u6587",
  "menu.translateEN": "\u7FFB\u8B6F\u70BA\u82F1\u6587",
  "menu.proofread": "\u6821\u5C0D\u7CFE\u932F",
  "menu.custom": "\u81EA\u8A02\u6539\u5BEB\u2026",
  "notice.selectText": "\u8ACB\u5148\u9078\u53D6\u8981\u6539\u5BEB\u7684\u6587\u5B57",
  "notice.customInstruction": "\u8ACB\u8F38\u5165\u6539\u5BEB\u6307\u4EE4\uFF1A",
  "chat.title": "FleurPilot",
  "chat.toggleMode": "\u5207\u63DB\u5C0D\u8A71\u6A21\u5F0F",
  "chat.newChat": "\u65B0\u589E\u5C0D\u8A71",
  "chat.modeChat": "Chat",
  "chat.modeDeepThink": "Deep Thinking",
  "chat.contextAllNotes": "\u5168\u90E8\u7B46\u8A18",
  "chat.contextChooseFolder": "\u9078\u64C7\u8CC7\u6599\u593E",
  "chat.contextNone": "\u7121\u4E0A\u4E0B\u6587",
  "chat.contextCurrentNote": "\u7576\u524D\u7B46\u8A18",
  "chat.contextNoneShort": "\u7121",
  "chat.placeholder": "\u8F38\u5165\u8A0A\u606F\u2026 (\u21B5 \u767C\u9001, Shift+\u21B5 \u63DB\u884C)",
  "chat.send": "\u767C\u9001",
  "chat.welcomeTitle": "FleurPilot",
  "chat.welcomeSub": "\u4F60\u7684 AI \u4F19\u4F34",
  "chat.welcomeHint": "\u9078\u53D6\u6587\u5B57\uFF0C\u53F3\u9375\u4F7F\u7528 FleurPilot",
  "chat.skillPolish": "\u5168\u6587\u6F64\u8272",
  "chat.skillProofread": "\u667A\u6167\u6821\u5C0D",
  "chat.skillTranslate": "\u5168\u6587\u7FFB\u8B6F",
  "chat.skillPolishPrompt": "\u8ACB\u5C0D\u7576\u524D\u7B46\u8A18\u7684\u5168\u6587\u9032\u884C\u6F64\u8272\uFF0C\u6700\u4F73\u5316\u8A9E\u8A00\u8868\u9054\uFF0C\u4F7F\u884C\u6587\u66F4\u6D41\u66A2\u3001\u6E96\u78BA\u3001\u6709\u8CEA\u611F\u3002\u4FDD\u6301\u539F\u610F\u4E0D\u8B8A\uFF0C\u50C5\u63D0\u5347\u6587\u5B57\u54C1\u8CEA\u3002",
  "chat.skillProofreadPrompt": "\u8ACB\u5C0D\u7576\u524D\u7B46\u8A18\u7684\u5168\u6587\u9032\u884C\u6821\u5C0D\uFF0C\u6AA2\u67E5\u932F\u5225\u5B57\u3001\u6A19\u9EDE\u8AA4\u7528\u3001\u8A9E\u6CD5\u554F\u984C\u3001\u8868\u8FF0\u4E0D\u7576\u4E4B\u8655\uFF0C\u4E26\u9010\u4E00\u5217\u51FA\u554F\u984C\u548C\u4FEE\u6539\u5EFA\u8B70\u3002",
  "chat.skillTranslateENPrompt": "\u8ACB\u5C07\u7576\u524D\u7B46\u8A18\u7684\u5168\u6587\u7FFB\u8B6F\u70BA\u82F1\u6587\uFF0C\u4FDD\u6301\u5C08\u696D\u8853\u8A9E\u6E96\u78BA\u3001\u884C\u6587\u6D41\u66A2\u81EA\u7136\u3002",
  "chat.skillTranslateCNPrompt": "\u8ACB\u5C07\u7576\u524D\u7B46\u8A18\u7684\u5168\u6587\u7FFB\u8B6F\u70BA\u4E2D\u6587\uFF0C\u4FDD\u6301\u5C08\u696D\u8853\u8A9E\u6E96\u78BA\u3001\u884C\u6587\u6D41\u66A2\u81EA\u7136\u3002",
  "chat.notice.openNote": "\u8ACB\u5148\u958B\u555F\u4E00\u7BC7\u7B46\u8A18",
  "chat.notice.readError": "\u8B80\u53D6\u7B46\u8A18\u5931\u6557",
  "chat.notice.newChat": "\u5DF2\u958B\u59CB\u65B0\u5C0D\u8A71",
  "chat.roleUser": "\u4F60",
  "chat.roleAssistant": "FleurPilot",
  "chat.avatarUser": "\u6211",
  "chat.reasoningLabel": "\u601D\u8003\u904E\u7A0B",
  "chat.thinking": "\u601D\u8003\u4E2D\u2026",
  "chat.contextNoteLabel": "\u7576\u524D\u7B46\u8A18",
  "chat.contextAllLabel": "\u5168\u90E8",
  "chat.contextFolderLabel": "\u8CC7\u6599\u593E",
  // chat history
  "settings.chatHistory": "\u5C0D\u8A71\u6B77\u53F2",
  "settings.enableChatHistory": "\u81EA\u52D5\u5132\u5B58\u5C0D\u8A71\u6B77\u53F2",
  "settings.enableChatHistoryDesc": "\u958B\u59CB\u65B0\u5C0D\u8A71\u524D\u81EA\u52D5\u5C07\u7576\u524D\u5C0D\u8A71\u5132\u5B58\u70BA\u7B46\u8A18",
  "settings.chatHistoryFolder": "\u5132\u5B58\u8CC7\u6599\u593E",
  "settings.chatHistoryFolderDesc": "\u9078\u64C7\u6216\u8F38\u5165\u5132\u5B58\u5C0D\u8A71\u6B77\u53F2\u7684\u8CC7\u6599\u593E\u8DEF\u5F91",
  "chat.actions.saveNote": "\u5132\u5B58\u7B46\u8A18",
  "chat.actions.copy": "\u8907\u88FD",
  "chat.actions.regenerate": "\u91CD\u65B0\u751F\u6210",
  "chat.notice.copied": "\u5DF2\u8907\u88FD\u5230\u526A\u8CBC\u7C3F",
  "chat.notice.saved": "\u5C0D\u8A71\u5DF2\u5132\u5B58\u70BA\u7B46\u8A18",
  "chat.notice.regenerating": "\u6B63\u5728\u91CD\u65B0\u751F\u6210\u2026",
  "chat.notice.noMessages": "\u6C92\u6709\u53EF\u5132\u5B58\u7684\u8A0A\u606F",
  "inline.title": "\u6539\u5BEB",
  "inline.original": "\u539F\u6587",
  "inline.result": "\u6539\u5BEB\u7D50\u679C",
  "inline.loading": "\u6B63\u5728\u6539\u5BEB...",
  "inline.cancel": "\u53D6\u6D88",
  "inline.apply": "\u5957\u7528\u4FEE\u6539",
  "inline.applied": "\u5DF2\u5957\u7528\u4FEE\u6539",
  "inline.explainPrompt": "\u8ACB\u89E3\u91CB\u9019\u6BB5\u5167\u5BB9\u7684\u542B\u7FA9\uFF0C\u7528\u66F4\u901A\u4FD7\u6613\u61C2\u7684\u65B9\u5F0F\u8868\u9054\uFF1A",
  "inline.shortenPrompt": "\u8ACB\u7CBE\u7C21\u9019\u6BB5\u6587\u5B57\uFF0C\u53BB\u9664\u5197\u9918\u8868\u9054\uFF0C\u4FDD\u7559\u6838\u5FC3\u8CC7\u8A0A\uFF1A",
  "inline.expandPrompt": "\u8ACB\u64F4\u5BEB\u9019\u6BB5\u6587\u5B57\uFF0C\u589E\u52A0\u7D30\u7BC0\u548C\u80CC\u666F\u8CC7\u8A0A\uFF0C\u4F7F\u5176\u66F4\u52A0\u8C50\u5BCC\uFF1A",
  "inline.polishPrompt": "\u8ACB\u6F64\u8272\u9019\u6BB5\u6587\u5B57\uFF0C\u6700\u4F73\u5316\u8868\u9054\uFF0C\u4F7F\u5176\u66F4\u52A0\u6D41\u66A2\u5C08\u696D\uFF1A",
  "inline.translateCNPrompt": "\u8ACB\u5C07\u9019\u6BB5\u6587\u5B57\u7FFB\u8B6F\u70BA\u6D41\u66A2\u7684\u4E2D\u6587\uFF1A",
  "inline.translateENPrompt": "Please translate this text into fluent English:",
  "inline.proofreadPrompt": "\u8ACB\u5BE9\u8B80\u6821\u5C0D\u9019\u6BB5\u6587\u5B57\uFF0C\u4FEE\u6B63\u932F\u5225\u5B57\u3001\u8A9E\u6CD5\u932F\u8AA4\u548C\u6A19\u9EDE\u554F\u984C\uFF1A",
  "assist.review": "\u5BE9\u8B80\u6821\u5C0D",
  "assist.suggest": "\u5BEB\u4F5C\u5EFA\u8B70",
  "assist.structure": "\u7D50\u69CB\u5206\u6790",
  "assist.tone": "\u98A8\u683C\u5206\u6790",
  "assist.summary": "\u5167\u5BB9\u6458\u8981",
  "assist.loading": "\u6B63\u5728\u5206\u6790...",
  "error.noApiKey": "API Key \u672A\u914D\u7F6E\uFF0C\u8ACB\u5148\u5728\u8A2D\u5B9A\u4E2D\u586B\u5BEB",
  "error.noBaseUrl": "API Base URL \u672A\u914D\u7F6E",
  "error.requestCancelled": "\u8ACB\u6C42\u5DF2\u53D6\u6D88",
  "plugin.loaded": "FleurPilot \u5916\u639B\u5DF2\u8F09\u5165",
  "plugin.unloaded": "FleurPilot \u5916\u639B\u5DF2\u5378\u8F09"
};
var en = {
  "settings.modelConfig": "Model Configuration",
  "settings.generationParams": "Generation Parameters",
  "settings.featureSettings": "Feature Settings",
  "settings.connectionTest": "Connection Test",
  "settings.provider": "Model Provider",
  "settings.providerDesc": 'Choose a preset or select "Custom" to enter manually',
  "settings.baseUrl": "API Base URL",
  "settings.baseUrlDesc": "OpenAI-compatible endpoint (without /chat/completions)",
  "settings.baseUrlPlaceholder": "https://api.deepseek.com/v1",
  "settings.apiKey": "API Key",
  "settings.apiKeyDesc": "Model API key, stored locally only",
  "settings.apiKeyPlaceholder": "sk-...",
  "settings.model": "Model Name",
  "settings.modelDesc": "Model for daily chat, e.g. deepseek-chat, qwen-plus, glm-4-flash",
  "settings.modelPlaceholder": "deepseek-chat",
  "settings.reasoningModel": "Reasoning Model",
  "settings.reasoningModelDesc": "Model for Deep Thinking mode, must support reasoning_content (e.g. deepseek-reasoner)",
  "settings.reasoningModelPlaceholder": "deepseek-reasoner",
  "settings.systemPrompt": "System Prompt",
  "settings.systemPromptDesc": "Define the assistant's behavior and response style",
  "settings.systemPromptPlaceholder": "You are a professional writing partner...",
  "settings.systemPromptDefault": "You are a professional writing partner, skilled at organizing, polishing, and expanding various types of text. Based on the user's note content, provide clear, accurate, and actionable responses. Keep it concise, restrained, and practical.",
  "settings.temperature": "Temperature",
  "settings.temperatureDesc": "Higher = more random, lower = more deterministic (0-1)",
  "settings.maxTokens": "Max Tokens",
  "settings.maxTokensDesc": "Maximum length of the response",
  "settings.enableContext": "Auto-attach note context",
  "settings.enableContextDesc": "Automatically include the current note when sending messages",
  "settings.enableInlineEdit": "Inline editing",
  "settings.enableInlineEditDesc": "Trigger rewriting on selected text (shorten/expand/polish/translate)",
  "settings.enableQuickCommands": "Quick commands",
  "settings.enableQuickCommandsDesc": "Register AI commands in the command palette",
  "settings.language": "Interface Language",
  "settings.languageDesc": "Select the interface display language",
  "settings.testConnection": "Test Connection",
  "settings.testConnectionDesc": "Send a test message to verify your configuration",
  "settings.testBtn": "Test",
  "settings.testing": "Testing...",
  "settings.connected": "Connected",
  "settings.connectionFailed": "Failed",
  "settings.connectionTestPrompt": 'Please reply with "connected"',
  "command.openChat": "Open Chat",
  "command.newChat": "New Chat",
  "command.explain": "Explain selected text",
  "command.shorten": "Shorten selected text",
  "command.expand": "Expand selected text",
  "command.polish": "Polish selected text",
  "command.translateCN": "Translate to Chinese",
  "command.translateEN": "Translate to English",
  "command.proofread": "Proofread selected text",
  "command.reviewNote": "Review current note",
  "command.writingAdvice": "Get writing suggestions",
  "command.analyzeStructure": "Analyze note structure",
  "command.analyzeTone": "Analyze language style",
  "command.generateSummary": "Generate summary",
  "command.customRewrite": "Custom AI rewrite",
  "menu.askAI": "Ask AI",
  "menu.detailExplain": "Explain in detail",
  "menu.editParent": "Edit with FleurPilot",
  "menu.polish": "Polish",
  "menu.shorten": "Shorten",
  "menu.expand": "Expand",
  "menu.translateCN": "Translate to Chinese",
  "menu.translateEN": "Translate to English",
  "menu.proofread": "Proofread",
  "menu.custom": "Custom rewrite...",
  "notice.selectText": "Please select text to rewrite first",
  "notice.customInstruction": "Enter rewrite instruction:",
  "chat.title": "FleurPilot",
  "chat.toggleMode": "Toggle mode",
  "chat.newChat": "New chat",
  "chat.modeChat": "Chat",
  "chat.modeDeepThink": "Deep Thinking",
  "chat.contextAllNotes": "All notes",
  "chat.contextChooseFolder": "Choose folder",
  "chat.contextNone": "No context",
  "chat.contextCurrentNote": "Current note",
  "chat.contextNoneShort": "None",
  "chat.placeholder": "Type a message\u2026 (\u21B5 send, Shift+\u21B5 new line)",
  "chat.send": "Send",
  "chat.welcomeTitle": "FleurPilot",
  "chat.welcomeSub": "Your AI partner",
  "chat.welcomeHint": "Select text, right-click to use FleurPilot",
  "chat.skillPolish": "Polish Full Text",
  "chat.skillProofread": "Smart Proofread",
  "chat.skillTranslate": "Full Translation",
  "chat.skillPolishPrompt": "Please polish the full text of the current note, optimizing language expression to make it more fluent, accurate, and refined. Keep the original meaning unchanged, only improve the text quality.",
  "chat.skillProofreadPrompt": "Please proofread the full text of the current note, checking for typos, punctuation errors, grammar issues, and improper phrasing, listing issues and suggestions one by one.",
  "chat.skillTranslateENPrompt": "Please translate the full text of the current note into English, keeping technical terms accurate and the writing natural and fluid.",
  "chat.skillTranslateCNPrompt": "Please translate the full text of the current note into Chinese, keeping technical terms accurate and the writing natural and fluid.",
  "chat.notice.openNote": "Please open a note first",
  "chat.notice.readError": "Failed to read note",
  "chat.notice.newChat": "New chat started",
  "chat.roleUser": "You",
  "chat.roleAssistant": "FleurPilot",
  "chat.avatarUser": "Me",
  "chat.reasoningLabel": "Thinking",
  "chat.thinking": "Thinking\u2026",
  "chat.contextNoteLabel": "Current",
  "chat.contextAllLabel": "All",
  "chat.contextFolderLabel": "Folder",
  // chat history
  "settings.chatHistory": "Chat History",
  "settings.enableChatHistory": "Auto-save chat history",
  "settings.enableChatHistoryDesc": "Automatically save the current chat as a note before starting a new one",
  "settings.chatHistoryFolder": "Save folder",
  "settings.chatHistoryFolderDesc": "Choose a folder to save chat history notes",
  "chat.actions.saveNote": "Save as note",
  "chat.actions.copy": "Copy",
  "chat.actions.regenerate": "Regenerate",
  "chat.notice.copied": "Copied to clipboard",
  "chat.notice.saved": "Chat saved as note",
  "chat.notice.regenerating": "Regenerating\u2026",
  "chat.notice.noMessages": "No messages to save",
  "inline.title": "Rewrite",
  "inline.original": "Original",
  "inline.result": "Result",
  "inline.loading": "Rewriting...",
  "inline.cancel": "Cancel",
  "inline.apply": "Apply",
  "inline.applied": "Changes applied",
  "inline.explainPrompt": "Please explain the meaning of this content in simpler terms:",
  "inline.shortenPrompt": "Please shorten this text, removing redundant expressions while preserving the core message:",
  "inline.expandPrompt": "Please expand this text, adding details and background to make it richer:",
  "inline.polishPrompt": "Please polish this text, optimizing expression to make it more fluid and professional:",
  "inline.translateCNPrompt": "Please translate this text into fluent Chinese:",
  "inline.translateENPrompt": "Please translate this text into fluent English:",
  "inline.proofreadPrompt": "Please proofread this text, correcting typos, grammar errors, and punctuation issues:",
  "assist.review": "Review",
  "assist.suggest": "Writing Suggestions",
  "assist.structure": "Structure Analysis",
  "assist.tone": "Style Analysis",
  "assist.summary": "Summary",
  "assist.loading": "Analyzing...",
  "error.noApiKey": "API Key not configured. Please fill it in settings.",
  "error.noBaseUrl": "API Base URL not configured",
  "error.requestCancelled": "Request cancelled",
  "plugin.loaded": "FleurPilot plugin loaded",
  "plugin.unloaded": "FleurPilot plugin unloaded"
};
var ja = {
  "settings.modelConfig": "\u30E2\u30C7\u30EB\u8A2D\u5B9A",
  "settings.generationParams": "\u751F\u6210\u30D1\u30E9\u30E1\u30FC\u30BF",
  "settings.featureSettings": "\u6A5F\u80FD\u8A2D\u5B9A",
  "settings.connectionTest": "\u63A5\u7D9A\u30C6\u30B9\u30C8",
  "settings.provider": "\u30E2\u30C7\u30EB\u30D7\u30ED\u30D0\u30A4\u30C0\u30FC",
  "settings.providerDesc": "\u30D7\u30EA\u30BB\u30C3\u30C8\u3092\u9078\u629E\u3059\u308B\u304B\u3001\u300C\u30AB\u30B9\u30BF\u30E0\u300D\u3092\u9078\u3093\u3067\u624B\u52D5\u5165\u529B",
  "settings.baseUrl": "API \u30D9\u30FC\u30B9URL",
  "settings.baseUrlDesc": "OpenAI\u4E92\u63DB\u30A8\u30F3\u30C9\u30DD\u30A4\u30F3\u30C8\uFF08/chat/completions \u3092\u9664\u304F\uFF09",
  "settings.baseUrlPlaceholder": "https://api.deepseek.com/v1",
  "settings.apiKey": "API \u30AD\u30FC",
  "settings.apiKeyDesc": "\u30E2\u30C7\u30EBAPI\u30AD\u30FC\u3001\u30ED\u30FC\u30AB\u30EB\u306E\u307F\u306B\u4FDD\u5B58",
  "settings.apiKeyPlaceholder": "sk-...",
  "settings.model": "\u30E2\u30C7\u30EB\u540D",
  "settings.modelDesc": "\u65E5\u5E38\u4F1A\u8A71\u7528\u30E2\u30C7\u30EB\u3001\u4F8B\uFF1Adeepseek-chat\u3001qwen-plus\u3001glm-4-flash",
  "settings.modelPlaceholder": "deepseek-chat",
  "settings.reasoningModel": "\u63A8\u8AD6\u30E2\u30C7\u30EB",
  "settings.reasoningModelDesc": "Deep Thinking\u30E2\u30FC\u30C9\u7528\u30E2\u30C7\u30EB\u3001reasoning_content\u51FA\u529B\u5BFE\u5FDC\u304C\u5FC5\u8981\uFF08\u4F8B\uFF1Adeepseek-reasoner\uFF09",
  "settings.reasoningModelPlaceholder": "deepseek-reasoner",
  "settings.systemPrompt": "\u30B7\u30B9\u30C6\u30E0\u30D7\u30ED\u30F3\u30D7\u30C8",
  "settings.systemPromptDesc": "\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8\u306E\u52D5\u4F5C\u3068\u5FDC\u7B54\u30B9\u30BF\u30A4\u30EB\u3092\u5B9A\u7FA9",
  "settings.systemPromptPlaceholder": "\u3042\u306A\u305F\u306F\u30D7\u30ED\u306E\u30E9\u30A4\u30C6\u30A3\u30F3\u30B0\u30D1\u30FC\u30C8\u30CA\u30FC\u3067\u3059...",
  "settings.systemPromptDefault": "\u3042\u306A\u305F\u306F\u30D7\u30ED\u306E\u30E9\u30A4\u30C6\u30A3\u30F3\u30B0\u30D1\u30FC\u30C8\u30CA\u30FC\u3067\u3059\u3002\u69D8\u3005\u306A\u30C6\u30AD\u30B9\u30C8\u306E\u6574\u7406\u3001\u63A8\u6572\u3001\u62E1\u5F35\u306B\u7CBE\u901A\u3057\u3066\u3044\u307E\u3059\u3002\u30E6\u30FC\u30B6\u30FC\u306E\u30CE\u30FC\u30C8\u5185\u5BB9\u306B\u57FA\u3065\u3044\u3066\u3001\u660E\u78BA\u3067\u6B63\u78BA\u3001\u3059\u3050\u306B\u4F7F\u3048\u308B\u56DE\u7B54\u3092\u63D0\u4F9B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u7C21\u6F54\u3067\u63A7\u3048\u3081\u3001\u5B9F\u7528\u7684\u306B\u3002",
  "settings.temperature": "\u6E29\u5EA6 (Temperature)",
  "settings.temperatureDesc": "\u9AD8\u3044\u307B\u3069\u30E9\u30F3\u30C0\u30E0\u3001\u4F4E\u3044\u307B\u3069\u78BA\u5B9A\u7684 (0-1)",
  "settings.maxTokens": "\u6700\u5927\u30C8\u30FC\u30AF\u30F3\u6570",
  "settings.maxTokensDesc": "\u5FDC\u7B54\u306E\u6700\u5927\u9577",
  "settings.enableContext": "\u30CE\u30FC\u30C8\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u3092\u81EA\u52D5\u6DFB\u4ED8",
  "settings.enableContextDesc": "\u30E1\u30C3\u30BB\u30FC\u30B8\u9001\u4FE1\u6642\u306B\u73FE\u5728\u306E\u30CE\u30FC\u30C8\u3092\u81EA\u52D5\u7684\u306B\u542B\u3081\u308B",
  "settings.enableInlineEdit": "\u30A4\u30F3\u30E9\u30A4\u30F3\u7DE8\u96C6",
  "settings.enableInlineEditDesc": "\u9078\u629E\u30C6\u30AD\u30B9\u30C8\u306E\u66F8\u304D\u63DB\u3048\u3092\u30C8\u30EA\u30AC\u30FC\uFF08\u77ED\u7E2E/\u62E1\u5F35/\u63A8\u6572/\u7FFB\u8A33\uFF09",
  "settings.enableQuickCommands": "\u30AF\u30A4\u30C3\u30AF\u30B3\u30DE\u30F3\u30C9",
  "settings.enableQuickCommandsDesc": "\u30B3\u30DE\u30F3\u30C9\u30D1\u30EC\u30C3\u30C8\u306B\u95A2\u9023\u30B3\u30DE\u30F3\u30C9\u3092\u767B\u9332",
  "settings.language": "\u30A4\u30F3\u30BF\u30FC\u30D5\u30A7\u30FC\u30B9\u8A00\u8A9E",
  "settings.languageDesc": "\u8868\u793A\u8A00\u8A9E\u3092\u9078\u629E",
  "settings.testConnection": "\u63A5\u7D9A\u30C6\u30B9\u30C8",
  "settings.testConnectionDesc": "\u30C6\u30B9\u30C8\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u9001\u4FE1\u3057\u3066\u8A2D\u5B9A\u3092\u78BA\u8A8D",
  "settings.testBtn": "\u30C6\u30B9\u30C8",
  "settings.testing": "\u30C6\u30B9\u30C8\u4E2D...",
  "settings.connected": "\u63A5\u7D9A\u6E08\u307F",
  "settings.connectionFailed": "\u5931\u6557",
  "settings.connectionTestPrompt": "\u300C\u63A5\u7D9A\u6210\u529F\u300D\u3068\u8FD4\u4FE1\u3057\u3066\u304F\u3060\u3055\u3044",
  "command.openChat": "\u30C1\u30E3\u30C3\u30C8\u3092\u958B\u304F",
  "command.newChat": "\u65B0\u898F\u30C1\u30E3\u30C3\u30C8",
  "command.explain": "\u9078\u629E\u30C6\u30AD\u30B9\u30C8\u3092\u8AAC\u660E",
  "command.shorten": "\u9078\u629E\u30C6\u30AD\u30B9\u30C8\u3092\u77ED\u7E2E",
  "command.expand": "\u9078\u629E\u30C6\u30AD\u30B9\u30C8\u3092\u62E1\u5F35",
  "command.polish": "\u9078\u629E\u30C6\u30AD\u30B9\u30C8\u3092\u63A8\u6572",
  "command.translateCN": "\u4E2D\u56FD\u8A9E\u306B\u7FFB\u8A33",
  "command.translateEN": "\u82F1\u8A9E\u306B\u7FFB\u8A33",
  "command.proofread": "\u9078\u629E\u30C6\u30AD\u30B9\u30C8\u3092\u6821\u6B63",
  "command.reviewNote": "\u73FE\u5728\u306E\u30CE\u30FC\u30C8\u3092\u30EC\u30D3\u30E5\u30FC",
  "command.writingAdvice": "\u57F7\u7B46\u30A2\u30C9\u30D0\u30A4\u30B9\u3092\u53D6\u5F97",
  "command.analyzeStructure": "\u30CE\u30FC\u30C8\u69CB\u9020\u3092\u5206\u6790",
  "command.analyzeTone": "\u8A00\u8A9E\u30B9\u30BF\u30A4\u30EB\u3092\u5206\u6790",
  "command.generateSummary": "\u8981\u7D04\u3092\u751F\u6210",
  "command.customRewrite": "AI\u30AB\u30B9\u30BF\u30E0\u66F8\u304D\u63DB\u3048",
  "menu.askAI": "AI\u306B\u8CEA\u554F",
  "menu.detailExplain": "\u8A73\u7D30\u8AAC\u660E",
  "menu.editParent": "FleurPilot\u3067\u7DE8\u96C6",
  "menu.polish": "\u63A8\u6572",
  "menu.shorten": "\u77ED\u7E2E",
  "menu.expand": "\u62E1\u5F35",
  "menu.translateCN": "\u4E2D\u56FD\u8A9E\u306B\u7FFB\u8A33",
  "menu.translateEN": "\u82F1\u8A9E\u306B\u7FFB\u8A33",
  "menu.proofread": "\u6821\u6B63",
  "menu.custom": "\u30AB\u30B9\u30BF\u30E0\u66F8\u304D\u63DB\u3048\u2026",
  "notice.selectText": "\u66F8\u304D\u63DB\u3048\u308B\u30C6\u30AD\u30B9\u30C8\u3092\u5148\u306B\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044",
  "notice.customInstruction": "\u66F8\u304D\u63DB\u3048\u6307\u793A\u3092\u5165\u529B\uFF1A",
  "chat.title": "FleurPilot",
  "chat.toggleMode": "\u30E2\u30FC\u30C9\u5207\u66FF",
  "chat.newChat": "\u65B0\u898F\u30C1\u30E3\u30C3\u30C8",
  "chat.modeChat": "Chat",
  "chat.modeDeepThink": "Deep Thinking",
  "chat.contextAllNotes": "\u3059\u3079\u3066\u306E\u30CE\u30FC\u30C8",
  "chat.contextChooseFolder": "\u30D5\u30A9\u30EB\u30C0\u3092\u9078\u629E",
  "chat.contextNone": "\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u306A\u3057",
  "chat.contextCurrentNote": "\u73FE\u5728\u306E\u30CE\u30FC\u30C8",
  "chat.contextNoneShort": "\u306A\u3057",
  "chat.placeholder": "\u30E1\u30C3\u30BB\u30FC\u30B8\u3092\u5165\u529B\u2026 (\u21B5 \u9001\u4FE1, Shift+\u21B5 \u6539\u884C)",
  "chat.send": "\u9001\u4FE1",
  "chat.welcomeTitle": "FleurPilot",
  "chat.welcomeSub": "\u3042\u306A\u305F\u306EAI\u30D1\u30FC\u30C8\u30CA\u30FC",
  "chat.welcomeHint": "\u30C6\u30AD\u30B9\u30C8\u3092\u9078\u629E\u3057\u3001\u53F3\u30AF\u30EA\u30C3\u30AF\u3067FleurPilot\u3092\u4F7F\u7528",
  "chat.skillPolish": "\u5168\u6587\u63A8\u6572",
  "chat.skillProofread": "\u30B9\u30DE\u30FC\u30C8\u6821\u6B63",
  "chat.skillTranslate": "\u5168\u6587\u7FFB\u8A33",
  "chat.skillPolishPrompt": "\u73FE\u5728\u306E\u30CE\u30FC\u30C8\u306E\u5168\u6587\u3092\u63A8\u6572\u3057\u3001\u8A00\u8A9E\u8868\u73FE\u3092\u6700\u9069\u5316\u3057\u3066\u3001\u3088\u308A\u6D41\u66A2\u3067\u6B63\u78BA\u3001\u9AD8\u54C1\u8CEA\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u5143\u306E\u610F\u5473\u306F\u5909\u3048\u305A\u3001\u6587\u7AE0\u306E\u8CEA\u3060\u3051\u3092\u5411\u4E0A\u3055\u305B\u3066\u304F\u3060\u3055\u3044\u3002",
  "chat.skillProofreadPrompt": "\u73FE\u5728\u306E\u30CE\u30FC\u30C8\u306E\u5168\u6587\u3092\u6821\u6B63\u3057\u3001\u8AA4\u5B57\u8131\u5B57\u3001\u53E5\u8AAD\u70B9\u306E\u8AA4\u7528\u3001\u6587\u6CD5\u306E\u554F\u984C\u3001\u4E0D\u9069\u5207\u306A\u8868\u73FE\u3092\u30C1\u30A7\u30C3\u30AF\u3057\u3001\u554F\u984C\u70B9\u3068\u4FEE\u6B63\u6848\u3092\u4E00\u3064\u305A\u3064\u30EA\u30B9\u30C8\u30A2\u30C3\u30D7\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "chat.skillTranslateENPrompt": "\u73FE\u5728\u306E\u30CE\u30FC\u30C8\u306E\u5168\u6587\u3092\u82F1\u8A9E\u306B\u7FFB\u8A33\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u5C02\u9580\u7528\u8A9E\u3092\u6B63\u78BA\u306B\u4FDD\u3061\u3001\u81EA\u7136\u3067\u6D41\u66A2\u306A\u6587\u7AE0\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "chat.skillTranslateCNPrompt": "\u73FE\u5728\u306E\u30CE\u30FC\u30C8\u306E\u5168\u6587\u3092\u4E2D\u56FD\u8A9E\u306B\u7FFB\u8A33\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u5C02\u9580\u7528\u8A9E\u3092\u6B63\u78BA\u306B\u4FDD\u3061\u3001\u81EA\u7136\u3067\u6D41\u66A2\u306A\u6587\u7AE0\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
  "chat.notice.openNote": "\u5148\u306B\u30CE\u30FC\u30C8\u3092\u958B\u3044\u3066\u304F\u3060\u3055\u3044",
  "chat.notice.readError": "\u30CE\u30FC\u30C8\u306E\u8AAD\u307F\u53D6\u308A\u306B\u5931\u6557\u3057\u307E\u3057\u305F",
  "chat.notice.newChat": "\u65B0\u3057\u3044\u30C1\u30E3\u30C3\u30C8\u3092\u958B\u59CB\u3057\u307E\u3057\u305F",
  "chat.roleUser": "\u3042\u306A\u305F",
  "chat.roleAssistant": "FleurPilot",
  "chat.avatarUser": "\u79C1",
  "chat.reasoningLabel": "\u601D\u8003\u30D7\u30ED\u30BB\u30B9",
  "chat.thinking": "\u8003\u3048\u4E2D\u2026",
  "chat.contextNoteLabel": "\u73FE\u5728",
  "chat.contextAllLabel": "\u3059\u3079\u3066",
  "chat.contextFolderLabel": "\u30D5\u30A9\u30EB\u30C0",
  // chat history
  "settings.chatHistory": "\u30C1\u30E3\u30C3\u30C8\u5C65\u6B74",
  "settings.enableChatHistory": "\u30C1\u30E3\u30C3\u30C8\u5C65\u6B74\u3092\u81EA\u52D5\u4FDD\u5B58",
  "settings.enableChatHistoryDesc": "\u65B0\u3057\u3044\u30C1\u30E3\u30C3\u30C8\u3092\u958B\u59CB\u3059\u308B\u524D\u306B\u73FE\u5728\u306E\u30C1\u30E3\u30C3\u30C8\u3092\u30CE\u30FC\u30C8\u3068\u3057\u3066\u81EA\u52D5\u4FDD\u5B58",
  "settings.chatHistoryFolder": "\u4FDD\u5B58\u30D5\u30A9\u30EB\u30C0",
  "settings.chatHistoryFolderDesc": "\u30C1\u30E3\u30C3\u30C8\u5C65\u6B74\u3092\u4FDD\u5B58\u3059\u308B\u30D5\u30A9\u30EB\u30C0\u3092\u9078\u629E",
  "chat.actions.saveNote": "\u30CE\u30FC\u30C8\u3068\u3057\u3066\u4FDD\u5B58",
  "chat.actions.copy": "\u30B3\u30D4\u30FC",
  "chat.actions.regenerate": "\u518D\u751F\u6210",
  "chat.notice.copied": "\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F",
  "chat.notice.saved": "\u30C1\u30E3\u30C3\u30C8\u3092\u30CE\u30FC\u30C8\u3068\u3057\u3066\u4FDD\u5B58\u3057\u307E\u3057\u305F",
  "chat.notice.regenerating": "\u518D\u751F\u6210\u4E2D\u2026",
  "chat.notice.noMessages": "\u4FDD\u5B58\u3059\u308B\u30E1\u30C3\u30BB\u30FC\u30B8\u304C\u3042\u308A\u307E\u305B\u3093",
  "inline.title": "\u66F8\u304D\u63DB\u3048",
  "inline.original": "\u539F\u6587",
  "inline.result": "\u7D50\u679C",
  "inline.loading": "\u66F8\u304D\u63DB\u3048\u4E2D...",
  "inline.cancel": "\u30AD\u30E3\u30F3\u30BB\u30EB",
  "inline.apply": "\u9069\u7528",
  "inline.applied": "\u5909\u66F4\u3092\u9069\u7528\u3057\u307E\u3057\u305F",
  "inline.explainPrompt": "\u3053\u306E\u5185\u5BB9\u306E\u610F\u5473\u3092\u3088\u308A\u5206\u304B\u308A\u3084\u3059\u304F\u8AAC\u660E\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A",
  "inline.shortenPrompt": "\u3053\u306E\u30C6\u30AD\u30B9\u30C8\u3092\u77ED\u7E2E\u3057\u3001\u5197\u9577\u306A\u8868\u73FE\u3092\u524A\u9664\u3057\u3066\u6838\u5FC3\u60C5\u5831\u3092\u6B8B\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A",
  "inline.expandPrompt": "\u3053\u306E\u30C6\u30AD\u30B9\u30C8\u3092\u62E1\u5F35\u3057\u3001\u8A73\u7D30\u3068\u80CC\u666F\u60C5\u5831\u3092\u8FFD\u52A0\u3057\u3066\u8C4A\u304B\u306B\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A",
  "inline.polishPrompt": "\u3053\u306E\u30C6\u30AD\u30B9\u30C8\u3092\u63A8\u6572\u3057\u3001\u8868\u73FE\u3092\u6700\u9069\u5316\u3057\u3066\u3088\u308A\u6D41\u66A2\u3067\u30D7\u30ED\u30D5\u30A7\u30C3\u30B7\u30E7\u30CA\u30EB\u306B\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A",
  "inline.translateCNPrompt": "\u3053\u306E\u30C6\u30AD\u30B9\u30C8\u3092\u6D41\u66A2\u306A\u4E2D\u56FD\u8A9E\u306B\u7FFB\u8A33\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A",
  "inline.translateENPrompt": "\u3053\u306E\u30C6\u30AD\u30B9\u30C8\u3092\u6D41\u66A2\u306A\u82F1\u8A9E\u306B\u7FFB\u8A33\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A",
  "inline.proofreadPrompt": "\u3053\u306E\u30C6\u30AD\u30B9\u30C8\u3092\u6821\u6B63\u3057\u3001\u8AA4\u5B57\u8131\u5B57\u3001\u6587\u6CD5\u30A8\u30E9\u30FC\u3001\u53E5\u8AAD\u70B9\u306E\u554F\u984C\u3092\u4FEE\u6B63\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A",
  "assist.review": "\u30EC\u30D3\u30E5\u30FC",
  "assist.suggest": "\u57F7\u7B46\u30A2\u30C9\u30D0\u30A4\u30B9",
  "assist.structure": "\u69CB\u9020\u5206\u6790",
  "assist.tone": "\u30B9\u30BF\u30A4\u30EB\u5206\u6790",
  "assist.summary": "\u8981\u7D04",
  "assist.loading": "\u5206\u6790\u4E2D...",
  "error.noApiKey": "API\u30AD\u30FC\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u8A2D\u5B9A\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044",
  "error.noBaseUrl": "API\u30D9\u30FC\u30B9URL\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093",
  "error.requestCancelled": "\u30EA\u30AF\u30A8\u30B9\u30C8\u304C\u30AD\u30E3\u30F3\u30BB\u30EB\u3055\u308C\u307E\u3057\u305F",
  "plugin.loaded": "FleurPilot \u30D7\u30E9\u30B0\u30A4\u30F3\u304C\u8AAD\u307F\u8FBC\u307E\u308C\u307E\u3057\u305F",
  "plugin.unloaded": "FleurPilot \u30D7\u30E9\u30B0\u30A4\u30F3\u304C\u30A2\u30F3\u30ED\u30FC\u30C9\u3055\u308C\u307E\u3057\u305F"
};
var locales = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "en": en,
  "ja": ja
};

// src/i18n/index.ts
function t(lang, key, fallback) {
  const dict = locales[lang];
  if (dict && dict[key])
    return dict[key];
  if (lang !== "zh-CN" && locales["zh-CN"] && locales["zh-CN"][key]) {
    return locales["zh-CN"][key];
  }
  return fallback ?? key;
}
function getTimeLocale(lang) {
  switch (lang) {
    case "zh-TW":
      return "zh-TW";
    case "en":
      return "en-US";
    case "ja":
      return "ja-JP";
    default:
      return "zh-CN";
  }
}

// src/settings.ts
var MODEL_PRESETS = [
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "qwen", name: "\u901A\u4E49\u5343\u95EE (DashScope)", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { id: "glm", name: "\u667A\u8C31 (GLM)", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { id: "siliconflow", name: "\u7845\u57FA\u6D41\u52A8", baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-72B-Instruct" },
  { id: "custom", name: "\u81EA\u5B9A\u4E49", baseUrl: "", model: "" }
];
var DEFAULT_SETTINGS = {
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "",
  model: "deepseek-chat",
  reasoningModel: "deepseek-reasoner",
  systemPrompt: "\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u7684\u5199\u4F5C\u4F19\u4F34\uFF0C\u719F\u6089\u5404\u7C7B\u6587\u672C\u7684\u68B3\u7406\u3001\u6DA6\u8272\u4E0E\u6269\u5C55\u3002\u8BF7\u57FA\u4E8E\u7528\u6237\u63D0\u4F9B\u7684\u7B14\u8BB0\u5185\u5BB9\uFF0C\u7ED9\u51FA\u6E05\u6670\u3001\u51C6\u786E\u3001\u53EF\u76F4\u63A5\u4F7F\u7528\u7684\u56DE\u590D\uFF0C\u4FDD\u6301\u7B80\u6D01\u3001\u514B\u5236\u3001\u5B9E\u7528\u3002",
  temperature: 0.7,
  maxTokens: 4096,
  enableContext: true,
  enableInlineEdit: true,
  enableQuickCommands: true,
  enableChatHistory: false,
  chatHistoryFolder: "FleurPilot",
  language: "zh-CN"
};
var FleurPilotSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("mb-settings");
    const $ = (key, fb) => t(this.plugin.settings.language, key, fb);
    new import_obsidian2.Setting(containerEl).setName($("settings.modelConfig")).setHeading();
    new import_obsidian2.Setting(containerEl).setName($("settings.provider")).setDesc($("settings.providerDesc")).addDropdown((dropdown) => {
      MODEL_PRESETS.forEach((p) => dropdown.addOption(p.id, p.name));
      dropdown.setValue(this.plugin.settings.provider);
      dropdown.onChange((value) => {
        void (async () => {
          this.plugin.settings.provider = value;
          const preset = MODEL_PRESETS.find((p) => p.id === value);
          if (preset && preset.id !== "custom") {
            this.plugin.settings.baseUrl = preset.baseUrl;
            this.plugin.settings.model = preset.model;
          }
          await this.plugin.saveSettings();
          this.display();
        })();
      });
    });
    new import_obsidian2.Setting(containerEl).setName($("settings.baseUrl")).setDesc($("settings.baseUrlDesc")).addText((text) => text.setPlaceholder($("settings.baseUrlPlaceholder")).setValue(this.plugin.settings.baseUrl).onChange((value) => {
      void (async () => {
        this.plugin.settings.baseUrl = value;
        await this.plugin.saveSettings();
      })();
    }));
    new import_obsidian2.Setting(containerEl).setName($("settings.apiKey")).setDesc($("settings.apiKeyDesc")).addText((text) => {
      text.setPlaceholder($("settings.apiKeyPlaceholder")).setValue(this.plugin.settings.apiKey).onChange((value) => {
        void (async () => {
          this.plugin.settings.apiKey = value;
          await this.plugin.saveSettings();
        })();
      });
      text.inputEl.type = "password";
    });
    new import_obsidian2.Setting(containerEl).setName($("settings.model")).setDesc($("settings.modelDesc")).addText((text) => text.setPlaceholder($("settings.modelPlaceholder")).setValue(this.plugin.settings.model).onChange((value) => {
      void (async () => {
        this.plugin.settings.model = value;
        await this.plugin.saveSettings();
      })();
    }));
    new import_obsidian2.Setting(containerEl).setName($("settings.reasoningModel")).setDesc($("settings.reasoningModelDesc")).addText((text) => text.setPlaceholder($("settings.reasoningModelPlaceholder")).setValue(this.plugin.settings.reasoningModel).onChange((value) => {
      void (async () => {
        this.plugin.settings.reasoningModel = value;
        await this.plugin.saveSettings();
      })();
    }));
    new import_obsidian2.Setting(containerEl).setName($("settings.generationParams")).setHeading();
    new import_obsidian2.Setting(containerEl).setName($("settings.systemPrompt")).setDesc($("settings.systemPromptDesc")).addTextArea((text) => {
      text.setPlaceholder($("settings.systemPromptPlaceholder")).setValue(this.plugin.settings.systemPrompt).onChange((value) => {
        void (async () => {
          this.plugin.settings.systemPrompt = value;
          await this.plugin.saveSettings();
        })();
      });
      text.inputEl.addClass("mb_system-prompt-area");
    });
    new import_obsidian2.Setting(containerEl).setName($("settings.temperature")).setDesc($("settings.temperatureDesc")).addSlider((slider) => slider.setLimits(0, 1, 0.1).setValue(this.plugin.settings.temperature).onChange((value) => {
      void (async () => {
        this.plugin.settings.temperature = value;
        await this.plugin.saveSettings();
      })();
    }));
    new import_obsidian2.Setting(containerEl).setName($("settings.maxTokens")).setDesc($("settings.maxTokensDesc")).addSlider((slider) => slider.setLimits(512, 16384, 512).setValue(this.plugin.settings.maxTokens).onChange((value) => {
      void (async () => {
        this.plugin.settings.maxTokens = value;
        await this.plugin.saveSettings();
      })();
    }));
    new import_obsidian2.Setting(containerEl).setName($("settings.featureSettings")).setHeading();
    new import_obsidian2.Setting(containerEl).setName($("settings.enableContext")).setDesc($("settings.enableContextDesc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.enableContext).onChange((value) => {
      void (async () => {
        this.plugin.settings.enableContext = value;
        await this.plugin.saveSettings();
      })();
    }));
    new import_obsidian2.Setting(containerEl).setName($("settings.enableInlineEdit")).setDesc($("settings.enableInlineEditDesc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.enableInlineEdit).onChange((value) => {
      void (async () => {
        this.plugin.settings.enableInlineEdit = value;
        await this.plugin.saveSettings();
      })();
    }));
    new import_obsidian2.Setting(containerEl).setName($("settings.enableQuickCommands")).setDesc($("settings.enableQuickCommandsDesc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.enableQuickCommands).onChange((value) => {
      void (async () => {
        this.plugin.settings.enableQuickCommands = value;
        await this.plugin.saveSettings();
      })();
    }));
    new import_obsidian2.Setting(containerEl).setName($("settings.chatHistory")).setHeading();
    new import_obsidian2.Setting(containerEl).setName($("settings.enableChatHistory")).setDesc($("settings.enableChatHistoryDesc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.enableChatHistory).onChange((value) => {
      void (async () => {
        this.plugin.settings.enableChatHistory = value;
        await this.plugin.saveSettings();
      })();
    }));
    new import_obsidian2.Setting(containerEl).setName($("settings.chatHistoryFolder")).setDesc($("settings.chatHistoryFolderDesc")).addDropdown((dropdown) => {
      const folders = this.getVaultFolders();
      dropdown.addOption("FleurPilot", "FleurPilot");
      for (const folder of folders) {
        dropdown.addOption(folder.path, folder.path);
      }
      if (!this.plugin.settings.chatHistoryFolder) {
        this.plugin.settings.chatHistoryFolder = "FleurPilot";
      }
      dropdown.setValue(this.plugin.settings.chatHistoryFolder);
      dropdown.onChange((value) => {
        void (async () => {
          this.plugin.settings.chatHistoryFolder = value;
          await this.plugin.saveSettings();
        })();
      });
    });
    new import_obsidian2.Setting(containerEl).setName($("settings.language")).setHeading();
    new import_obsidian2.Setting(containerEl).setName($("settings.language")).setDesc($("settings.languageDesc")).addDropdown((dropdown) => {
      Object.keys(LANG_LABELS).forEach((lang) => {
        dropdown.addOption(lang, LANG_LABELS[lang]);
      });
      dropdown.setValue(this.plugin.settings.language);
      dropdown.onChange((value) => {
        void (async () => {
          this.plugin.settings.language = value;
          await this.plugin.saveSettings();
          this.display();
        })();
      });
    });
    new import_obsidian2.Setting(containerEl).setName($("settings.connectionTest")).setHeading();
    new import_obsidian2.Setting(containerEl).setName($("settings.testConnection")).setDesc($("settings.testConnectionDesc")).addButton((btn) => btn.setButtonText($("settings.testBtn")).setCta().onClick(() => {
      void (async () => {
        btn.setDisabled(true);
        btn.setButtonText($("settings.testing"));
        try {
          const { LLMService: LLMService2 } = await Promise.resolve().then(() => (init_llm_service(), llm_service_exports));
          const llm = new LLMService2(this.plugin.settings);
          let result = "";
          await llm.sendMessage(
            [{ role: "user", content: $("settings.connectionTestPrompt") }],
            (chunk) => {
              result += chunk;
            },
            () => {
            }
          );
          btn.setButtonText(result ? `${$("settings.connected")} \xB7 ${result.slice(0, 20)}` : $("settings.connected"));
        } catch (e) {
          const msg = e instanceof Error ? e.message.slice(0, 30) : "Unknown";
          btn.setButtonText(`${$("settings.connectionFailed")}: ${msg}`);
          btn.buttonEl.classList.add("mod-warning");
        }
        window.setTimeout(() => {
          btn.setButtonText($("settings.testBtn"));
          btn.setDisabled(false);
          btn.buttonEl.classList.remove("mod-warning");
        }, 5e3);
      })();
    }));
  }
  getVaultFolders() {
    const folders = [];
    const root = this.app.vault.getRoot();
    const collect = (folder) => {
      for (const child of folder.children) {
        if (child instanceof import_obsidian2.TFolder) {
          folders.push(child);
          collect(child);
        }
      }
    };
    collect(root);
    return folders;
  }
};

// src/views/chat-view.ts
var import_obsidian3 = require("obsidian");
init_llm_service();
var VIEW_TYPE_CHAT = "fleurpilot-chat-view";
var ChatView = class extends import_obsidian3.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.messages = [];
    this.isStreaming = false;
    this.currentAssistantContent = "";
    // 上下文选择
    this.contextMode = "active";
    this.selectedFolderPath = "";
    // 模式切换
    this.isReasoningMode = false;
    this.currentReasoningContent = "";
    // 事件监听器
    this.activeLeafChangeRef = null;
    this.plugin = plugin;
  }
  /** i18n helper */
  $(key, fb) {
    return t(this.plugin.settings.language, key, fb);
  }
  getViewType() {
    return VIEW_TYPE_CHAT;
  }
  getDisplayText() {
    return this.$("chat.title");
  }
  getIcon() {
    return "pen-tool";
  }
  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("fleurpilot-chat-view");
    this.createToolbar(container);
    this.createMessageArea(container);
    this.createInputArea(container);
    this.createStatusIndicator();
    this.addWelcomeMessage();
    this.activeLeafChangeRef = () => {
      if (this.contextMode === "active") {
        this.updateContextButtonLabel();
      }
    };
    this.app.workspace.on("active-leaf-change", this.activeLeafChangeRef);
  }
  // ── 工具栏 ──
  createToolbar(container) {
    const toolbar = container.createDiv({ cls: "fleurpilot-toolbar" });
    const brand = toolbar.createDiv({ cls: "fleurpilot-brand" });
    (0, import_obsidian3.setIcon)(brand, "pen-tool");
    this.modeButton = toolbar.createEl("button", {
      cls: "fleurpilot-mode-btn",
      attr: { title: this.$("chat.toggleMode") }
    });
    this.updateModeButtonLabel();
    this.modeButton.addEventListener("click", () => {
      this.isReasoningMode = !this.isReasoningMode;
      this.updateModeButtonLabel();
    });
    this.contextButton = toolbar.createEl("button", {
      cls: "fleurpilot-context-btn"
    });
    this.updateContextButtonLabel();
    this.contextButton.addEventListener("click", (e) => this.showContextMenu(e));
    const newBtn = toolbar.createEl("button", {
      cls: "fleurpilot-toolbar-btn",
      attr: { title: this.$("chat.newChat") }
    });
    (0, import_obsidian3.setIcon)(newBtn, "pencil");
    newBtn.addEventListener("click", () => this.startNewChat());
  }
  updateModeButtonLabel() {
    this.modeButton.empty();
    const icon = this.modeButton.createSpan({ cls: "mb-mode-icon" });
    const label = this.modeButton.createSpan({
      cls: "mb-mode-label",
      text: this.isReasoningMode ? this.$("chat.modeDeepThink") : this.$("chat.modeChat")
    });
    (0, import_obsidian3.setIcon)(icon, this.isReasoningMode ? "brain" : "message-square");
  }
  updateContextButtonLabel() {
    this.contextButton.empty();
    const icon = this.contextButton.createSpan({ cls: "mb-ctx-icon" });
    const label = this.contextButton.createSpan({ cls: "mb-ctx-label" });
    const iconMap = {
      active: "file-text",
      all: "book-open",
      folder: "folder",
      none: "x-circle"
    };
    (0, import_obsidian3.setIcon)(icon, iconMap[this.contextMode]);
    const labels = {
      active: this.getActiveFileName(),
      all: this.$("chat.contextAllNotes"),
      folder: this.selectedFolderPath || this.$("chat.contextChooseFolder"),
      none: this.$("chat.contextNone")
    };
    label.setText(labels[this.contextMode]);
    this.contextButton.setAttr("title", labels[this.contextMode]);
  }
  getActiveFileName() {
    const file = this.app.workspace.getActiveFile();
    return file ? file.basename : this.$("chat.contextNoneShort");
  }
  showContextMenu(event) {
    const menu = new import_obsidian3.Menu();
    menu.addItem((item) => {
      item.setTitle(`${this.$("chat.contextCurrentNote")}${this.contextMode === "active" ? "  \u2713" : ""}`).setIcon("file-text").onClick(() => {
        this.contextMode = "active";
        this.updateContextButtonLabel();
      });
    });
    menu.addItem((item) => {
      item.setTitle(`${this.$("chat.contextAllNotes")}${this.contextMode === "all" ? "  \u2713" : ""}`).setIcon("book-open").onClick(() => {
        this.contextMode = "all";
        this.updateContextButtonLabel();
      });
    });
    menu.addSeparator();
    const folders = this.getVaultFolders();
    for (const folder of folders) {
      menu.addItem((item) => {
        item.setTitle(`${folder.path}${this.contextMode === "folder" && this.selectedFolderPath === folder.path ? "  \u2713" : ""}`).setIcon("folder").onClick(() => {
          this.contextMode = "folder";
          this.selectedFolderPath = folder.path;
          this.updateContextButtonLabel();
        });
      });
    }
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle(`${this.$("chat.contextNone")}${this.contextMode === "none" ? "  \u2713" : ""}`).setIcon("x-circle").onClick(() => {
        this.contextMode = "none";
        this.updateContextButtonLabel();
      });
    });
    menu.showAtMouseEvent(event);
  }
  getVaultFolders() {
    const folders = [];
    const root = this.app.vault.getRoot();
    const collect = (folder) => {
      for (const child of folder.children) {
        if (child instanceof import_obsidian3.TFolder) {
          folders.push(child);
          collect(child);
        }
      }
    };
    collect(root);
    return folders;
  }
  // ── 消息区域 ──
  createMessageArea(container) {
    this.messageContainer = container.createDiv({ cls: "fleurpilot-messages" });
  }
  // ── 输入区域 ──
  createInputArea(container) {
    const inputContainer = container.createDiv({ cls: "fleurpilot-input-container" });
    this.inputArea = inputContainer.createEl("textarea", {
      cls: "fleurpilot-input",
      attr: { placeholder: this.$("chat.placeholder"), rows: "3" }
    });
    this.inputArea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    this.sendButton = inputContainer.createEl("button", {
      cls: "fleurpilot-send-btn",
      attr: { title: this.$("chat.send") }
    });
    (0, import_obsidian3.setIcon)(this.sendButton, "send");
    this.sendButton.addEventListener("click", () => this.sendMessage());
  }
  createStatusIndicator() {
    this.statusIndicator = this.containerEl.createDiv({ cls: "fleurpilot-status" });
    this.statusIndicator.addClass("fleurpilot-status-hidden");
  }
  // ── 欢迎消息 ──
  addWelcomeMessage() {
    const welcome = this.messageContainer.createDiv({ cls: "fleurpilot-welcome" });
    const iconDiv = welcome.createDiv({ cls: "fleurpilot-welcome-icon" });
    (0, import_obsidian3.setIcon)(iconDiv, "pen-tool");
    new import_obsidian3.Setting(welcome).setName(this.$("chat.welcomeTitle")).setHeading();
    welcome.createEl("p", { cls: "fleurpilot-welcome-sub", text: this.$("chat.welcomeSub") });
    const skillsRow = welcome.createDiv({ cls: "fleurpilot-skills" });
    const skills = [
      { label: this.$("chat.skillPolish"), prompt: this.$("chat.skillPolishPrompt") },
      { label: this.$("chat.skillProofread"), prompt: this.$("chat.skillProofreadPrompt") }
    ];
    for (const skill of skills) {
      const btn = skillsRow.createEl("button", {
        cls: "fleurpilot-skill-btn",
        text: skill.label
      });
      btn.addEventListener("click", () => this.runSkill(skill.prompt));
    }
    const translateBtn = skillsRow.createEl("button", {
      cls: "fleurpilot-skill-btn",
      text: this.$("chat.skillTranslate")
    });
    translateBtn.addEventListener("click", () => this.runTranslateSkill());
    welcome.createEl("p", { cls: "fleurpilot-welcome-hint", text: this.$("chat.welcomeHint") });
  }
  async runSkill(prompt) {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new import_obsidian3.Notice(this.$("chat.notice.openNote"));
      return;
    }
    this.inputArea.value = prompt;
    this.inputArea.focus();
    this.inputArea.setSelectionRange(prompt.length, prompt.length);
  }
  async runTranslateSkill() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new import_obsidian3.Notice(this.$("chat.notice.openNote"));
      return;
    }
    let content = "";
    try {
      content = await this.app.vault.read(file);
    } catch {
      new import_obsidian3.Notice(this.$("chat.notice.readError"));
      return;
    }
    let chineseCount = 0;
    for (const ch of content) {
      const code = ch.charCodeAt(0);
      if (code >= 19968 && code <= 40959)
        chineseCount++;
    }
    const totalChars = content.replace(/\s/g, "").length || 1;
    const cnRatio = chineseCount / totalChars;
    const prompt = cnRatio > 0.3 ? this.$("chat.skillTranslateENPrompt") : this.$("chat.skillTranslateCNPrompt");
    this.inputArea.value = prompt;
    this.inputArea.focus();
    this.inputArea.setSelectionRange(prompt.length, prompt.length);
  }
  askAboutSelection(text) {
    if (this.isStreaming)
      return;
    this.inputArea.value = text;
    this.sendMessage();
  }
  async sendMessage() {
    const content = this.inputArea.value.trim();
    if (!content || this.isStreaming)
      return;
    this.inputArea.value = "";
    this.addMessage("user", content);
    const contextMessages = await this.buildContextMessages(content);
    const assistantMsgEl = this.addMessage("assistant", "", true, this.isReasoningMode);
    this.isStreaming = true;
    this.currentAssistantContent = "";
    this.currentReasoningContent = "";
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
            role: "assistant",
            content: this.currentAssistantContent,
            timestamp: Date.now()
          });
          this.isStreaming = false;
          this.updateUIState();
          const lastAssistant = this.messageContainer.querySelector(".fleurpilot-assistant:last-of-type");
          if (lastAssistant) {
            this.addMessageActions(lastAssistant);
          }
        },
        this.isReasoningMode ? (reasoningChunk) => {
          this.currentReasoningContent += reasoningChunk;
          this.updateStreamingMessage(assistantMsgEl, this.currentAssistantContent, this.currentReasoningContent);
        } : void 0
      );
    } catch (error) {
      this.isStreaming = false;
      this.updateUIState();
      assistantMsgEl.remove();
      const msg = error instanceof Error ? error.message : "Unknown error";
      new import_obsidian3.Notice(`\u9519\u8BEF: ${msg}`);
    }
  }
  async buildContextMessages(userContent) {
    if (!this.plugin.settings.enableContext || this.contextMode === "none") {
      return [{ role: "user", content: userContent }];
    }
    const messages = [];
    if (this.plugin.settings.systemPrompt) {
      messages.push({ role: "system", content: this.plugin.settings.systemPrompt });
    }
    let contextText = "";
    if (this.contextMode === "active") {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile && activeFile.extension === "md") {
        try {
          const content = await this.app.vault.read(activeFile);
          contextText = `\u3010\u5F53\u524D\u7B14\u8BB0: ${activeFile.basename}\u3011
${content}`;
        } catch {
        }
      }
    } else if (this.contextMode === "all") {
      const files = this.app.vault.getMarkdownFiles();
      const parts = [];
      for (const file of files.slice(0, 10)) {
        try {
          const content = await this.app.vault.read(file);
          parts.push(`\u3010${file.basename}\u3011
${content.slice(0, 2e3)}`);
        } catch {
        }
      }
      contextText = `\u3010\u5168\u90E8\u7B14\u8BB0\uFF08\u5171 ${files.length} \u7BC7\uFF09\u3011

${parts.join("\n\n---\n\n")}`;
    } else if (this.contextMode === "folder" && this.selectedFolderPath) {
      const files = this.app.vault.getMarkdownFiles().filter(
        (f) => f.path.startsWith(this.selectedFolderPath + "/")
      );
      const parts = [];
      for (const file of files.slice(0, 10)) {
        try {
          const content = await this.app.vault.read(file);
          parts.push(`\u3010${file.basename}\u3011
${content.slice(0, 2e3)}`);
        } catch {
        }
      }
      contextText = `\u3010\u6587\u4EF6\u5939: ${this.selectedFolderPath}\uFF08\u5171 ${files.length} \u7BC7\uFF09\u3011

${parts.join("\n\n---\n\n")}`;
    }
    if (contextText) {
      messages.push({
        role: "user",
        content: `\u4EE5\u4E0B\u662F\u53C2\u8003\u4E0A\u4E0B\u6587\uFF0C\u8BF7\u57FA\u4E8E\u5B83\u56DE\u7B54\u6211\u7684\u95EE\u9898\uFF1A

${contextText}

---

\u6211\u7684\u95EE\u9898\uFF1A${userContent}`
      });
    } else {
      messages.push({ role: "user", content: userContent });
    }
    return messages;
  }
  addMessage(role, content, isStreaming = false, hasReasoning = false) {
    const welcome = this.messageContainer.querySelector(".fleurpilot-welcome");
    if (welcome)
      welcome.remove();
    const messageEl = this.messageContainer.createDiv({
      cls: `fleurpilot-message fleurpilot-${role}`
    });
    const avatar = messageEl.createDiv({ cls: "fleurpilot-avatar" });
    if (role === "user") {
      avatar.setText(this.$("chat.avatarUser"));
    } else {
      (0, import_obsidian3.setIcon)(avatar, "pen-tool");
    }
    const body = messageEl.createDiv({ cls: "fleurpilot-message-body" });
    const header = body.createDiv({ cls: "fleurpilot-message-header" });
    header.createSpan({ cls: "fleurpilot-message-role", text: role === "user" ? this.$("chat.roleUser") : this.$("chat.roleAssistant") });
    header.createSpan({
      cls: "fleurpilot-message-time",
      text: (/* @__PURE__ */ new Date()).toLocaleTimeString(getTimeLocale(this.plugin.settings.language), { hour: "2-digit", minute: "2-digit" })
    });
    if (role === "assistant" && hasReasoning) {
      const reasoningSection = body.createDiv({ cls: "mb-reasoning" });
      const toggle = reasoningSection.createDiv({ cls: "mb-reasoning-toggle" });
      const toggleIcon = toggle.createSpan({ cls: "mb-reasoning-toggle-icon", text: "" });
      toggle.createSpan({ cls: "mb-reasoning-toggle-label", text: this.$("chat.reasoningLabel") });
      const reasoningBody = reasoningSection.createDiv({ cls: "mb-reasoning-body" });
      reasoningBody.createDiv({ cls: "mb-reasoning-content" });
      toggle.addEventListener("click", () => {
        const isHidden = reasoningBody.hasClass("mb-reasoning-hidden");
        reasoningBody.toggleClass("mb-reasoning-hidden", !isHidden);
        toggleIcon.setText(isHidden ? "\u25BE" : "\u25B8");
      });
    }
    const contentEl = body.createDiv({ cls: "fleurpilot-message-content" });
    if (content) {
      void this.renderMarkdown(contentEl, content);
    } else if (isStreaming) {
      contentEl.createSpan({ cls: "fleurpilot-streaming", text: "\u2026" });
    }
    if (role === "user") {
      this.messages.push({ role, content, timestamp: Date.now() });
    }
    this.scrollToBottom();
    return contentEl;
  }
  updateStreamingMessage(contentEl, content, reasoningContent) {
    contentEl.empty();
    void this.renderMarkdown(contentEl, content);
    if (reasoningContent !== void 0) {
      const reasoningEl = contentEl.closest(".fleurpilot-message-body")?.querySelector(".mb-reasoning-body");
      if (reasoningEl) {
        reasoningEl.removeClass("mb-reasoning-hidden");
        const rc = reasoningEl.querySelector(".mb-reasoning-content");
        if (rc) {
          rc.empty();
          const comp = new import_obsidian3.Component();
          comp.load();
          import_obsidian3.MarkdownRenderer.render(
            this.app,
            reasoningContent,
            rc,
            this.app.workspace.getActiveFile()?.path ?? "",
            comp
          );
          comp.unload();
        }
      }
    }
  }
  async renderMarkdown(container, content) {
    const component = new import_obsidian3.Component();
    component.load();
    await import_obsidian3.MarkdownRenderer.render(
      this.app,
      content,
      container,
      this.app.workspace.getActiveFile()?.path ?? "",
      component
    );
    component.unload();
  }
  // ── 消息操作按钮 ──
  addMessageActions(messageEl) {
    const body = messageEl.querySelector(".fleurpilot-message-body");
    if (!body)
      return;
    if (body.querySelector(".fleurpilot-message-actions"))
      return;
    const actionsRow = body.createDiv({ cls: "fleurpilot-message-actions" });
    const saveBtn = actionsRow.createEl("button", {
      cls: "fleurpilot-action-btn",
      attr: { "aria-label": this.$("chat.actions.saveNote") }
    });
    (0, import_obsidian3.setIcon)(saveBtn, "file-plus");
    saveBtn.addEventListener("click", () => {
      void this.saveConversationAsNote();
    });
    const copyBtn = actionsRow.createEl("button", {
      cls: "fleurpilot-action-btn",
      attr: { "aria-label": this.$("chat.actions.copy") }
    });
    (0, import_obsidian3.setIcon)(copyBtn, "copy");
    copyBtn.addEventListener("click", () => {
      void this.copyLastAssistantMessage();
    });
    const regenerateBtn = actionsRow.createEl("button", {
      cls: "fleurpilot-action-btn",
      attr: { "aria-label": this.$("chat.actions.regenerate") }
    });
    (0, import_obsidian3.setIcon)(regenerateBtn, "refresh-cw");
    regenerateBtn.addEventListener("click", () => {
      void this.regenerateLastMessage();
    });
  }
  async saveConversationAsNote() {
    if (this.messages.length === 0) {
      new import_obsidian3.Notice(this.$("chat.notice.noMessages"));
      return;
    }
    const folderPath = this.plugin.settings.chatHistoryFolder || "FleurPilot";
    const now = /* @__PURE__ */ new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const firstUser = this.messages.find((m) => m.role === "user");
    const title = firstUser ? `${firstUser.content.slice(0, 30).replace(/[\\/:*?"<>|]/g, "").trim()} ${timestamp}` : `Chat ${timestamp}`;
    const timeLocale = getTimeLocale(this.plugin.settings.language);
    const toTime = (ts) => new Date(ts).toLocaleTimeString(timeLocale, { hour: "2-digit", minute: "2-digit" });
    let content = `# ${title}

`;
    for (const msg of this.messages) {
      const role = msg.role === "user" ? this.$("chat.roleUser") : this.$("chat.roleAssistant");
      content += `## ${role} (${toTime(msg.timestamp)})

${msg.content}

---

`;
    }
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      try {
        await this.app.vault.createFolder(folderPath);
      } catch {
      }
    }
    let filePath = `${folderPath}/${title}.md`;
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(filePath)) {
      filePath = `${folderPath}/${title} (${counter}).md`;
      counter++;
    }
    await this.app.vault.create(filePath, content);
    new import_obsidian3.Notice(this.$("chat.notice.saved"));
  }
  async copyLastAssistantMessage() {
    const lastAssistant = this.findLastMessageByRole("assistant");
    if (!lastAssistant)
      return;
    try {
      await navigator.clipboard.writeText(lastAssistant.content);
      new import_obsidian3.Notice(this.$("chat.notice.copied"));
    } catch {
      new import_obsidian3.Notice("Failed to copy");
    }
  }
  async regenerateLastMessage() {
    const lastUser = this.findLastMessageByRole("user");
    if (!lastUser)
      return;
    const lastAssistantIdx = this.messages.findIndex((m) => m.role === "assistant");
    if (lastAssistantIdx !== -1) {
      this.messages.splice(lastAssistantIdx, 1);
    }
    const assistantElements = this.messageContainer.querySelectorAll(".fleurpilot-assistant");
    if (assistantElements.length > 0) {
      assistantElements[assistantElements.length - 1].remove();
    }
    const userElements = this.messageContainer.querySelectorAll(".fleurpilot-user");
    if (userElements.length > 0) {
      userElements[userElements.length - 1].remove();
    }
    const lastUserIdx = this.messages.findIndex((m) => m.role === "user" && m.timestamp === lastUser.timestamp);
    if (lastUserIdx !== -1) {
      this.messages.splice(lastUserIdx, 1);
    }
    new import_obsidian3.Notice(this.$("chat.notice.regenerating"));
    this.inputArea.value = lastUser.content;
    this.sendMessage();
  }
  findLastMessageByRole(role) {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === role)
        return this.messages[i];
    }
    return null;
  }
  startNewChat() {
    if (this.plugin.settings.enableChatHistory && this.messages.length > 0) {
      void this.saveConversationAsNote();
    }
    this.messages = [];
    this.messageContainer.empty();
    this.addWelcomeMessage();
    new import_obsidian3.Notice(this.$("chat.notice.newChat"));
  }
  updateUIState() {
    if (this.isStreaming) {
      this.sendButton.addClass("streaming");
      this.sendButton.disabled = true;
      this.statusIndicator.removeClass("fleurpilot-status-hidden");
      this.statusIndicator.setText(this.$("chat.thinking"));
    } else {
      this.sendButton.removeClass("streaming");
      this.sendButton.disabled = false;
      this.statusIndicator.addClass("fleurpilot-status-hidden");
    }
  }
  scrollToBottom() {
    const el = this.messageContainer;
    const threshold = 60;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom <= threshold) {
      el.scrollTop = el.scrollHeight;
    }
  }
  async onClose() {
    if (this.activeLeafChangeRef) {
      this.app.workspace.off("active-leaf-change", this.activeLeafChangeRef);
      this.activeLeafChangeRef = null;
    }
  }
};

// src/modals/inline-edit.ts
var import_obsidian4 = require("obsidian");
init_llm_service();

// src/utils/diff.ts
function tokenize(text) {
  return text.split(/(\s+|[，。！？、；：""''（）【】《》-])/g).filter(Boolean);
}
function wordDiff(oldText, newText) {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);
  const result = [];
  let i = 0, j = 0;
  while (i < oldTokens.length || j < newTokens.length) {
    if (i < oldTokens.length && j < newTokens.length && oldTokens[i] === newTokens[j]) {
      result.push({ type: "keep", text: oldTokens[i] });
      i++;
      j++;
    } else if (i < oldTokens.length && j < newTokens.length) {
      let found = false;
      for (let k = 1; k < 5 && i + k < oldTokens.length; k++) {
        if (j < newTokens.length && oldTokens[i + k] === newTokens[j]) {
          for (let m = 0; m < k; m++) {
            result.push({ type: "remove", text: oldTokens[i + m] });
          }
          i += k;
          found = true;
          break;
        }
      }
      if (!found) {
        for (let k = 1; k < 5 && j + k < newTokens.length; k++) {
          if (i < oldTokens.length && oldTokens[i] === newTokens[j + k]) {
            for (let m = 0; m < k; m++) {
              result.push({ type: "add", text: newTokens[j + m] });
            }
            j += k;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        if (i < oldTokens.length) {
          result.push({ type: "remove", text: oldTokens[i] });
          i++;
        }
        if (j < newTokens.length) {
          result.push({ type: "add", text: newTokens[j] });
          j++;
        }
      }
    } else if (i < oldTokens.length) {
      result.push({ type: "remove", text: oldTokens[i] });
      i++;
    } else if (j < newTokens.length) {
      result.push({ type: "add", text: newTokens[j] });
      j++;
    }
  }
  return result;
}
function mergeDiffParts(parts) {
  if (parts.length === 0)
    return [];
  const merged = [parts[0]];
  for (let i = 1; i < parts.length; i++) {
    const last = merged[merged.length - 1];
    if (last.type === parts[i].type) {
      last.text += parts[i].text;
    } else {
      merged.push({ ...parts[i] });
    }
  }
  return merged;
}
function renderDiffInto(container, diff) {
  container.empty();
  for (const part of diff) {
    const cls = part.type === "add" ? "mb-diff-add" : part.type === "remove" ? "mb-diff-remove" : "mb-diff-keep";
    container.createSpan({ cls, text: part.text });
  }
}

// src/modals/inline-edit.ts
var ACTION_PROMPTS = {
  explain: "\u8BF7\u89E3\u91CA\u8FD9\u6BB5\u5185\u5BB9\u7684\u542B\u4E49\uFF0C\u7528\u66F4\u901A\u4FD7\u6613\u61C2\u7684\u65B9\u5F0F\u8868\u8FBE\uFF1A",
  simplify: "\u8BF7\u7CBE\u7B80\u8FD9\u6BB5\u6587\u5B57\uFF0C\u53BB\u9664\u5197\u4F59\u8868\u8FBE\uFF0C\u4FDD\u7559\u6838\u5FC3\u4FE1\u606F\uFF1A",
  expand: "\u8BF7\u6269\u5199\u8FD9\u6BB5\u6587\u5B57\uFF0C\u589E\u52A0\u7EC6\u8282\u548C\u80CC\u666F\u4FE1\u606F\uFF0C\u4F7F\u5176\u66F4\u52A0\u4E30\u5BCC\uFF1A",
  polish: "\u8BF7\u6DA6\u8272\u8FD9\u6BB5\u6587\u5B57\uFF0C\u4F18\u5316\u8868\u8FBE\uFF0C\u4F7F\u5176\u66F4\u52A0\u6D41\u7545\u4E13\u4E1A\uFF1A",
  translate_zh: "\u8BF7\u5C06\u8FD9\u6BB5\u6587\u5B57\u7FFB\u8BD1\u4E3A\u6D41\u7545\u7684\u4E2D\u6587\uFF1A",
  translate_en: "Please translate this text into fluent English:",
  proofread: "\u8BF7\u5BA1\u8BFB\u6821\u5BF9\u8FD9\u6BB5\u6587\u5B57\uFF0C\u4FEE\u6B63\u9519\u522B\u5B57\u3001\u8BED\u6CD5\u9519\u8BEF\u548C\u6807\u70B9\u95EE\u9898\uFF1A",
  custom: ""
};
var InlineEditModal = class extends import_obsidian4.Modal {
  constructor(app, plugin, selectedText, action, customInstruction, onApply) {
    super(app);
    this.result = null;
    this.plugin = plugin;
    this.selectedText = selectedText;
    this.action = action;
    this.customInstruction = customInstruction;
    this.onApply = onApply;
  }
  $(key, fb) {
    return t(this.plugin.settings.language, key, fb);
  }
  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("mb-inline-edit-modal");
    new import_obsidian4.Setting(contentEl).setName(this.$("inline.title")).setHeading();
    const originalEl = contentEl.createDiv({ cls: "mb-original-section" });
    originalEl.createDiv({ text: this.$("inline.original"), cls: "mb-section-label" });
    originalEl.createEl("pre", { text: this.selectedText, cls: "mb-original-text" });
    const resultEl = contentEl.createDiv({ cls: "mb-result-section" });
    resultEl.createDiv({ text: this.$("inline.result"), cls: "mb-section-label" });
    this.loadingEl = resultEl.createDiv({ cls: "mb-loading" });
    this.loadingEl.setText(this.$("inline.loading"));
    this.previewEl = resultEl.createDiv({ cls: "mb-preview" });
    this.previewEl.addClass("mb-preview-hidden");
    const prompt = this.buildPrompt();
    const messages = [
      { role: "user", content: prompt }
    ];
    const llm = new LLMService(this.plugin.settings);
    let fullResponse = "";
    try {
      await llm.sendMessage(
        messages,
        (chunk) => {
          fullResponse += chunk;
          this.previewEl.removeClass("mb-preview-hidden");
          this.previewEl.setText(fullResponse);
          this.loadingEl.addClass("mb-loading-hidden");
        },
        () => {
          this.result = fullResponse;
          this.showDiffView();
        }
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      this.loadingEl.setText(`\u9519\u8BEF: ${msg}`);
      this.loadingEl.addClass("mb-error");
    }
  }
  buildPrompt() {
    if (this.action === "custom" && this.customInstruction) {
      return `\u8BF7\u6309\u7167\u4EE5\u4E0B\u8981\u6C42\u4FEE\u6539\u8FD9\u6BB5\u6587\u5B57\uFF1A

\u8981\u6C42\uFF1A${this.customInstruction}

\u539F\u6587\uFF1A
${this.selectedText}

\u8BF7\u76F4\u63A5\u8F93\u51FA\u4FEE\u6539\u540E\u7684\u6587\u5B57\uFF0C\u4E0D\u8981\u6DFB\u52A0\u4EFB\u4F55\u89E3\u91CA\u3002`;
    }
    const actionPrompt = ACTION_PROMPTS[this.action];
    return `${actionPrompt}

${this.selectedText}

\u8BF7\u76F4\u63A5\u8F93\u51FA\u4FEE\u6539\u540E\u7684\u6587\u5B57\uFF0C\u4E0D\u8981\u6DFB\u52A0\u4EFB\u4F55\u89E3\u91CA\u3002`;
  }
  showDiffView() {
    if (!this.result)
      return;
    this.previewEl.empty();
    this.previewEl.addClass("mb-diff-view");
    this.previewEl.removeClass("mb-preview-hidden");
    const diff = wordDiff(this.selectedText, this.result);
    const merged = mergeDiffParts(diff);
    renderDiffInto(this.previewEl, merged);
    const btnContainer = this.contentEl.createDiv({ cls: "mb-button-container" });
    const cancelBtn = btnContainer.createEl("button", { text: this.$("inline.cancel"), cls: "mb-btn mb-btn-cancel" });
    cancelBtn.addEventListener("click", () => this.close());
    const applyBtn = btnContainer.createEl("button", { text: this.$("inline.apply"), cls: "mb-btn mb-btn-apply" });
    applyBtn.addEventListener("click", () => {
      if (this.result) {
        this.onApply(this.result);
        new import_obsidian4.Notice(this.$("inline.applied"));
        this.close();
      }
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/modals/writing-assistant.ts
var import_obsidian5 = require("obsidian");
init_llm_service();
var TASK_PROMPTS = {
  review: `\u4F60\u662F\u4E00\u4F4D\u8D44\u6DF1\u7F16\u8F91\uFF0C\u8BF7\u5BA1\u8BFB\u4EE5\u4E0B\u6587\u7AE0\uFF0C\u6307\u51FA\uFF1A
1. \u9519\u522B\u5B57\u548C\u8BED\u6CD5\u9519\u8BEF
2. \u6807\u70B9\u7B26\u53F7\u4F7F\u7528\u4E0D\u5F53
3. \u884C\u6587\u4E0D\u901A\u987A\u7684\u5730\u65B9
4. \u903B\u8F91\u77DB\u76FE\u6216\u8868\u8FBE\u4E0D\u6E05

\u8BF7\u4EE5\u6E05\u5355\u5F62\u5F0F\u5217\u51FA\u95EE\u9898\uFF0C\u5E76\u7ED9\u51FA\u4FEE\u6539\u5EFA\u8BAE\u3002`,
  suggest: `\u4F60\u662F\u4E00\u4F4D\u5199\u4F5C\u6559\u7EC3\uFF0C\u8BF7\u9605\u8BFB\u4EE5\u4E0B\u6587\u7AE0\uFF0C\u4ECE\u4EE5\u4E0B\u89D2\u5EA6\u7ED9\u51FA\u6539\u8FDB\u5EFA\u8BAE\uFF1A
1. \u8BBA\u70B9\u662F\u5426\u6E05\u6670\u6709\u529B
2. \u8BBA\u636E\u662F\u5426\u5145\u5206
3. \u7ED3\u6784\u662F\u5426\u5408\u7406
4. \u8BED\u8A00\u8868\u8FBE\u662F\u5426\u7CBE\u51C6
5. \u8BFB\u8005\u4F53\u9A8C\u5982\u4F55

\u8BF7\u7ED9\u51FA\u5177\u4F53\u7684\u3001\u53EF\u64CD\u4F5C\u7684\u5EFA\u8BAE\u3002`,
  structure: `\u4F60\u662F\u4E00\u4F4D\u6587\u7AE0\u7ED3\u6784\u5206\u6790\u5E08\uFF0C\u8BF7\u5206\u6790\u4EE5\u4E0B\u6587\u7AE0\u7684\u7ED3\u6784\uFF1A
1. \u6BB5\u843D\u4E4B\u95F4\u7684\u903B\u8F91\u5173\u7CFB
2. \u662F\u5426\u6709\u6E05\u6670\u7684\u5F00\u5934\u3001\u4E3B\u4F53\u3001\u7ED3\u5C3E
3. \u5404\u90E8\u5206\u6BD4\u4F8B\u662F\u5426\u534F\u8C03
4. \u662F\u5426\u5B58\u5728\u5197\u4F59\u6216\u7F3A\u5931

\u8BF7\u753B\u51FA\u7ED3\u6784\u56FE\u5E76\u7ED9\u51FA\u4F18\u5316\u5EFA\u8BAE\u3002`,
  tone: `\u4F60\u662F\u4E00\u4F4D\u8BED\u8A00\u98CE\u683C\u4E13\u5BB6\uFF0C\u8BF7\u5206\u6790\u4EE5\u4E0B\u6587\u7AE0\u7684\u8BED\u8A00\u98CE\u683C\uFF1A
1. \u6574\u4F53\u8BED\u6C14\uFF08\u6B63\u5F0F/\u975E\u6B63\u5F0F/\u5B66\u672F/\u53E3\u8BED\u5316\uFF09
2. \u7528\u8BCD\u7279\u70B9
3. \u53E5\u5F0F\u53D8\u5316
4. \u4E0E\u76EE\u6807\u8BFB\u8005\u662F\u5426\u5339\u914D

\u8BF7\u7ED9\u51FA\u98CE\u683C\u8BC4\u4EF7\u548C\u8C03\u6574\u5EFA\u8BAE\u3002`,
  summary: `\u8BF7\u4E3A\u4EE5\u4E0B\u6587\u7AE0\u751F\u6210\u4E00\u4EFD\u7ED3\u6784\u5316\u6458\u8981\uFF1A
1. \u6838\u5FC3\u89C2\u70B9\uFF08\u4E00\u53E5\u8BDD\uFF09
2. \u4E3B\u8981\u5185\u5BB9\uFF083-5 \u4E2A\u8981\u70B9\uFF09
3. \u7ED3\u8BBA/\u542F\u793A

\u8BF7\u7B80\u6D01\u7CBE\u70BC\u3002`
};
var WritingAssistantModal = class extends import_obsidian5.Modal {
  constructor(app, plugin, noteContent, noteTitle, task) {
    super(app);
    this.plugin = plugin;
    this.noteContent = noteContent;
    this.noteTitle = noteTitle;
    this.task = task;
  }
  $(key, fb) {
    return t(this.plugin.settings.language, key, fb);
  }
  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("mb-writing-assistant-modal");
    const titleMap = {
      review: this.$("assist.review"),
      suggest: this.$("assist.suggest"),
      structure: this.$("assist.structure"),
      tone: this.$("assist.tone"),
      summary: this.$("assist.summary")
    };
    const setting = new import_obsidian5.Setting(contentEl).setName(titleMap[this.task]).setHeading();
    setting.settingEl.addClass("mb-modal-title");
    const infoEl = contentEl.createDiv({ cls: "mb-note-info" });
    infoEl.createEl("div", { text: this.noteTitle, cls: "mb-note-title" });
    const resultContainer = contentEl.createDiv({ cls: "mb-result-container" });
    this.loadingEl = resultContainer.createDiv({ cls: "mb-loading" });
    this.loadingEl.setText(this.$("assist.loading"));
    this.resultEl = resultContainer.createDiv({ cls: "mb-result-content mb-result-hidden" });
    const systemPrompt = TASK_PROMPTS[this.task];
    const userPrompt = `\u6587\u7AE0\u6807\u9898\uFF1A${this.noteTitle}

\u6587\u7AE0\u5185\u5BB9\uFF1A
${this.noteContent}`;
    const messages = [
      { role: "user", content: userPrompt }
    ];
    const llm = new LLMService(this.plugin.settings);
    let fullResponse = "";
    try {
      const originalPrompt = this.plugin.settings.systemPrompt;
      this.plugin.settings.systemPrompt = systemPrompt;
      await llm.sendMessage(
        messages,
        (chunk) => {
          fullResponse += chunk;
          this.resultEl.removeClass("mb-result-hidden");
          this.renderMarkdown(this.resultEl, fullResponse);
          this.loadingEl.addClass("mb-loading-hidden");
        },
        () => {
          this.plugin.settings.systemPrompt = originalPrompt;
        }
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      this.loadingEl.setText(`\u9519\u8BEF: ${msg}`);
      this.loadingEl.addClass("mb-error");
    }
  }
  renderMarkdown(container, content) {
    container.empty();
    const lines = content.split("\n");
    let currentP = null;
    let inList = false;
    let inCode = false;
    let codeContent = "";
    lines.forEach((line) => {
      if (line.startsWith("```")) {
        if (!inCode) {
          inCode = true;
          codeContent = "";
        } else {
          inCode = false;
          const pre = container.createEl("pre");
          pre.createEl("code", { text: codeContent });
        }
        return;
      }
      if (inCode) {
        codeContent += (codeContent ? "\n" : "") + line;
        return;
      }
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        currentP = null;
        const level = headingMatch[1].length;
        container.createEl(`h${level}`, { text: headingMatch[2] });
        return;
      }
      const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
      if (listMatch) {
        if (!inList) {
          inList = true;
        }
        const ul = container.querySelector("ul:last-child") || container.createEl("ul");
        ul.createEl("li", { text: listMatch[1] });
        currentP = null;
        return;
      } else {
        inList = false;
      }
      if (line.trim() === "") {
        currentP = null;
        return;
      }
      if (!currentP) {
        currentP = container.createEl("p");
      } else {
        currentP.createEl("br");
      }
      currentP.appendText(line);
    });
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};

// src/main.ts
var CustomInputModal = class extends import_obsidian6.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    new import_obsidian6.Setting(contentEl).setName("\u81EA\u5B9A\u4E49\u6307\u4EE4").setHeading();
    this.inputEl = contentEl.createEl("input", { type: "text", cls: "mb-custom-input" });
    const btn = contentEl.createEl("button", { text: "\u786E\u8BA4" });
    btn.addEventListener("click", () => {
      this.onSubmit(this.inputEl.value);
      this.close();
    });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.onSubmit(this.inputEl.value);
        this.close();
      }
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var FleurPilotPlugin = class extends import_obsidian6.Plugin {
  constructor() {
    super(...arguments);
    /** i18n helper */
    this.$ = (key, fb) => t(this.settings.language, key, fb);
  }
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));
    this.addRibbonIcon("pen-tool", this.$("chat.title"), () => this.activateChatView());
    this.addCommand({
      id: "open-chat",
      name: this.$("command.openChat"),
      callback: () => {
        void this.activateChatView();
      }
    });
    this.addCommand({
      id: "new-chat",
      name: this.$("command.newChat"),
      callback: () => {
        void this.activateChatView(true);
      }
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const selected = editor.getSelection();
        if (!selected)
          return;
        menu.addSeparator();
        menu.addItem((item) => {
          item.setTitle(this.$("chat.title")).setIcon("feather");
          const submenu = item.setSubmenu();
          submenu.addItem((sub) => {
            sub.setTitle(this.$("menu.askAI")).onClick(() => {
              this.activateChatView();
              window.setTimeout(() => {
                const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];
                if (leaf) {
                  leaf.view.askAboutSelection(selected);
                }
              }, 300);
            });
          });
          submenu.addItem((sub) => {
            sub.setTitle(this.$("menu.detailExplain")).onClick(() => {
              this.activateChatView();
              window.setTimeout(() => {
                const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];
                if (leaf) {
                  leaf.view.askAboutSelection(
                    `\u8BF7\u8BE6\u7EC6\u89E3\u91CA\u4EE5\u4E0B\u6587\u672C\u7684\u542B\u4E49\u3001\u80CC\u666F\u548C\u5173\u952E\u6982\u5FF5\uFF1A

"${selected}"`
                  );
                }
              }, 300);
            });
          });
          submenu.addSeparator();
          const editActions = [
            { id: "polish", label: this.$("menu.polish") },
            { id: "simplify", label: this.$("menu.shorten") },
            { id: "expand", label: this.$("menu.expand") },
            { id: "translate_zh", label: this.$("menu.translateCN") },
            { id: "translate_en", label: this.$("menu.translateEN") },
            { id: "proofread", label: this.$("menu.proofread") }
          ];
          for (const act of editActions) {
            submenu.addItem((sub) => {
              sub.setTitle(act.label).onClick(() => {
                new InlineEditModal(
                  this.app,
                  this,
                  selected,
                  act.id,
                  "",
                  (result) => editor.replaceSelection(result)
                ).open();
              });
            });
          }
          submenu.addSeparator();
          submenu.addItem((sub) => {
            sub.setTitle(this.$("menu.custom")).onClick(() => {
              new CustomInputModal(this.app, (instruction) => {
                if (!instruction)
                  return;
                new InlineEditModal(
                  this.app,
                  this,
                  selected,
                  "custom",
                  instruction,
                  (result) => editor.replaceSelection(result)
                ).open();
              }).open();
            });
          });
        });
      })
    );
    this.registerInlineEditCommand("explain", this.$("command.explain"));
    this.registerInlineEditCommand("simplify", this.$("command.shorten"));
    this.registerInlineEditCommand("expand", this.$("command.expand"));
    this.registerInlineEditCommand("polish", this.$("command.polish"));
    this.registerInlineEditCommand("translate_zh", this.$("command.translateCN"));
    this.registerInlineEditCommand("translate_en", this.$("command.translateEN"));
    this.registerInlineEditCommand("proofread", this.$("command.proofread"));
    this.registerWritingCommand("review", this.$("command.reviewNote"));
    this.registerWritingCommand("suggest", this.$("command.writingAdvice"));
    this.registerWritingCommand("structure", this.$("command.analyzeStructure"));
    this.registerWritingCommand("tone", this.$("command.analyzeTone"));
    this.registerWritingCommand("summary", this.$("command.generateSummary"));
    this.addCommand({
      id: "custom-rewrite",
      name: this.$("command.customRewrite"),
      editorCallback: (editor) => {
        const selectedText = editor.getSelection();
        if (!selectedText) {
          new import_obsidian6.Notice(this.$("notice.selectText"));
          return;
        }
        new CustomInputModal(this.app, (instruction) => {
          if (!instruction)
            return;
          new InlineEditModal(
            this.app,
            this,
            selectedText,
            "custom",
            instruction,
            (result) => editor.replaceSelection(result)
          ).open();
        }).open();
      }
    });
    this.addSettingTab(new FleurPilotSettingTab(this.app, this));
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async activateChatView(newChat = false) {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CHAT)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
        leaf = rightLeaf;
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
      if (newChat) {
        leaf.view.startNewChat();
      }
    }
  }
  registerInlineEditCommand(action, name) {
    this.addCommand({
      id: `inline-edit-${action}`,
      name,
      editorCallback: (editor) => {
        const selectedText = editor.getSelection();
        if (!selectedText) {
          new import_obsidian6.Notice(this.$("notice.selectText"));
          return;
        }
        new InlineEditModal(
          this.app,
          this,
          selectedText,
          action,
          "",
          (result) => editor.replaceSelection(result)
        ).open();
      }
    });
  }
  registerWritingCommand(task, name) {
    this.addCommand({
      id: `writing-${task}`,
      name,
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md")
          return false;
        if (checking)
          return true;
        void this.app.vault.read(file).then((content) => {
          new WritingAssistantModal(this.app, this, content, file.basename, task).open();
        });
        return true;
      }
    });
  }
};
