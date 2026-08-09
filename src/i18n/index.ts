import { Lang, locales } from './locales';

export { Lang, LANG_LABELS } from './locales';

export function t(lang: Lang, key: string, fallback?: string): string {
    const dict = locales[lang];
    if (dict && dict[key]) return dict[key];
    // fallback to zh-CN
    if (lang !== 'zh-CN' && locales['zh-CN'] && locales['zh-CN'][key]) {
        return locales['zh-CN'][key];
    }
    return fallback ?? key;
}

export function getTimeLocale(lang: Lang): string {
    switch (lang) {
        case 'zh-TW': return 'zh-TW';
        case 'en': return 'en-US';
        case 'ja': return 'ja-JP';
        default: return 'zh-CN';
    }
}
