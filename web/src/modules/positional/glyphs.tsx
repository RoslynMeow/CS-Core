import { defaultAlphabet } from '../../lib/alphabet';
import { loadGlobal } from '../../lib/alphabetStorage';

// 位置制各卡的「数码 / 手绘」显示：
//   数码 = 默认字符表（阿拉伯数字，或 数字+字母）
//   手绘 = 用户在字母表工坊里画的字形（未画则显示虚线“空”）
export function defaultGlyph(v: number, base: number): string {
  return defaultAlphabet(base)[v] ?? String(v);
}
export function customGlyph(v: number): string | null {
  const g = loadGlobal();
  return g?.glyphs?.[v] ?? null;
}

export function DigitRows({ digits, base, highlight, only = 'both', label = true }: {
  digits: number[];
  base: number;
  highlight?: number | null;
  only?: 'both' | 'default' | 'custom';
  label?: boolean;
}) {
  return (
    <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
      {only !== 'custom' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
          {label && <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>数码</span>}
          {digits.map((d, i) => (
            <div key={i} className={`digit ${highlight === i ? 'active' : ''}`} style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <strong>{defaultGlyph(d, base)}</strong>
            </div>
          ))}
        </div>
      )}
      {only !== 'default' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
          {label && <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>手绘</span>}
          {digits.map((d, i) => {
            const img = customGlyph(d);
            return (
              <div key={i} className={`digit ${highlight === i ? 'active' : ''}`} style={{ width: 48, height: 48, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', borderStyle: img ? 'solid' : 'dashed' }}>
                {img ? <img src={img} alt="g" style={{ width: 32, height: 32, objectFit: 'contain' }} /> : <span style={{ color: '#94a3b8', fontSize: 11 }}>空</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
