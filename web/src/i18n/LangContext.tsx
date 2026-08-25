import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Lang, Text } from './lang';

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (x: Text | string) => string } | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('zh');
  const t = (x: Text | string) => typeof x === 'string' ? x : (x[lang] ?? x.zh);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
export function useLang() {
  const v = useContext(Ctx);
  if (!v) throw new Error('no LangProvider');
  return v;
}
