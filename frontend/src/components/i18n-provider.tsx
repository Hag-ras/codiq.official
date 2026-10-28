'use client';
import { createContext, useContext, useMemo } from 'react';
import { translate, type Lang, type T } from '@/lib/i18n';

const Ctx = createContext<Lang>('en');

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}
export const useLang = () => useContext(Ctx);
export function useT(): T {
  const lang = useLang();
  return useMemo<T>(() => (key, vars) => translate(lang, key, vars), [lang]);
}
