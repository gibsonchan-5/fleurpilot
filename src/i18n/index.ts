import { Lang, locales } from './locales';

export { Lang, LANG_LABELS } from './locales';

/**
 * 翻译函数，支持 {key} 占位符替换
 * @param lang 目标语言
 * @param key 翻译键
 * @param params 可选 — string（fallback）或 Record<string, string>（占位符替换）
 */
export function t(lang: Lang, key: string, params?: string | Record<string, string>): string {
    let template: string;
    if (typeof params === 'string') {
        template = params;
    } else {
        const dict = locales[lang];
        if (dict && dict[key]) {
            template = dict[key];
        } else if (lang !== 'zh-CN' && locales['zh-CN'] && locales['zh-CN'][key]) {
            template = locales['zh-CN'][key];
        } else {
            template = key;
        }
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                template = template.replaceAll(`{${k}}`, v);
            }
        }
        return template;
    }
    // params is a string (fallback case)
    const dict = locales[lang];
    if (dict && dict[key]) return dict[key];
    if (lang !== 'zh-CN' && locales['zh-CN'] && locales['zh-CN'][key]) {
        return locales['zh-CN'][key];
    }
    return template;
}

export function getTimeLocale(lang: Lang): string {
    switch (lang) {
        case 'zh-TW': return 'zh-TW';
        case 'en': return 'en-US';
        case 'ja': return 'ja-JP';
        default: return 'zh-CN';
    }
}
