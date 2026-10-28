import { cookies } from 'next/headers';
import { isLang, LANG_COOKIE, translate, type Lang, type T } from './i18n';

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : 'en';
}
export async function getT(): Promise<T> {
  const lang = await getLang();
  return (key, vars) => translate(lang, key, vars);
}
