import { useLang } from '../i18n/LangContext';
import type { Text } from '../i18n/lang';
import { MathText } from '../lib/tex';

export function Pseudocode({ code, active }: { code: Text[]; active?: number }) {
  const { t, lang } = useLang();
  const items = code.map((line, i) => ({ line, i })).filter(({ line }) => t(line).trim() !== '');
  if (import.meta.env.DEV && active !== undefined) {
    const o = code[active];
    if (active < 0 || active >= code.length || !o || t(o).trim() === '') console.warn(`[Pseudocode] PC=${active} out of range`);
  }
  return (
    <div className="panel pseudo">
      <div className="panel-title">{lang === 'zh' ? '伪代码' : 'Pseudocode'}</div>
      <pre className="code">
        {items.map(({ line, i }, k) => (
          <div key={i} className={`code-line ${active === i ? 'active' : ''}`}>
            <span className="ln">{k + 1}</span><MathText text={t(line)} />
          </div>
        ))}
      </pre>
    </div>
  );
}
