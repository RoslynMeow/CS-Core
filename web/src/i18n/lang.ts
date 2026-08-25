export type Lang = 'zh' | 'en';
export const LANGS: Lang[] = ['zh', 'en'];
export const LANG_LABEL: Record<Lang, string> = { zh: '中', en: 'En' };

export type Text = { zh: string; en: string };
export function T(zh: string, en: string): Text { return { zh, en }; }
