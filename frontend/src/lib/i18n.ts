import { ar } from './ar';

export type Lang = 'en' | 'ar';
export const LANG_COOKIE = 'lang';
export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'ar';

/** The English text is the key. Missing Arabic falls back to English, so a half-translated page still works. {name} placeholders are filled from vars. */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let out = lang === 'ar' ? ar[key] ?? key : key;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}
export type T = (key: string, vars?: Record<string, string | number>) => string;
